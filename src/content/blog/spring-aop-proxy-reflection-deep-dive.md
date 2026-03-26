---
author: Hanna922
pubDatetime: 2026-03-18T10:00:00.000Z
modDatetime:
title: Spring AOP Deep Dive — 프록시 패턴부터 리플렉션 기반 DI 컨테이너까지
titleEn: Spring AOP Deep Dive — From Proxy Pattern to Reflection-based DI Container
featured: false
draft: false
tags:
  - Spring AOP
  - Proxy Pattern
  - Dynamic Proxy
  - Reflection
  - IoC
  - Deep Dive
description: 수동 프록시 → JDK Dynamic Proxy → 리플렉션 API를 거쳐, 직접 DI 컨테이너를 만들어보며 Spring AOP의 동작 원리를 이해해보자
---

이 글은 Spring Framework 6.x / Java 17+ 기준으로 작성되었습니다.

이전 글 [Servlet Initialization Deep Dive With Tomcat](https://hanna-dev.co.kr)에서 Tomcat이 서블릿 객체를 리플렉션으로 동적 생성하는 과정을 소스 코드 레벨에서 추적했습니다. 그 과정에서 `DefaultInstanceManager.newInstance()` 안의 `clazz.getConstructor().newInstance()`가 핵심이었는데, 이번에는 **그 리플렉션이 Spring AOP에서 어떻게 확장되어 사용되는지**를 추적해보았습니다. 수동 프록시 구현부터 시작해서 JDK Dynamic Proxy, 리플렉션 API를 거쳐 직접 DI 컨테이너를 만들어보는 과정까지, 단계별로 코드를 작성하며 Spring AOP의 동작 원리를 이해해보겠습니다.

## Prerequisites

**AOP(Aspect-Oriented Programming)란**

AOP는 관점 지향 프로그래밍으로, 핵심 비즈니스 로직(Core Concern)과 로깅·인증·트랜잭션 같은 부가 기능(Cross-Cutting Concern, 횡단 관심사)을 **분리**하는 프로그래밍 패러다임입니다. 횡단 관심사가 여러 모듈에 걸쳐 중복되는 문제를 해결합니다.

**AOP 핵심 용어**

- **Aspect** — 하나의 횡단 관심사를 모듈화한 클래스. 로깅이라는 관심사를 `LoggingAspect` 클래스로 분리하는 것이 대표적인 예시입니다.
- **Advice** — Aspect 안에서 실제로 실행되는 메서드. `@Before`, `@After`, `@Around` 등으로 실행 시점을 지정합니다.
- **Pointcut** — Advice를 적용할 대상 메서드를 선별하는 표현식. `execution(* dev.aop.controller.*Controller.*(..))` 같은 패턴으로 작성합니다.
- **JoinPoint** — Advice가 적용될 수 있는 지점. Spring AOP에서는 항상 **메서드 호출 시점**입니다.
- **Target** — Advice가 적용되는 실제 대상 객체.
- **Proxy** — Target을 감싸서 Advice를 실행해주는 대리 객체.

**프록시(Proxy)란**

프록시는 **대리자** 역할을 하는 객체입니다. 클라이언트가 Target 객체를 직접 호출하는 대신 Proxy를 통해 호출하면, Proxy가 호출 전후에 부가 로직(Advice)을 실행한 뒤 Target에게 작업을 위임합니다. Spring AOP의 핵심 메커니즘이 바로 이 프록시입니다.

```
클라이언트 ──→ 프록시(Proxy) ──→ 타겟(Target)
                │                    │
                │ Before Advice      │ 비즈니스 로직
                │ After Advice       │
                └────────────────────┘
```

---

# Part 1. 수동 프록시 구현 — 왜 AOP가 필요한가

AOP를 이해하려면 먼저 **AOP 없이** 횡단 관심사를 처리하면 어떤 문제가 생기는지 직접 겪어봐야 합니다.

## **1. AOP 적용 전: 비즈니스 로직에 로깅이 섞인 상태**

가장 단순한 `UserController`를 살펴보겠습니다.

```java
public class UserController {
    Logger logger = Logger.getLogger("UserController");

    public List<User> getUsers() {
        logger.info("GET: getUsers() 호출 전");  // ← 로깅 (횡단 관심사)

        List<User> users = new ArrayList<>();
        users.add(new User(1, "Tom"));
        users.add(new User(2, "Jerry"));

        logger.info("GET: getUsers() 호출 후");  // ← 로깅 (횡단 관심사)
        return users;
    }
}
```

지금은 `getUsers()` 하나뿐이라 괜찮아 보입니다. 하지만 컨트롤러가 늘어나면 문제가 드러납니다.

```java
// OrderController에서도 동일한 로깅 코드가 중복됨
public class OrderController {
    public List<Order> getOrders() {
        logger.info("GET: getOrders() 호출 전");  // 중복!
        // ... 비즈니스 로직
        logger.info("GET: getOrders() 호출 후");  // 중복!
        return orders;
    }
}
```

이전 글에서 저수준 서블릿 방식의 문제점으로 "모든 서블릿에서 공통 로직(인코딩, 인증, 로깅)이 중복된다"고 지적했는데, 여기서도 **정확히 같은 문제**가 발생합니다. 로깅 형식을 바꾸려면 모든 컨트롤러를 하나하나 수정해야 하고, 실수로 빠뜨리기도 쉽습니다.

## **2. 프록시 패턴으로 분리 시도**

횡단 관심사를 비즈니스 로직으로부터 분리하기 위해 **프록시 패턴**을 적용해봅니다.

```
클라이언트(AppClient)
      │
      ▼
GreetingServiceProxy (프록시 객체)
      │  1. 부가 로직 실행 ("접근을 가로챔")
      │  2. Target에 위임
      ▼
GreetingServiceImpl (타겟 객체)
      │  실제 비즈니스 로직 ("Hello, World!")
      ▼
결과 반환
```

먼저 Target과 Proxy가 공통으로 구현할 인터페이스를 정의합니다.

```java
// Target 객체의 인터페이스
// Proxy도 동일한 인터페이스를 구현 → 클라이언트 입장에서 Target을 호출하는 것처럼 보임
public interface GreetingService {
    void sayHello();
}
```

Target 구현체는 순수한 비즈니스 로직만 담습니다.

```java
public class GreetingServiceImpl implements GreetingService {
    @Override
    public void sayHello() {
        System.out.println("GreetingService: Hello, World!");
    }
}
```

Proxy는 Target과 동일한 인터페이스를 구현하되, **호출을 가로채서** 부가 로직을 실행한 뒤 Target에 위임합니다.

```java
public class GreetingServiceProxy implements GreetingService {

    private GreetingServiceImpl targetService;

    @Override
    public void sayHello() {
        if (targetService == null) {
            // 실제 호출 전까지 Target 객체의 생성을 지연(Lazy)
            targetService = new GreetingServiceImpl();
        }

        // ★ 프록시만의 부가 로직
        System.out.println("Proxy가 GreetingServiceImpl로의 접근을 가로챔");

        // 실제 Target에 작업 위임
        targetService.sayHello();
    }
}
```

클라이언트 코드에서는 Proxy를 통해 호출합니다.

```java
public class AppClient {
    public static void main(String[] args) {
        // 타겟이 아닌 프록시 객체 생성
        GreetingService greetingService = new GreetingServiceProxy();

        greetingService.sayHello();
        // 출력:
        // "Proxy가 GreetingServiceImpl로의 접근을 가로챔"
        // "GreetingService: Hello, World!"
    }
}
```

클라이언트 입장에서는 `GreetingService` 인터페이스만 알면 되므로, Target을 직접 호출하는 것과 코드가 동일합니다. 이것이 **프록시 패턴의 핵심**입니다.

> **프록시의 Lazy Initialization 🧐**
>
> `GreetingServiceProxy`에서 `targetService`를 `sayHello()` 호출 시점에 생성하는 것은 **Lazy Initialization** 패턴입니다. 이전 글에서 Tomcat의 `StandardWrapper.allocate()`가 첫 요청 시에만 서블릿을 생성했던 것과 같은 개념입니다. 실제로 필요해질 때까지 무거운 객체의 생성을 미루는 것이죠.

## **3. 수동 프록시의 한계**

같은 방식으로 `MouseService`에도 프록시를 적용해보겠습니다.

```java
public interface MouseService {
    void save(Mouse mouse);
}

public class MouseServiceProxy implements MouseService {
    MouseService mouseService;

    public MouseServiceProxy(MouseService mouseService) {
        this.mouseService = mouseService;
    }

    @Override
    public void save(Mouse mouse) {
        System.out.println("before save...");      // 부가 로직
        mouseService.save(mouse);                   // Target 위임
        System.out.println("after save...");        // 부가 로직
    }
}
```

여기까지는 잘 동작합니다. 하지만 `MouseService`에 `update()` 메서드가 추가되면 어떨까요?

```java
public interface MouseService {
    void save(Mouse mouse);
    void update(Mouse mouse);  // ← 새로운 메서드 추가
}
```

프록시에도 `update()`를 구현해야 합니다. 만약 이 메서드에도 로깅을 적용하려면 **동일한 before/after 코드를 또 작성**해야 합니다.

```java
@Override
public void update(Mouse mouse) {
    System.out.println("before update...");  // 중복!
    mouseService.update(mouse);
    System.out.println("after update...");   // 중복!
}
```

서비스가 10개이고 각 서비스에 메서드가 5개라면, 프록시 클래스 10개에 메서드 50개를 일일이 작성해야 합니다. **수동 프록시는 확장에 취약합니다.**

```
문제 정리:
  1. 새로운 서비스마다 프록시 클래스를 직접 만들어야 함
  2. 새로운 메서드마다 프록시 처리 코드가 중복됨
  3. 부가 로직의 변경 시 모든 프록시를 수정해야 함
```

이 문제를 해결하려면 프록시를 매번 직접 만드는 것이 아니라, **런타임에 동적으로 생성**할 수 있어야 합니다.

---

# Part 2. Spring AOP로 횡단 관심사 분리

Part 1에서 수동 프록시의 한계를 확인했습니다. Spring은 이 문제를 **AOP 프레임워크**로 해결합니다. 두 가지 방식을 순서대로 살펴보겠습니다.

## **1. ProxyFactoryBean 방식 (XML 기반)**

Spring의 `ProxyFactoryBean`은 프록시 객체를 **빈으로 자동 생성**해주는 팩토리입니다.

먼저, 부가 로직(Advice)을 별도 클래스로 분리합니다.

```java
// 프록시가 어느 시점에 어떻게 동작할지 정의하는 클래스
public class SimpleAdvice implements MethodBeforeAdvice {

    Logger logger = Logger.getLogger("SimpleAdvice");

    @Override
    public void before(Method method, Object[] args, Object target) throws Throwable {
        logger.info("GET: getUsers() 호출 전");
        // 이후 내부적으로 실제 Target 객체의 메서드가 호출됨
    }
}
```

`MethodBeforeAdvice`는 **Target 메서드 호출 전**에 실행할 로직을 정의하는 인터페이스입니다. `before()` 메서드의 파라미터로 호출될 메서드 정보(`Method`), 인자(`Object[]`), 대상 객체(`Object target`)가 전달됩니다.

XML 설정으로 프록시를 구성합니다.

```xml
<!-- Target: AOP를 적용할 실제 대상 빈 -->
<bean id="userController" class="dev.aop.UserController" />

<!-- Advice: 부가 로직을 담은 빈 -->
<bean id="simpleAdvice" class="dev.aop.SimpleAdvice" />

<!-- ProxyFactoryBean: 프록시 객체를 생성하는 팩토리 빈 -->
<bean id="proxyFactoryBean" class="org.springframework.aop.framework.ProxyFactoryBean">
    <!-- target: 실제 대상 빈 참조 -->
    <property name="target" ref="userController" />
    <!-- interceptorNames: 적용할 Advice 목록 -->
    <property name="interceptorNames">
        <list>
            <value>simpleAdvice</value>
        </list>
    </property>
</bean>
```

클라이언트 코드에서는 **프록시 빈**을 주입받아 사용합니다.

```java
public class AfterAOP {
    public static void main(String[] args) {
        var context = new ClassPathXmlApplicationContext("beans.xml");

        // ★ "proxyFactoryBean"으로 가져오면 프록시 객체가 반환됨
        UserController controller = (UserController) context.getBean("proxyFactoryBean");

        List<User> users = controller.getUsers();
        System.out.println("users = " + users);
    }
}
```

내부 동작 흐름을 다이어그램으로 정리하면 다음과 같습니다.

```
context.getBean("proxyFactoryBean")
      │
      ▼
ProxyFactoryBean
  ├→ target = UserController 빈 참조
  ├→ interceptorNames = [simpleAdvice]
  └→ 프록시 객체 생성 후 반환
      │
      ▼
controller.getUsers() 호출
      │
      ▼
프록시 객체가 가로챔
  ├→ SimpleAdvice.before() 실행  ← "GET: getUsers() 호출 전"
  └→ UserController.getUsers() 위임  ← 실제 비즈니스 로직
      │
      ▼
결과 반환: [User [id=1, name=Tom], User [id=2, name=Jerry]]
```

> **수동 프록시와의 차이 🧐**
>
> Part 1에서는 `GreetingServiceProxy` 클래스를 직접 작성해야 했습니다. `ProxyFactoryBean`을 사용하면 **프록시 클래스를 직접 작성할 필요가 없습니다.** Spring이 런타임에 프록시 객체를 동적으로 생성해주기 때문입니다. 부가 로직(Advice)만 별도 클래스로 작성하면 됩니다.

## **2. @Aspect 방식 (어노테이션 기반)**

`ProxyFactoryBean` + XML 방식은 동작하지만, 빈 하나마다 XML에 프록시 설정을 추가해야 하는 번거로움이 있습니다. Spring은 **@Aspect 어노테이션**으로 이를 더 간결하게 만듭니다.

```java
@Aspect     // 이 클래스가 AOP의 Aspect임을 선언
@Component  // Spring 빈으로 등록
@Slf4j      // Lombok 로깅
public class LoggingAspect {

    // Pointcut 표현식: dev.aop.controller 패키지의 XxxController 클래스의 모든 메서드에 적용
    @Before(value = "execution(* dev.aop.controller.*Controller.*(..))")
    public void logBefore(JoinPoint joinPoint) {

        // 호출된 클래스명과 메서드명을 동적으로 로깅
        log.debug(" {}'의 {} 호출됨",
                joinPoint.getTarget().getClass().getSimpleName(),
                joinPoint.getSignature().getName()
        );

        // 전달된 인자도 로깅
        Object[] args = joinPoint.getArgs();
        for (int i = 0; i < args.length; i++) {
            log.debug("args[" + i + "] -->" + args[i]);
        }
    }
}
```

Pointcut 표현식을 분해해보겠습니다.

```
execution(* dev.aop.controller.*Controller.*(..))
           │  │                  │          │ │
           │  │                  │          │ └→ 파라미터: 있든 없든 상관없음
           │  │                  │          └→ 메서드명: 아무거나
           │  │                  └→ 클래스명: XxxController로 끝나는 것
           │  └→ 패키지: dev.aop.controller 하위
           └→ 반환타입: 아무거나
```

이제 컨트롤러는 순수한 비즈니스 로직만 담습니다.

```java
@Component
@Slf4j
public class OwnerController {

    public void getOwners() {
        // 로깅 코드가 사라짐!
        // 순수 비즈니스 로직만 존재
    }

    public void addOwner(Owner owner) {
        // 순수 비즈니스 로직만 존재
    }
}
```

실행 결과를 추적하면 다음과 같습니다.

```
controller.getOwners() 호출
  │
  ▼
Spring AOP 프록시가 가로챔
  └→ LoggingAspect.logBefore() 실행
       │  log.debug("OwnerController'의 getOwners 호출됨")
       │  args: (없음)
       ▼
  └→ OwnerController.getOwners() 실행 (Target)

controller.addOwner(new Owner(1, "gugu")) 호출
  │
  ▼
Spring AOP 프록시가 가로챔
  └→ LoggingAspect.logBefore() 실행
       │  log.debug("OwnerController'의 addOwner 호출됨")
       │  log.debug("args[0] -->Owner{id=1, name='gugu'}")
       ▼
  └→ OwnerController.addOwner() 실행 (Target)
```

## **3. 두 방식 비교**

|                      | ProxyFactoryBean (XML)               | @Aspect (어노테이션)                      |
| -------------------- | ------------------------------------ | ----------------------------------------- |
| **설정 위치**        | beans.xml                            | Java 클래스 내 어노테이션                 |
| **프록시 대상 지정** | 빈 하나당 XML 설정 필요              | Pointcut 표현식으로 패턴 매칭             |
| **Advice 정의**      | `MethodBeforeAdvice` 인터페이스 구현 | `@Before`, `@After`, `@Around` 어노테이션 |
| **확장성**           | 대상이 늘어날수록 XML 비대           | 패턴 하나로 다수의 대상에 일괄 적용       |
| **JoinPoint 정보**   | `Method`, `Object[]`, `Object`       | `JoinPoint` 객체로 통합 제공              |

어노테이션 기반 @Aspect가 현대 Spring 애플리케이션의 표준입니다. 하지만 두 방식 모두 **내부적으로는 프록시 객체를 동적으로 생성**한다는 점은 동일합니다. 그렇다면 Spring은 프록시를 어떻게 동적으로 생성할까요?

---

# Part 3. JDK Dynamic Proxy — 런타임 프록시 생성

Part 1에서 수동 프록시의 한계를 확인했고, Part 2에서 Spring AOP가 이를 해결하는 것을 보았습니다. 이제 그 내부 메커니즘인 **JDK Dynamic Proxy**를 직접 구현해봅니다.

## **1. JDK Dynamic Proxy란**

Java 표준 라이브러리(`java.lang.reflect.Proxy`)가 제공하는 기능으로, **인터페이스 기반의 프록시 객체를 런타임에 동적으로 생성**합니다. 수동 프록시처럼 프록시 클래스를 직접 작성하지 않아도 됩니다.

```
수동 프록시:    컴파일 시점에 프록시 클래스(.java) 직접 작성
Dynamic Proxy: 런타임 시점에 JVM이 프록시 클래스를 메모리에 생성
```

## **2. InvocationHandler — 프록시의 두뇌**

Dynamic Proxy의 핵심은 `InvocationHandler` 인터페이스입니다. 프록시 객체의 모든 메서드 호출이 이 핸들러의 `invoke()`로 집중됩니다.

```java
public class MouseInvocationHandler implements InvocationHandler {

    // 실제 타겟 객체
    MouseService mouseService = new MouseServiceImpl();

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        if (method.getName().equals("save")) {
            // save() 호출 시에만 부가 로직 적용
            System.out.println("before save...");
            Object result = method.invoke(mouseService, args);  // ★ Target 호출
            System.out.println("after save...");
            return result;
        }

        // save가 아닌 메서드는 부가 로직 없이 바로 Target 호출
        return method.invoke(mouseService, args);
    }
}
```

여기서 `method.invoke(mouseService, args)`가 핵심입니다. 이것은 **리플렉션을 통한 메서드 호출**로, 이전 글에서 Spring의 `DispatcherServlet.doDispatch()` 안에서 컨트롤러 메서드를 호출할 때 사용되는 `method.invoke()`와 동일한 메커니즘입니다.

## **3. 프록시 객체 생성**

`Proxy.newProxyInstance()`로 런타임에 프록시를 생성합니다.

```java
public class AppClient {
    public static void main(String[] args) {

        InvocationHandler handler = new MouseInvocationHandler();

        // ★ 프록시 객체를 런타임에 생성
        MouseService mouseService = (MouseService) Proxy.newProxyInstance(
                MouseService.class.getClassLoader(),    // 클래스 로더
                new Class[] { MouseService.class },     // 프록시가 구현할 인터페이스
                handler                                  // 호출 처리기
        );

        mouseService.save(new Mouse(1, "제리"));
        // 출력:
        // before save...
        // save: 제리
        // after save...

        mouseService.update(new Mouse(2, "제이미"));
        // 출력:
        // update: 제이미   ← save가 아니므로 부가 로직 없이 바로 실행
    }
}
```

`Proxy.newProxyInstance()`의 세 파라미터를 분해하면 다음과 같습니다.

```
Proxy.newProxyInstance(
    MouseService.class.getClassLoader(),  // ① 어떤 클래스 로더로 프록시 클래스를 로딩할지
    new Class[] { MouseService.class },   // ② 프록시가 구현할 인터페이스 목록
    handler                                // ③ 메서드 호출 시 실행할 InvocationHandler
)
```

내부적으로 JVM은 다음과 같은 일을 합니다.

```
Proxy.newProxyInstance() 호출
      │
      ▼
JVM이 메모리에 프록시 클래스 생성
  └→ $Proxy0 implements MouseService
       │
       │  모든 메서드 호출을 handler.invoke()로 위임
       │
       ▼
mouseService.save(mouse) 호출
      │
      ▼
$Proxy0.save(mouse)
  └→ handler.invoke(proxy, saveMethod, [mouse])
       ├→ "before save..."
       ├→ method.invoke(mouseService, args)  ← 리플렉션으로 Target 호출
       └→ "after save..."
```

> **수동 프록시 대비 개선점 🧐**
>
> 수동 프록시에서는 `MouseServiceProxy` 클래스를 직접 작성하고, 메서드가 추가될 때마다 프록시 코드를 수정해야 했습니다. JDK Dynamic Proxy에서는 `InvocationHandler.invoke()` **하나의 메서드**에서 모든 호출을 처리합니다. 메서드가 100개로 늘어나도 `invoke()` 안의 분기 로직만 수정하면 됩니다.

## **4. JDK Dynamic Proxy의 한계**

한 가지 중요한 제약이 있습니다. **인터페이스 기반으로만 프록시를 생성할 수 있다**는 것입니다.

```java
// MouseService(인터페이스) → MouseServiceImpl(클래스)로 변경하면?
MouseService mouseService = (MouseService) Proxy.newProxyInstance(
        MouseService.class.getClassLoader(),
        new Class[] { MouseServiceImpl.class },  // ← 인터페이스가 아닌 클래스!
        handler
);
// ⚠ 예외 발생: dev.aop.step02.MouseServiceImpl is not an interface
```

JDK Dynamic Proxy는 인터페이스만 지원하므로, 인터페이스 없이 클래스만 있는 경우에는 사용할 수 없습니다. 이 한계를 극복하기 위해 **CGLIB(Code Generation Library)** 이 등장합니다. CGLIB은 런타임에 바이트코드를 조작하여 **클래스 기반 프록시**를 생성합니다. Spring AOP는 내부적으로 인터페이스가 있으면 JDK Dynamic Proxy를, 없으면 CGLIB을 사용합니다.

```
프록시 생성 전략:
  인터페이스 있음 → JDK Dynamic Proxy (java.lang.reflect.Proxy)
  인터페이스 없음 → CGLIB (바이트코드 생성, Spring 기본값)
```

---

# Part 4. 리플렉션 API Deep Dive

JDK Dynamic Proxy의 `method.invoke()`와 Tomcat의 `clazz.getConstructor().newInstance()` 모두 **리플렉션(Reflection)** 에 기반합니다. 이번에는 리플렉션 API의 핵심 기능들을 하나씩 실습하며 이해해보겠습니다.

## **1. Class 객체를 얻는 세 가지 방법**

리플렉션의 시작점은 `Class` 객체입니다. Java에서 클래스가 로딩되면 JVM은 해당 클래스의 메타정보를 담은 `Class` 타입 인스턴스를 힙에 생성합니다.

```java
// 방법 1: 인스턴스에서 getClass()
String s = "Hello, Reflection";
Class<?> clazz1 = s.getClass();
System.out.println(clazz1.getName());  // java.lang.String

// 방법 2: .class 리터럴 (객체 생성 없이 접근)
Class<?> clazz2 = Mouse.class;
System.out.println(clazz2.getName());  // dev.aop.step03.Mouse

// 방법 3: Class.forName() (문자열로 동적 로딩)
Class<?> clazz3 = Class.forName("java.util.List");
System.out.println(clazz3.getSimpleName());  // List
```

> **어디서 본 패턴인가? 🧐**
>
> 방법 3의 `Class.forName()`은 이전 글에서 Tomcat의 `DefaultInstanceManager`가 서블릿 클래스를 로딩할 때 사용한 것과 동일합니다. `loadClassMaybePrivileged(className, classLoader)` 내부에서 클래스 이름 문자열로 `Class` 객체를 얻고, 이를 통해 인스턴스를 생성했습니다. JDBC에서 드라이버를 동적 로딩할 때 `Class.forName("com.mysql.cj.jdbc.Driver")`로 사용하던 것도 같은 원리입니다.

## **2. 필드 접근**

`Class` 객체를 통해 해당 클래스의 필드 정보에 접근할 수 있습니다.

```java
Class<?> mouseClass = Mouse.class;

// public 필드만 조회
Field[] publicFields = mouseClass.getFields();
for (Field f : publicFields) {
    System.out.println(f.getName() + " - " + f.getType());
}
// 출력: age - int

System.out.println("========================");

// private 포함 모든 필드 조회
Field[] allFields = mouseClass.getDeclaredFields();
for (Field f : allFields) {
    System.out.println(f.getName() + " - " + f.getType());
}
// 출력:
// age - int
// name - class java.lang.String
```

`getFields()`는 `public` 필드만, `getDeclaredFields()`는 접근 제어자와 무관하게 **해당 클래스에 선언된 모든 필드**를 반환합니다. 이 차이는 메서드(`getMethods()` vs `getDeclaredMethods()`)와 생성자(`getConstructors()` vs `getDeclaredConstructors()`)에서도 동일하게 적용됩니다.

## **3. 메서드 조회 및 호출 (invoke)**

리플렉션의 가장 강력한 기능은 **메서드를 동적으로 호출**하는 것입니다.

```java
Class<?> stringClass = String.class;

// 1. Class 객체에서 Method 객체 획득
Method toUpperCaseMethod = stringClass.getMethod("toUpperCase");

// 2. Method.invoke()로 동적 호출
String result = (String) toUpperCaseMethod.invoke("hello");
System.out.println(result);  // HELLO
```

이것이 바로 JDK Dynamic Proxy의 `InvocationHandler.invoke()` 안에서 `method.invoke(mouseService, args)`가 하는 일입니다. 그리고 Spring MVC의 `RequestMappingHandlerAdapter`가 `@GetMapping` 메서드를 호출할 때도 이 `Method.invoke()`를 사용합니다.

## **4. 필드 값 수정**

private 필드의 값도 리플렉션으로 읽고 쓸 수 있습니다.

```java
Mouse jerry = new Mouse();
jerry.setName("제리");

Class<?> mouseClass = Mouse.class;

Field nameField = mouseClass.getDeclaredField("name");
nameField.setAccessible(true);  // ★ private 필드 접근 허용

// 읽기
String name = (String) nameField.get(jerry);
System.out.println(name);  // 제리

// 쓰기
nameField.set(jerry, "제이미");
System.out.println((String) nameField.get(jerry));  // 제이미
```

`setAccessible(true)`가 핵심입니다. Java의 접근 제어자(`private`)를 리플렉션으로 우회할 수 있습니다. 이 기능은 ORM 프레임워크(JPA/Hibernate)가 엔티티의 private 필드에 직접 값을 주입할 때 사용됩니다.

## **5. 생성자 조회 및 인스턴스 생성**

```java
Class<?> mouseClass = Mouse.class;

Constructor<?>[] constructors = mouseClass.getDeclaredConstructors();
for (Constructor<?> c : constructors) {
    System.out.println(c.getName() + " - " + Arrays.toString(c.getParameterTypes()));
}
// 출력:
// dev.aop.step03.Mouse - []                     ← 기본 생성자
// dev.aop.step03.Mouse - [int, class java.lang.String]  ← 파라미터 생성자
```

기본 생성자를 통한 인스턴스 생성은 이전 글에서 깊이 다뤘습니다.

```java
// Tomcat의 서블릿 생성 코드와 동일한 패턴
Object instance = mouseClass.getConstructor().newInstance();
```

이것이 DI 프레임워크에서 설정 파일이나 어노테이션 기반으로 의존성을 주입할 때의 핵심 메커니즘입니다.

---

# Part 5. 리플렉션으로 직접 DI 컨테이너 만들기

지금까지 배운 리플렉션 API를 종합하여, **Spring IoC 컨테이너의 핵심 동작을 직접 구현**해보겠습니다.

## **1. 목표**

다음과 같은 의존 관계가 있을 때,

```
BookService → BookRepository (의존)
```

`BookService` 인스턴스를 생성하면서 **`BookRepository` 의존성을 자동으로 주입**하는 컨테이너를 만듭니다.

## **2. @Inject 어노테이션 정의**

Spring의 `@Autowired`와 같은 역할을 하는 커스텀 어노테이션을 만듭니다.

```java
@Retention(RetentionPolicy.RUNTIME)  // ★ 런타임에 리플렉션으로 참조 가능
public @interface Inject {
}
```

`RetentionPolicy.RUNTIME`이 핵심입니다. 이 설정이 없으면 어노테이션 정보가 컴파일 후 사라져서 리플렉션으로 읽을 수 없습니다.

## **3. 의존 관계 설정**

```java
public class BookRepository {
    // 데이터 접근 로직
}

public class BookService {
    @Inject
    BookRepository bookRepository;  // ← 이 필드에 자동으로 인스턴스가 주입되어야 함
}
```

## **4. ContainerService 구현 — ★ 핵심 코드**

```java
public class ContainerService {

    public static <T> T getObject(Class<T> classType) {
        // 1단계: 전달받은 클래스의 인스턴스 생성
        T instance = createInstance(classType);

        // 2단계: 필드를 순회하며 @Inject가 붙은 필드를 찾아 의존성 주입
        Arrays.stream(classType.getDeclaredFields()).forEach(field -> {
            Inject annotation = field.getAnnotation(Inject.class);

            if (annotation != null) {
                // @Inject가 붙은 필드의 타입으로 인스턴스 생성
                Object fieldInstance = createInstance(field.getType());

                // private 필드에도 접근 가능하도록 설정
                field.setAccessible(true);

                try {
                    // 필드에 생성한 인스턴스를 주입
                    field.set(instance, fieldInstance);
                } catch (IllegalArgumentException | IllegalAccessException e) {
                    throw new RuntimeException(e);
                }
            }
        });

        return instance;
    }

    private static <T> T createInstance(Class<T> classType) {
        try {
            // 기본 생성자로 인스턴스 생성 (리플렉션)
            return classType.getConstructor(null).newInstance();
        } catch (InstantiationException | IllegalAccessException |
                 IllegalArgumentException | InvocationTargetException |
                 NoSuchMethodException | SecurityException e) {
            throw new RuntimeException(e);
        }
    }
}
```

이 코드가 하는 일을 단계별로 추적해보겠습니다.

```
ContainerService.getObject(BookService.class) 호출
      │
      ▼
[1단계] createInstance(BookService.class)
  └→ BookService.class.getConstructor(null).newInstance()
       └→ BookService 인스턴스 생성 (bookRepository는 아직 null)
      │
      ▼
[2단계] BookService의 필드 순회
  ├→ bookRepository 필드 발견
  │    └→ field.getAnnotation(Inject.class) → @Inject 있음!
  │         │
  │         ▼
  │    createInstance(BookRepository.class)
  │    └→ BookRepository.class.getConstructor(null).newInstance()
  │         └→ BookRepository 인스턴스 생성
  │         │
  │         ▼
  │    field.setAccessible(true)  ← private 필드 접근 허용
  │    field.set(bookServiceInstance, bookRepositoryInstance)
  │         └→ BookService.bookRepository = new BookRepository()
  │
  ▼
BookService 반환 (bookRepository가 주입된 상태)
```

## **5. 테스트로 검증**

```java
public class AppTest {

    @Test
    public void getObject_BookService() {
        BookService bookService = ContainerService.getObject(BookService.class);

        assertNotNull(bookService);              // BookService 인스턴스 생성 확인
        assertNotNull(bookService.bookRepository); // BookRepository 자동 주입 확인
    }

    @Test
    public void getObject_BookRepository() {
        BookRepository bookRepository = ContainerService.getObject(BookRepository.class);

        assertNotNull(bookRepository);  // @Inject 없는 클래스도 정상 생성 확인
    }
}
```

두 테스트 모두 통과합니다. `BookService`를 생성하면 `@Inject`가 붙은 `bookRepository` 필드에 `BookRepository` 인스턴스가 자동으로 주입됩니다.

## **6. Spring IoC 컨테이너와의 비교**

우리가 만든 `ContainerService`와 실제 Spring IoC 컨테이너를 비교해보겠습니다.

|                       | ContainerService (직접 구현)                      | Spring IoC 컨테이너                                    |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| **인스턴스 생성**     | `clazz.getConstructor().newInstance()` (리플렉션) | 동일 원리 + CGLIB 프록시 생성                          |
| **의존성 탐지**       | `@Inject` 어노테이션을 리플렉션으로 스캔          | `@Autowired` / `@Inject`를 리플렉션으로 스캔           |
| **의존성 주입**       | `field.set(instance, fieldInstance)` (필드 주입)  | 필드 주입, 생성자 주입, 세터 주입 모두 지원            |
| **빈 스코프**         | 매번 새 인스턴스 (Prototype)                      | 기본 Singleton + Prototype, Request 등 다양한 스코프   |
| **의존성 그래프**     | 1단계 깊이만 해결                                 | 재귀적으로 전체 의존성 그래프 해결                     |
| **라이프사이클 관리** | 없음                                              | `@PostConstruct`, `@PreDestroy`, `InitializingBean` 등 |

핵심 원리는 동일합니다. **리플렉션으로 클래스의 메타정보를 읽어 인스턴스를 생성하고, 어노테이션을 기반으로 의존성을 주입하는 것**입니다. Spring은 여기에 싱글톤 관리, 순환 의존성 감지, AOP 프록시 생성 등의 기능을 추가한 것입니다.

---

# 전체 학습 흐름 정리

```
[Part 1] 수동 프록시
  └→ 문제: 프록시 클래스를 직접 작성해야 함, 메서드 추가 시 중복 코드
      │
      ▼
[Part 2] Spring AOP
  ├→ ProxyFactoryBean: 프록시 생성을 Spring에 위임
  └→ @Aspect: Pointcut 표현식으로 선언적 AOP
      │  Q: Spring은 프록시를 어떻게 동적으로 만들까?
      ▼
[Part 3] JDK Dynamic Proxy
  └→ Proxy.newProxyInstance() + InvocationHandler
      │  Q: invoke() 안의 method.invoke()는 어떻게 동작하지?
      │  한계: 인터페이스 기반만 가능 → CGLIB이 클래스 기반 보완
      ▼
[Part 4] 리플렉션 API
  ├→ Class 객체 획득 (getClass(), .class, Class.forName())
  ├→ 필드/메서드/생성자 조회 및 조작
  └→ method.invoke(), constructor.newInstance()
      │  Q: 이걸로 Spring 같은 DI 컨테이너를 만들 수 있을까?
      ▼
[Part 5] 직접 DI 컨테이너 구현
  └→ @Inject + 리플렉션으로 의존성 자동 주입
      └→ Spring IoC의 핵심 원리를 직접 체험
```

이전 글의 Servlet Deep Dive와 연결하면 더 큰 그림이 보입니다.

```
Tomcat (서블릿 컨테이너)              Spring (IoC 컨테이너)
  │                                    │
  │ clazz.getConstructor()             │ clazz.getConstructor()
  │      .newInstance()                │      .newInstance()
  │ → 서블릿 인스턴스 생성              │ → 빈 인스턴스 생성
  │                                    │
  │                                    │ field.set(instance, dep)
  │                                    │ → 의존성 주입
  │                                    │
  │                                    │ Proxy.newProxyInstance()
  │                                    │ → AOP 프록시 생성
  └→ servlet.init()                    │
     servlet.service()                 └→ @PostConstruct
                                          비즈니스 로직 실행
```

**리플렉션**이라는 하나의 기반 기술 위에 Tomcat의 서블릿 관리, Spring의 DI, Spring AOP의 프록시 생성이 모두 구축되어 있습니다.

## Closing Thoughts (๑╹o╹)✎

이번 글에서는 수동 프록시의 한계에서 출발하여 Spring AOP → JDK Dynamic Proxy → 리플렉션 API → 직접 DI 컨테이너 구현까지의 과정을 단계별로 추적했습니다. 특히 Part 5에서 `ContainerService.getObject()`를 구현하면서, Spring의 `@Autowired`가 내부적으로 `field.setAccessible(true)` + `field.set()`으로 동작한다는 것을 직접 체험할 수 있었습니다.

이전 글에서 Tomcat의 `DefaultInstanceManager`가 리플렉션으로 서블릿을 생성하는 과정을 추적했는데, 이번에 동일한 리플렉션이 Spring AOP와 DI에서도 핵심 역할을 한다는 것을 확인하니 전체 그림이 더 명확해졌습니다.

틀린 내용이 있다면 댓글로 알려주세요. 🙇🏻‍♀️

## References

- [Spring Framework Reference — Aspect Oriented Programming](https://docs.spring.io/spring-framework/reference/core/aop.html)
- [Java Reflection API — Oracle Documentation](https://docs.oracle.com/javase/tutorial/reflect/)
- [Spring AOP Source Code — ProxyFactoryBean](https://github.com/spring-projects/spring-framework/blob/main/spring-aop/src/main/java/org/springframework/aop/framework/ProxyFactoryBean.java)
- [Java Dynamic Proxy — java.lang.reflect.Proxy](https://docs.oracle.com/javase/8/docs/api/java/lang/reflect/Proxy.html)
- [강의 교안 — AOP 개요 ~ 동적 프록시](https://baceru.vercel.app/Daily/1.aop-overview/1.aop-overview)
