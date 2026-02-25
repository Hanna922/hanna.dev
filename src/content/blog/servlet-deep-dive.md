---
author: Hanna922
pubDatetime: 2026-02-25T10:35:00.000Z
modDatetime:
title: Servlet Initialization Deep Dive With Tomcat
titleEn: Servlet Initialization Deep Dive With Tomcat
featured: false
draft: false
tags:
  - Servlet
  - Tomcat
  - Spring Boot
  - DispatcherServlet
  - Front Controller
  - Deep Dive
description: Tomcat 내부 디버깅부터 Spring의 DispatcherServlet까지 분석해보자
---

이 글은 Apache Tomcat 9.x / Spring Boot 3.x 기준으로 작성되었습니다.

저는 스페인 교환학생 시절 Servlet과 Tomcat을 활용해 웹 서비스를 구축하는 SINT-P2 (https://github.com/Hanna922/SINT-P2) 프로젝트를 진행했습니다. 하지만, 당시에는 Servlet 내부 동작을 디버깅해보진 않았기 때문에 Servlet 객체가 어떻게 초기화되고 관리되는지 깊이 이해하지 못했습니다. 따라서 이번에는 Tomcat 소스 코드를 직접 따라가며 서블릿 객체의 최초 생성 과정을 디버깅하고, Spring의 DispatcherServlet 방식과 저수준 서블릿 방식의 구조적 차이를 분석해보았습니다.

## Prerequisites

**서블릿(Servlet)이란**

서블릿은 Java로 작성된 서버 사이드 컴포넌트로, HTTP 요청을 받아 처리하고 응답을 생성하는 역할을 합니다. 서블릿 컨테이너(Tomcat 등)가 서블릿의 생명주기(생성 → 초기화 → 요청 처리 → 소멸)를 관리합니다.

**서블릿 생명주기**

- **생성**: 서블릿 컨테이너가 서블릿 클래스를 로딩하고 인스턴스를 생성
- **초기화**: `init(ServletConfig)` 호출
- **요청 처리**: `service(req, resp)` → `doGet()`, `doPost()` 등으로 분기
- **소멸**: `destroy()` 호출

**Tomcat의 컨테이너 계층 구조**

Tomcat은 중첩된 컨테이너 구조로 되어 있으며, 각 컨테이너에는 Valve라는 처리기가 파이프라인으로 연결되어 있습니다.

```
Server (Catalina)
  └→ Service
       ├→ Connector (NIO Endpoint, 포트 8080에서 소켓 수신)
       └→ Engine (StandardEngine)
            └→ Host (StandardHost, "localhost")
                 └→ Context (StandardContext, 웹 애플리케이션 단위)
                      └→ Wrapper (StandardWrapper, 서블릿 1개와 1:1 매핑)
```

각 컨테이너는 자신만의 Pipeline + Valve 체인을 가지고 있습니다. 요청은 이 체인을 위에서 아래로 순차적으로 통과합니다.

**예제 서블릿**

이 글 전체에서 디버깅 대상으로 사용할 서블릿입니다.

```java
@WebServlet(urlPatterns = "/servlets/debug")
public class __DebuggingServlet__ extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {
        resp.setContentType("text/html; charset=UTF-8");
        PrintWriter out = resp.getWriter();
        out.println("<html>");
        out.println("<head><title>Hello Servlet</title></head>");
        out.println("<body>");
        out.println("<h1>Hello, Servlet!</h1>");
        out.println("<p>요청 URI: " + req.getRequestURI() + "</p>");
        out.println("</body>");
        out.println("</html>");
    }
}
```

---

# Part 1. 서블릿 객체의 최초 생성 과정 디버깅

이제 `GET /servlets/debug` 요청이 처음 들어왔을 때, Tomcat 내부에서 서블릿 객체가 생성되기까지의 전체 과정을 소스 코드 레벨에서 추적해보겠습니다.

## **1. 소켓 수신 — NioEndpoint**

모든 것은 클라이언트가 TCP 소켓에 바이트를 보내는 것에서 시작됩니다.

```
클라이언트가 GET /servlets/debug HTTP/1.1 전송
      │
      ▼
NioEndpoint (포트 8080 리스닝)
  └→ Acceptor 스레드: 소켓 연결 수락
  └→ Poller 스레드: I/O 이벤트 감지
  └→ 스레드풀에서 워커 스레드 할당 → SocketProcessor.run() 실행
```

Tomcat의 NIO 커넥터가 TCP 소켓에서 바이트 스트림을 수신합니다. 이 시점에서는 아직 HTTP 프로토콜로 파싱되지 않은 원시 바이트 데이터입니다.

## **2. HTTP 파싱 — Http11Processor**

```java
// org.apache.coyote.http11.Http11Processor
public SocketState service(SocketWrapperBase<?> socketWrapper) {
    // HTTP 바이트 스트림을 파싱
    // → 메서드(GET), URI(/servlets/debug), 헤더 등을 Request 객체에 세팅
    getAdapter().service(request, response);
}
```

원시 바이트를 HTTP 프로토콜에 맞게 파싱하여 Tomcat 내부의 `org.apache.coyote.Request` 객체를 만듭니다. 그리고 `CoyoteAdapter`로 넘깁니다.

## **3. URL → 서블릿 매핑 — CoyoteAdapter**

```java
// org.apache.catalina.connector.CoyoteAdapter
public void service(org.apache.coyote.Request req, org.apache.coyote.Response res) {
    // coyote.Request → catalina.Request로 변환
    Request request = ...;
    Response response = ...;

    // ★ URL을 보고 어떤 Host → Context → Wrapper로 갈지 결정
    postParseSuccess = postParseRequest(req, request, res, response);

    // 파이프라인 시작
    connector.getService().getContainer().getPipeline().getFirst().invoke(request, response);
}
```

`postParseRequest()` 내부에서 **Mapper**가 URL을 분석합니다. 이것이 핵심인데, 이 시점에서 이미 **어떤 서블릿이 이 요청을 처리할지 결정**됩니다.

```
URL: /servlets/debug
      │
      ▼
Mapper.map()
  ├→ Host 매핑:    "localhost"에 해당하는 StandardHost 찾음
  ├→ Context 매핑:  "/" (루트 컨텍스트)에 해당하는 StandardContext 찾음
  └→ Wrapper 매핑:  "/servlets/debug" 패턴에 해당하는 StandardWrapper 찾음
                    → @WebServlet(urlPatterns = "/servlets/debug")로 등록된
                      __DebuggingServlet__의 Wrapper
```

매핑 결과는 `request.getMappingData()`에 저장됩니다. 이후 Valve 파이프라인이 시작됩니다.

## **4. Valve 파이프라인 통과**

매핑이 끝나면 컨테이너 계층을 따라 Valve 체인이 순차 실행됩니다. 각 Valve는 `request.getMappingData()`에서 다음 컨테이너를 꺼내 그 컨테이너의 파이프라인을 호출하는 역할입니다.

```
StandardEngineValve.invoke(request, response)
  │  // request에서 Host 정보를 꺼내 해당 Host의 파이프라인으로 전달
  ▼
StandardHostValve.invoke(request, response)
  │  // request에서 Context 정보를 꺼내 해당 Context의 파이프라인으로 전달
  ▼
StandardContextValve.invoke(request, response)
  │  // request에서 Wrapper 정보를 꺼내 해당 Wrapper의 파이프라인으로 전달
  ▼
StandardWrapperValve.invoke(request, response)  ← 여기서 서블릿 획득
```

## **5. StandardWrapperValve.invoke() — 서블릿 획득 시작**

Valve 파이프라인의 가장 안쪽에서 드디어 서블릿 인스턴스를 요청합니다.

```java
// org.apache.catalina.core.StandardWrapperValve
public final void invoke(Request request, Response response) {
    StandardWrapper wrapper = (StandardWrapper) getContainer();
    Servlet servlet = null;

    // ★ 서블릿 인스턴스 획득
    if (!unavailable) {
        servlet = wrapper.allocate();  // ← 🔴 브레이크포인트 ①
    }

    // 필터 체인 구성
    ApplicationFilterChain filterChain =
        ApplicationFilterFactory.createFilterChain(request, wrapper, servlet);

    // 필터 체인 실행 → 최종적으로 servlet.service() 호출
    filterChain.doFilter(request.getRequest(), response.getResponse());
}
```

`wrapper.allocate()`가 호출되면 본격적으로 서블릿 인스턴스를 가져오는 과정이 시작됩니다.

## **6. StandardWrapper.allocate() — 인스턴스 존재 여부 확인**

```java
// org.apache.catalina.core.StandardWrapper
public Servlet allocate() throws ServletException {
    // 싱글톤 방식: instance가 null이면 최초 생성
    if (!singleThreadModel) {
        if (instance == null) {                    // ← 🔴 브레이크포인트 ②
            synchronized (this) {
                if (instance == null) {             // DCL (Double-Checked Locking)
                    instance = loadServlet();       // ★ 여기서 실제 로딩 시작
                }
            }
        }
        countAllocated.incrementAndGet();
        return instance;
    }
}
```

`instance` 필드는 `volatile Servlet instance = null`로 선언되어 있습니다. 첫 요청 시에는 `instance`가 `null`이므로 `synchronized` 블록에 진입하고, **DCL(Double-Checked Locking)** 패턴으로 한 번 더 null 체크를 한 뒤 `loadServlet()`을 호출합니다.

> **DCL(Double-Checked Locking)이란? 🧐**
>
> 멀티스레드 환경에서 동시에 여러 요청이 들어올 경우, 서블릿이 중복 생성되는 것을 방지하기 위한 패턴입니다. 첫 번째 `if`는 `synchronized` 진입 비용을 피하기 위한 것이고, 두 번째 `if`는 락을 획득한 후 다른 스레드가 이미 생성하지 않았는지 재확인하는 것입니다. `volatile` 키워드는 인스턴스의 가시성(visibility)을 보장합니다.

## **7. StandardWrapper.loadServlet() — ★ 서블릿 객체 생성의 핵심**

`loadServlet()`이 서블릿 생성과 초기화를 모두 담당하는 핵심 메서드입니다.

```java
// org.apache.catalina.core.StandardWrapper
public synchronized Servlet loadServlet() throws ServletException {
    // 이미 인스턴스가 있으면 그대로 반환
    if (!singleThreadModel && (instance != null))
        return instance;

    Servlet servlet;
    try {
        // InstanceManager 획득 (부모 Context에서)
        InstanceManager instanceManager =
            ((StandardContext) getParent()).getInstanceManager();

        // ★★★ 서블릿 객체가 최초로 생성되는 바로 이 지점 ★★★
        servlet = (Servlet) instanceManager.newInstance(servletClass);
        //                                              ↑ 🔴 브레이크포인트 ③
        // servletClass = "dev.servlet.step02_servlet_processing.__DebuggingServlet__"

        // init() 호출
        initServlet(servlet);   // ← 🔴 브레이크포인트 ④

    } finally { ... }
    return servlet;
}
```

`instanceManager.newInstance(servletClass)`에서 서블릿 클래스 이름을 **문자열로** 받아 인스턴스를 생성합니다. 이 과정은 컴파일 타임이 아닌 **런타임에 동적으로** 이루어집니다. Tomcat은 사용자가 어떤 서블릿 클래스를 만들지 미리 알 수 없기 때문입니다.

## **8. DefaultInstanceManager.newInstance() — 리플렉션으로 객체 생성**

`instanceManager.newInstance()`의 실체는 `DefaultInstanceManager`에 있습니다.

```java
// org.apache.catalina.core.DefaultInstanceManager
public Object newInstance(String className) throws ... {
    // 1) 클래스 로딩: 문자열에서 Class 객체를 얻습니다
    Class<?> clazz = loadClassMaybePrivileged(className, classLoader);

    // 2) ★★★ 기본 생성자를 리플렉션으로 호출하여 인스턴스 생성 ★★★
    return newInstance(clazz.getConstructor().newInstance(), clazz);
    //                       ↑ 🔴 브레이크포인트 ⑤ (진짜 new가 일어나는 곳)
}
```

이 한 줄을 분해하면 세 단계입니다:

```java
// 1단계: 문자열로 Class 객체를 로딩
Class<?> clazz = Class.forName(
    "dev.servlet.step02_servlet_processing.__DebuggingServlet__"
);

// 2단계: 해당 클래스의 기본 생성자(파라미터 없는 생성자)를 찾음
Constructor<?> constructor = clazz.getConstructor();

// 3단계: 그 생성자를 호출해서 인스턴스 생성
Object instance = constructor.newInstance();
```

이것이 바로 **리플렉션(Reflection)** 입니다. 일반적인 `new __DebuggingServlet__()`과 결과는 동일하지만, 컴파일 시점이 아닌 **런타임에 클래스 이름 문자열만으로 객체를 생성할 수 있다**는 것이 핵심 차이입니다.

> **왜 리플렉션을 사용하는가? 🧐**
>
> Tomcat은 범용 서블릿 컨테이너입니다. 사용자가 어떤 서블릿 클래스를 만들지 컴파일 시점에 알 수 없습니다. `@WebServlet` 어노테이션이나 `web.xml`에서 읽어온 **문자열**만으로 객체를 생성해야 하므로, `new` 키워드 대신 리플렉션을 사용할 수밖에 없습니다.

## **9. StandardWrapper.initServlet() — init() 호출**

객체가 생성된 직후, `initServlet()`이 호출되어 서블릿을 초기화합니다.

```java
// org.apache.catalina.core.StandardWrapper
private synchronized void initServlet(Servlet servlet) throws ServletException {
    try {
        servlet.init(facade);   // ← 🔴 브레이크포인트 ⑥
        // facade = StandardWrapperFacade (ServletConfig 구현체)
    } catch (UnavailableException f) { ... }
}
```

여기서 `servlet.init(facade)`가 호출되면 `GenericServlet.init(ServletConfig config)`으로 진입합니다.

```java
// javax.servlet.GenericServlet
public void init(ServletConfig config) throws ServletException {
    this.config = config;   // ServletConfig 저장
    this.init();            // 오버라이드용 훅 메서드 호출
}

public void init() throws ServletException {
    // 빈 구현 (no-op)
    // 사용자가 커스텀 초기화 로직을 넣고 싶으면 이 메서드를 오버라이드
}
```

`__DebuggingServlet__`에서 `init()`을 오버라이드하지 않았으므로, `ServletConfig` 저장만 수행되고 바로 넘어갑니다.

## **10. 필터 체인 실행 → 서블릿 실행**

`loadServlet()`이 완료되어 서블릿 인스턴스가 반환되면, `StandardWrapperValve`로 돌아와 필터 체인이 구성되고 실행됩니다.

```
ApplicationFilterChain.doFilter()
  └→ 등록된 Filter들 순차 실행
       └→ 체인의 마지막에서 servlet.service(request, response) 호출
            └→ HttpServlet.service()
                 └→ doGet(req, resp)  ← __DebuggingServlet__의 사용자 코드 실행
```

## 전체 콜스택 요약

```
[TCP 소켓 수신]
  NioEndpoint.Acceptor → Poller → SocketProcessor.run()
    │
    ▼
[HTTP 파싱]
  Http11Processor.service()
    │
    ▼
[URL → 서블릿 매핑]
  CoyoteAdapter.service()
    └→ postParseRequest() → Mapper.map()
       결과: Host=localhost, Context=/, Wrapper=__DebuggingServlet__
    │
    ▼
[Valve 파이프라인]
  StandardEngineValve.invoke()
    └→ StandardHostValve.invoke()
         └→ StandardContextValve.invoke()
              └→ StandardWrapperValve.invoke()
                   │
                   ▼
[서블릿 획득 및 생성]
  StandardWrapper.allocate()
    └→ instance == null? (첫 요청이면 yes)
         └→ StandardWrapper.loadServlet()
              ├→ DefaultInstanceManager.newInstance(servletClass)
              │    └→ clazz.getConstructor().newInstance()  ← ★ 객체 생성
              └→ initServlet(servlet)
                   └→ servlet.init(facade)                  ← 초기화
                   │
                   ▼
[필터 + 서블릿 실행]
  ApplicationFilterChain.doFilter()
    └→ Filter들 순차 실행
         └→ servlet.service(request, response)
              └→ __DebuggingServlet__.doGet()                ← 사용자 코드
```

## 디버깅 시 브레이크포인트 정리

| 순위 | 위치                                                                               | 의미                          |
| ---- | ---------------------------------------------------------------------------------- | ----------------------------- |
| ⑤    | `DefaultInstanceManager.newInstance()` 안의 `clazz.getConstructor().newInstance()` | **진짜 객체가 생성되는 지점** |
| ③    | `StandardWrapper.loadServlet()` 안의 `instanceManager.newInstance(servletClass)`   | 로딩 프로세스 시작점          |
| ②    | `StandardWrapper.allocate()` 안의 `if (instance == null)`                          | 최초 요청인지 판별            |
| ④⑥   | `initServlet()` → `servlet.init(facade)`                                           | 초기화 시점                   |
| ①    | `StandardWrapperValve.invoke()` 안의 `wrapper.allocate()`                          | 서블릿 획득 요청 시점         |

가장 간편한 방법은 `__DebuggingServlet__`에 기본 생성자를 명시적으로 추가하고 거기에 브레이크포인트를 거는 것입니다. 콜스택 창에서 위 전체 흐름이 한눈에 보입니다.

```java
public __DebuggingServlet__() {
    super(); // ← 여기에 브레이크포인트
}
```

---

# Part 2. Spring의 DispatcherServlet과 저수준 서블릿의 구조적 차이

Part 1에서 Tomcat이 URL마다 서블릿을 리플렉션으로 동적 생성하는 과정을 살펴보았습니다. Spring은 이와 근본적으로 다른 구조를 취합니다.

## **1. 저수준 서블릿 방식: URL마다 서블릿 1개**

저수준 서블릿 방식에서는 각 URL 패턴마다 별도의 서블릿 클래스가 필요합니다.

```
클라이언트 요청                    Tomcat이 관리하는 서블릿들
                              ┌─────────────────────────────┐
GET /users    ──────────────→ │ UsersServlet     (Wrapper)   │
GET /orders   ──────────────→ │ OrdersServlet    (Wrapper)   │
GET /products ──────────────→ │ ProductsServlet  (Wrapper)   │
                              └─────────────────────────────┘
```

Tomcat이 URL을 보고 해당 `StandardWrapper`를 찾아 `allocate()`를 호출합니다. Part 1에서 본 것처럼 첫 요청 시 `instanceManager.newInstance(servletClass)`로 리플렉션을 통해 서블릿 객체를 생성합니다. 서블릿이 10개 필요하면 Tomcat이 10번 리플렉션으로 각각 생성합니다. **Tomcat이 URL 라우팅과 서블릿 생명주기를 모두 직접 관리**하는 구조입니다.

이 방식의 문제점은 모든 서블릿에서 공통 로직이 중복된다는 것입니다.

```java
public class UsersServlet extends HttpServlet {
    protected void doGet(...) {
        // 인코딩 설정 (중복)
        // 인증 확인 (중복)
        // 로깅 (중복)
        // 실제 비즈니스 로직
    }
}

public class OrdersServlet extends HttpServlet {
    protected void doGet(...) {
        // 인코딩 설정 (중복)
        // 인증 확인 (중복)
        // 로깅 (중복)
        // 실제 비즈니스 로직
    }
}
```

## **2. Front Controller 패턴: 하나의 진입점**

Front Controller는 디자인 패턴으로, **하나의 진입점이 모든 요청을 받아서 적절한 핸들러에 위임**하는 구조입니다. Spring의 `DispatcherServlet`이 바로 이 패턴의 구현체입니다.

```
클라이언트 요청                  Tomcat              Spring
                           ┌──────────┐     ┌──────────────────────┐
GET /users    ───────────→ │          │     │  HandlerMapping      │
GET /orders   ───────────→ │ Dispatch │────→│    ↓                 │
GET /products ───────────→ │ erServlet│     │  UserController      │
POST /users   ───────────→ │ (단 1개) │     │  OrderController     │
                           └──────────┘     │  ProductController   │
                                            └──────────────────────┘
```

**Tomcat 입장에서 서블릿은 DispatcherServlet 단 1개**입니다. 모든 요청이 `"/"`로 매핑된 이 하나의 서블릿으로 들어옵니다. URL에 따라 어떤 컨트롤러 메서드를 호출할지는 Tomcat이 아니라 **Spring이 결정**합니다.

## **3. 객체 생성 방식의 근본적 차이**

두 방식의 가장 핵심적인 차이는 **누가, 언제, 어떻게** 객체를 생성하는가입니다.

**저수준 서블릿: Tomcat이 리플렉션으로 생성 (Lazy)**

```java
// Tomcat의 DefaultInstanceManager — 첫 요청 시점에 호출됨
clazz.getConstructor().newInstance()
// → URL마다 각각의 서블릿을 동적 생성
```

**Spring: Spring IoC 컨테이너가 빈으로 생성 (Eager)**

```java
// DispatcherServletAutoConfiguration 내부
@Bean
public DispatcherServlet dispatcherServlet() {
    return new DispatcherServlet();  // Spring이 직접 new로 생성
}
```

DispatcherServlet은 Spring이 빈으로 미리 만들어서 Tomcat에 등록합니다. `@Controller` 클래스들도 Spring이 컴포넌트 스캔으로 빈으로 생성합니다. **Tomcat의 리플렉션 기반 동적 생성이 아니라, 애플리케이션 시작 시점에 Spring 컨테이너가 모두 생성해놓는 것**입니다.

## **4. Spring Boot에서 DispatcherServlet이 등록되는 과정**

Spring Boot가 시작되면 DispatcherServlet이 Tomcat에 등록되기까지 다음과 같은 과정을 거칩니다.

### SpringApplication.run() — 부트스트랩 시작

```java
@SpringBootApplication
public class MyApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

`@SpringBootApplication`은 어노테이션(메타데이터)일 뿐이고, 실제 실행 흐름은 `SpringApplication.run()`에서 시작됩니다.

### 웹 애플리케이션 타입 결정

`SpringApplication` 생성자에서 `WebApplicationType.deduceFromClasspath()`가 호출됩니다.

```java
// org.springframework.boot.WebApplicationType
static WebApplicationType deduceFromClasspath() {
    if (ClassUtils.isPresent(WEBFLUX_INDICATOR_CLASS, null)
        && !ClassUtils.isPresent(WEBMVC_INDICATOR_CLASS, null)
        && !ClassUtils.isPresent(JERSEY_INDICATOR_CLASS, null)) {
        return WebApplicationType.REACTIVE;
    }
    for (String className : SERVLET_INDICATOR_CLASSES) {
        if (!ClassUtils.isPresent(className, null)) {
            return WebApplicationType.NONE;
        }
    }
    return WebApplicationType.SERVLET;
}
```

`spring-boot-starter-web` 의존성이 있으면 `DispatcherServlet`과 `Servlet` 클래스가 클래스패스에 존재하므로 `SERVLET`으로 결정됩니다.

### ApplicationContext 생성 및 Auto-Configuration

웹 타입이 `SERVLET`이면 `AnnotationConfigServletWebServerApplicationContext`가 생성되고, Auto-Configuration에 의해 다음 빈들이 등록됩니다:

- `TomcatServletWebServerFactory` — 내장 Tomcat을 만드는 팩토리
- `DispatcherServlet` — 모든 HTTP 요청을 받는 프론트 컨트롤러
- `DispatcherServletRegistrationBean` — DispatcherServlet을 서블릿으로 등록하는 역할

### context.refresh() → 내장 Tomcat 생성

`context.refresh()` 과정에서 `onRefresh()`가 호출되면 본격적으로 내장 Tomcat이 생성됩니다.

```java
// org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext
private void createWebServer() {
    ServletWebServerFactory factory = getWebServerFactory();
    // → TomcatServletWebServerFactory가 반환됨

    this.webServer = factory.getWebServer(getSelfInitializer());
}
```

### TomcatServletWebServerFactory.getWebServer() — Tomcat 인스턴스 생성

```java
// org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory
public WebServer getWebServer(ServletContextInitializer... initializers) {
    Tomcat tomcat = new Tomcat();

    Connector connector = new Connector(this.protocol);
    connector.setPort(getPort());   // 기본 8080
    tomcat.getService().addConnector(connector);

    prepareContext(tomcat.getHost(), initializers);

    return getTomcatWebServer(tomcat);
}
```

### prepareContext() → DispatcherServlet을 Tomcat에 등록

`prepareContext()` 과정에서 `ServletContextInitializer`들이 적용됩니다.

```
prepareContext()
  └→ TomcatStarter (ServletContainerInitializer 구현체) 등록
       └→ 서버 시작 시 onStartup() 호출됨
            └→ DispatcherServletRegistrationBean.onStartup()
                 └→ servletContext.addServlet("dispatcherServlet", dispatcherServlet)
                 └→ registration.setLoadOnStartup(1)  ← 서버 시작 시 즉시 초기화
                 └→ registration.addMapping("/")       ← 모든 요청을 매핑
```

이 시점에서 DispatcherServlet이 Tomcat의 `StandardWrapper`로 래핑되어 등록됩니다. `loadOnStartup = 1`이므로 Tomcat 시작 시 `StandardContext.loadOnStartup()`에 의해 바로 초기화됩니다.

```
StandardContext.startInternal()
  └→ loadOnStartup(findChildren())
       └→ StandardWrapper.load()
            └→ loadServlet()
                 └→ initServlet(servlet)
                      └→ servlet.init(config)  ← DispatcherServlet.init() 호출
```

> **저수준 서블릿과의 차이 포인트!**
>
> 저수준 서블릿에서는 `loadServlet()` 안에서 `instanceManager.newInstance()`로 리플렉션을 통해 객체를 생성했습니다. 하지만 Spring Boot의 경우, DispatcherServlet은 **Spring이 이미 빈으로 생성해서 Tomcat에 넘겨준 상태**이므로, Tomcat은 리플렉션으로 새로 생성하지 않고 이미 존재하는 인스턴스의 `init()`만 호출합니다.

## **5. HTTP 요청이 처리되는 과정 비교**

### 저수준 서블릿에서의 요청 처리

```
GET /servlets/debug
  │
  ▼
Tomcat Mapper: "/servlets/debug" → StandardWrapper(__DebuggingServlet__)
  │
  ▼
StandardWrapperValve.invoke()
  └→ wrapper.allocate() → __DebuggingServlet__ 인스턴스 반환
  └→ FilterChain → servlet.service()
       └→ __DebuggingServlet__.doGet()  ← 직접 처리
```

**Tomcat이 URL 라우팅부터 서블릿 실행까지 모든 것을 담당**합니다.

### Spring에서의 요청 처리

```
GET /api/users
  │
  ▼
Tomcat Mapper: "/" → StandardWrapper(DispatcherServlet)
  │  (모든 URL이 DispatcherServlet 하나로 매핑)
  ▼
StandardWrapperValve.invoke()
  └→ wrapper.allocate() → DispatcherServlet 인스턴스 반환
  └→ FilterChain → servlet.service()
       └→ DispatcherServlet.doDispatch()  ← 여기서부터 Spring의 영역
```

`DispatcherServlet.doDispatch()`가 Spring MVC의 핵심입니다.

```java
// org.springframework.web.servlet.DispatcherServlet
protected void doDispatch(HttpServletRequest request, HttpServletResponse response) {

    // 1. HandlerMapping에게 물어봄: "GET /api/users를 누가 처리하지?"
    HandlerExecutionChain handler = getHandler(request);
    // → RequestMappingHandlerMapping이 @GetMapping("/api/users")가 붙은
    //   UserController.getUsers() 메서드를 찾아서 반환

    // 2. HandlerAdapter 조회: "이 핸들러를 실행할 수 있는 어댑터는?"
    HandlerAdapter adapter = getHandlerAdapter(handler.getHandler());
    // → RequestMappingHandlerAdapter 선택

    // 3. 인터셉터 preHandle 실행

    // 4. 실제 컨트롤러 메서드 호출
    ModelAndView mv = adapter.handle(request, response, handler.getHandler());
    // → UserController.getUsers()가 리플렉션으로 호출됨

    // 5. 인터셉터 postHandle 실행

    // 6. 응답 처리 (View 렌더링 또는 @ResponseBody 직렬화)
}
```

여기서 `adapter.handle()` 안에서 컨트롤러 메서드를 호출할 때에도 리플렉션이 사용됩니다. 하지만 이것은 Tomcat이 서블릿을 생성하기 위한 리플렉션이 아니라, **Spring이 이미 존재하는 빈의 메서드를 호출하기 위한 리플렉션**이라는 차이가 있습니다.

## **6. 두 방식의 전체 비교**

|                     | 저수준 서블릿                                                 | Spring (DispatcherServlet)                              |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| **서블릿 개수**     | URL 패턴마다 1개                                              | 전체 애플리케이션에 1개                                 |
| **URL 라우팅 주체** | Tomcat (Mapper → StandardWrapper)                             | Spring (HandlerMapping)                                 |
| **객체 생성 주체**  | Tomcat (리플렉션, 첫 요청 시)                                 | Spring IoC (빈, 애플리케이션 시작 시)                   |
| **객체 생성 시점**  | Lazy (첫 요청 시 `loadServlet()`)                             | Eager (컨테이너 시작 시 빈 등록)                        |
| **리플렉션 용도**   | 서블릿 인스턴스 생성 (`clazz.getConstructor().newInstance()`) | 컨트롤러 메서드 호출 (`method.invoke()`)                |
| **공통 로직 처리**  | 각 서블릿에서 중복 구현                                       | DispatcherServlet에서 일괄 처리                         |
| **Tomcat의 역할**   | URL 라우팅 + 서블릿 생명주기 전체 관리                        | 네트워크 통신 + DispatcherServlet 1개의 생명주기만 관리 |

결론적으로, Spring의 DispatcherServlet은 Tomcat 위에서 동작하는 서블릿이긴 하지만, **Tomcat의 서블릿 관리 기능 대부분을 Spring이 자체적으로 대체**한 구조입니다. Tomcat은 네트워크 통신과 DispatcherServlet 하나의 생명주기만 관리하고, 나머지 라우팅과 컨트롤러 관리는 전부 Spring이 담당합니다. 전통적인 외장 Tomcat에서는 Tomcat이 먼저 있고 그 위에 Spring이 올라가지만, Spring Boot에서는 **Spring이 먼저 시작되고 Spring이 Tomcat을 내장 객체로 생성하여 제어**한다는 것이 가장 큰 구조적 차이입니다.

## Closing Thoughts (๑╹o╹)✎

이번 글을 작성하면서 평소에 당연하게 사용하던 서블릿과 Spring Boot의 내부 동작을 소스 코드 레벨에서 추적할 수 있었습니다. 특히 `DefaultInstanceManager.newInstance()`에서 리플렉션으로 서블릿 객체가 생성되는 지점과, Spring Boot가 DispatcherServlet을 Tomcat에 등록하는 과정이 인상 깊었습니다.

틀린 내용이 있다면 댓글로 알려주세요. 🙇🏻‍♀️

## References

- [Apache Tomcat 9 Source Code — StandardWrapper.java](https://github.com/apache/tomcat/blob/main/java/org/apache/catalina/core/StandardWrapper.java)
- [Apache Tomcat 9 Source Code — DefaultInstanceManager.java](https://github.com/apache/tomcat/blob/main/java/org/apache/catalina/core/DefaultInstanceManager.java)
- [Spring Boot Reference — Servlet Web Applications](https://docs.spring.io/spring-boot/reference/web/servlet.html)
- [Spring Boot Source Code — DispatcherServletAutoConfiguration](https://github.com/spring-projects/spring-boot/blob/main/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/web/servlet/DispatcherServletAutoConfiguration.java)
- [Tomcat & Spring Bootstrapping Sequence](https://medium.com/chequer/tomcat-spring-bootstrapping-sequence-3%ED%8E%B8-http-43c789078e3)
