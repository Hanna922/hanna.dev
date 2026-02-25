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
description: Let's analyze from Tomcat Internals Debugging to Spring's DispatcherServlet
---

This post is written based on Apache Tomcat 9.x / Spring Boot 3.x.

I worked on the SINT-P2 project (https://github.com/Hanna922/SINT-P2) during my exchange program in Spain, where I built a web service using Servlet and Tomcat. At the time, I focused primarily on implementation and did not debug the internal behavior of Servlets, so I did not fully understand how Servlet instances are initialized and managed by the container. To address this gap, I later traced through the Tomcat source code to debug the servlet instantiation process from its initial creation. I also analyzed the structural differences between Spring’s DispatcherServlet architecture and the low-level Servlet-based approach.

## Prerequisites

**What is a Servlet?**

A servlet is a server-side component written in Java that receives HTTP requests, processes them, and generates responses. A servlet container (such as Tomcat) manages the servlet lifecycle (creation → initialization → request handling → destruction).

**Servlet Lifecycle**

- **Creation**: The servlet container loads the servlet class and creates an instance
- **Initialization**: `init(ServletConfig)` is called
- **Request Handling**: `service(req, resp)` → dispatches to `doGet()`, `doPost()`, etc.
- **Destruction**: `destroy()` is called

**Tomcat's Container Hierarchy**

Tomcat has a nested container structure, where each container has processors called Valves connected in a pipeline.

```
Server (Catalina)
  └→ Service
       ├→ Connector (NIO Endpoint, listens on port 8080)
       └→ Engine (StandardEngine)
            └→ Host (StandardHost, "localhost")
                 └→ Context (StandardContext, per web application)
                      └→ Wrapper (StandardWrapper, 1:1 mapping with a servlet)
```

Each container has its own Pipeline + Valve chain. Requests pass through this chain sequentially from top to bottom.

**Example Servlet**

This is the servlet we will use as our debugging target throughout this post.

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
        out.println("<p>Request URI: " + req.getRequestURI() + "</p>");
        out.println("</body>");
        out.println("</html>");
    }
}
```

---

# Part 1. Debugging the Initial Servlet Object Creation Process

Now let's trace the entire process from when a `GET /servlets/debug` request first arrives to when the servlet object is created inside Tomcat, at the source code level.

## **1. Socket Reception — NioEndpoint**

Everything begins with the client sending bytes to a TCP socket.

```
Client sends GET /servlets/debug HTTP/1.1
      │
      ▼
NioEndpoint (listening on port 8080)
  └→ Acceptor thread: accepts socket connection
  └→ Poller thread: detects I/O events
  └→ Worker thread assigned from thread pool → SocketProcessor.run() executes
```

Tomcat's NIO connector receives a byte stream from the TCP socket. At this point, the data is still raw bytes that have not yet been parsed into the HTTP protocol.

## **2. HTTP Parsing — Http11Processor**

```java
// org.apache.coyote.http11.Http11Processor
public SocketState service(SocketWrapperBase<?> socketWrapper) {
    // Parses the HTTP byte stream
    // → Sets method (GET), URI (/servlets/debug), headers, etc. on the Request object
    getAdapter().service(request, response);
}
```

The raw bytes are parsed according to the HTTP protocol to create Tomcat's internal `org.apache.coyote.Request` object. This is then passed to the `CoyoteAdapter`.

## **3. URL → Servlet Mapping — CoyoteAdapter**

```java
// org.apache.catalina.connector.CoyoteAdapter
public void service(org.apache.coyote.Request req, org.apache.coyote.Response res) {
    // Convert coyote.Request → catalina.Request
    Request request = ...;
    Response response = ...;

    // ★ Determines which Host → Context → Wrapper to route to based on the URL
    postParseSuccess = postParseRequest(req, request, res, response);

    // Start the pipeline
    connector.getService().getContainer().getPipeline().getFirst().invoke(request, response);
}
```

Inside `postParseRequest()`, the **Mapper** analyzes the URL. This is a critical point because at this stage, **which servlet will handle the request is already determined**.

```
URL: /servlets/debug
      │
      ▼
Mapper.map()
  ├→ Host mapping:    finds the StandardHost for "localhost"
  ├→ Context mapping:  finds the StandardContext for "/" (root context)
  └→ Wrapper mapping:  finds the StandardWrapper for the "/servlets/debug" pattern
                       → the Wrapper for __DebuggingServlet__, registered with
                         @WebServlet(urlPatterns = "/servlets/debug")
```

The mapping result is stored in `request.getMappingData()`. After this, the Valve pipeline begins.

## **4. Traversing the Valve Pipeline**

Once mapping is complete, the Valve chain executes sequentially along the container hierarchy. Each Valve extracts the next container from `request.getMappingData()` and invokes that container's pipeline.

```
StandardEngineValve.invoke(request, response)
  │  // Extracts Host info from request → passes to the Host's pipeline
  ▼
StandardHostValve.invoke(request, response)
  │  // Extracts Context info from request → passes to the Context's pipeline
  ▼
StandardContextValve.invoke(request, response)
  │  // Extracts Wrapper info from request → passes to the Wrapper's pipeline
  ▼
StandardWrapperValve.invoke(request, response)  ← servlet acquisition happens here
```

## **5. StandardWrapperValve.invoke() — Servlet Acquisition Begins**

At the innermost point of the Valve pipeline, a servlet instance is finally requested.

```java
// org.apache.catalina.core.StandardWrapperValve
public final void invoke(Request request, Response response) {
    StandardWrapper wrapper = (StandardWrapper) getContainer();
    Servlet servlet = null;

    // ★ Acquire the servlet instance
    if (!unavailable) {
        servlet = wrapper.allocate();  // ← 🔴 Breakpoint ①
    }

    // Build the filter chain
    ApplicationFilterChain filterChain =
        ApplicationFilterFactory.createFilterChain(request, wrapper, servlet);

    // Execute the filter chain → ultimately calls servlet.service()
    filterChain.doFilter(request.getRequest(), response.getResponse());
}
```

When `wrapper.allocate()` is called, the process of obtaining a servlet instance truly begins.

## **6. StandardWrapper.allocate() — Checking Instance Existence**

```java
// org.apache.catalina.core.StandardWrapper
public Servlet allocate() throws ServletException {
    // Singleton approach: create on first access if instance is null
    if (!singleThreadModel) {
        if (instance == null) {                    // ← 🔴 Breakpoint ②
            synchronized (this) {
                if (instance == null) {             // DCL (Double-Checked Locking)
                    instance = loadServlet();       // ★ Actual loading starts here
                }
            }
        }
        countAllocated.incrementAndGet();
        return instance;
    }
}
```

The `instance` field is declared as `volatile Servlet instance = null`. On the first request, `instance` is `null`, so the thread enters the `synchronized` block and performs one more null check using the **DCL (Double-Checked Locking)** pattern before calling `loadServlet()`.

> **What is DCL (Double-Checked Locking)? 🧐**
>
> This is a pattern that prevents duplicate servlet creation when multiple requests arrive simultaneously in a multithreaded environment. The first `if` avoids the cost of entering `synchronized`, and the second `if` re-checks after acquiring the lock to ensure another thread hasn't already created the instance. The `volatile` keyword guarantees the visibility of the instance across threads.

## **7. StandardWrapper.loadServlet() — ★ The Core of Servlet Object Creation**

`loadServlet()` is the core method responsible for both creating and initializing the servlet.

```java
// org.apache.catalina.core.StandardWrapper
public synchronized Servlet loadServlet() throws ServletException {
    // If instance already exists, return as-is
    if (!singleThreadModel && (instance != null))
        return instance;

    Servlet servlet;
    try {
        // Obtain InstanceManager (from the parent Context)
        InstanceManager instanceManager =
            ((StandardContext) getParent()).getInstanceManager();

        // ★★★ This is the exact point where the servlet object is first created ★★★
        servlet = (Servlet) instanceManager.newInstance(servletClass);
        //                                              ↑ 🔴 Breakpoint ③
        // servletClass = "dev.servlet.step02_servlet_processing.__DebuggingServlet__"

        // Call init()
        initServlet(servlet);   // ← 🔴 Breakpoint ④

    } finally { ... }
    return servlet;
}
```

`instanceManager.newInstance(servletClass)` receives the servlet class name **as a string** and creates an instance. This process happens **dynamically at runtime**, not at compile time. This is because Tomcat cannot know in advance what servlet classes the user will create.

## **8. DefaultInstanceManager.newInstance() — Object Creation via Reflection**

The actual implementation of `instanceManager.newInstance()` resides in `DefaultInstanceManager`.

```java
// org.apache.catalina.core.DefaultInstanceManager
public Object newInstance(String className) throws ... {
    // 1) Class loading: obtain a Class object from the string
    Class<?> clazz = loadClassMaybePrivileged(className, classLoader);

    // 2) ★★★ Invoke the default constructor via reflection to create the instance ★★★
    return newInstance(clazz.getConstructor().newInstance(), clazz);
    //                       ↑ 🔴 Breakpoint ⑤ (where the actual "new" happens)
}
```

Breaking down this single line into three steps:

```java
// Step 1: Load the Class object from a string
Class<?> clazz = Class.forName(
    "dev.servlet.step02_servlet_processing.__DebuggingServlet__"
);

// Step 2: Find the default constructor (no-arg constructor) for the class
Constructor<?> constructor = clazz.getConstructor();

// Step 3: Invoke that constructor to create the instance
Object instance = constructor.newInstance();
```

This is **reflection**. The result is identical to `new __DebuggingServlet__()`, but the key difference is that **objects can be created at runtime using only a class name string**, rather than at compile time.

> **Why is reflection used? 🧐**
>
> Tomcat is a general-purpose servlet container. It cannot know at compile time what servlet classes the user will create. Since it must create objects using only **strings** read from `@WebServlet` annotations or `web.xml`, reflection must be used instead of the `new` keyword.

## **9. StandardWrapper.initServlet() — Calling init()**

Immediately after the object is created, `initServlet()` is called to initialize the servlet.

```java
// org.apache.catalina.core.StandardWrapper
private synchronized void initServlet(Servlet servlet) throws ServletException {
    try {
        servlet.init(facade);   // ← 🔴 Breakpoint ⑥
        // facade = StandardWrapperFacade (ServletConfig implementation)
    } catch (UnavailableException f) { ... }
}
```

When `servlet.init(facade)` is called, execution enters `GenericServlet.init(ServletConfig config)`.

```java
// javax.servlet.GenericServlet
public void init(ServletConfig config) throws ServletException {
    this.config = config;   // Store the ServletConfig
    this.init();            // Call the hook method for overriding
}

public void init() throws ServletException {
    // Empty implementation (no-op)
    // Users can override this method to add custom initialization logic
}
```

Since `__DebuggingServlet__` does not override `init()`, only the `ServletConfig` storage is performed and execution proceeds immediately.

## **10. Filter Chain Execution → Servlet Execution**

Once `loadServlet()` completes and the servlet instance is returned, execution returns to `StandardWrapperValve` where the filter chain is constructed and executed.

```
ApplicationFilterChain.doFilter()
  └→ Registered Filters execute sequentially
       └→ At the end of the chain, servlet.service(request, response) is called
            └→ HttpServlet.service()
                 └→ doGet(req, resp)  ← __DebuggingServlet__'s user code executes
```

## Full Call Stack Summary

```
[TCP Socket Reception]
  NioEndpoint.Acceptor → Poller → SocketProcessor.run()
    │
    ▼
[HTTP Parsing]
  Http11Processor.service()
    │
    ▼
[URL → Servlet Mapping]
  CoyoteAdapter.service()
    └→ postParseRequest() → Mapper.map()
       Result: Host=localhost, Context=/, Wrapper=__DebuggingServlet__
    │
    ▼
[Valve Pipeline]
  StandardEngineValve.invoke()
    └→ StandardHostValve.invoke()
         └→ StandardContextValve.invoke()
              └→ StandardWrapperValve.invoke()
                   │
                   ▼
[Servlet Acquisition and Creation]
  StandardWrapper.allocate()
    └→ instance == null? (yes on the first request)
         └→ StandardWrapper.loadServlet()
              ├→ DefaultInstanceManager.newInstance(servletClass)
              │    └→ clazz.getConstructor().newInstance()  ← ★ Object creation
              └→ initServlet(servlet)
                   └→ servlet.init(facade)                  ← Initialization
                   │
                   ▼
[Filter + Servlet Execution]
  ApplicationFilterChain.doFilter()
    └→ Filters execute sequentially
         └→ servlet.service(request, response)
              └→ __DebuggingServlet__.doGet()                ← User code
```

## Breakpoint Summary for Debugging

| Priority | Location                                                                             | Meaning                                         |
| -------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| ⑤        | `clazz.getConstructor().newInstance()` inside `DefaultInstanceManager.newInstance()` | **The exact point where the object is created** |
| ③        | `instanceManager.newInstance(servletClass)` inside `StandardWrapper.loadServlet()`   | Starting point of the loading process           |
| ②        | `if (instance == null)` inside `StandardWrapper.allocate()`                          | Determines if this is the first request         |
| ④⑥       | `initServlet()` → `servlet.init(facade)`                                             | Initialization point                            |
| ①        | `wrapper.allocate()` inside `StandardWrapperValve.invoke()`                          | Servlet acquisition request point               |

The simplest approach is to add an explicit default constructor to `__DebuggingServlet__` and place a breakpoint there. The entire flow becomes visible at a glance in the call stack window.

```java
public __DebuggingServlet__() {
    super(); // ← Place breakpoint here
}
```

---

# Part 2. Structural Differences Between Spring's DispatcherServlet and Low-Level Servlets

In Part 1, we examined how Tomcat dynamically creates servlets via reflection for each URL. Spring takes a fundamentally different architectural approach.

## **1. Low-Level Servlet Approach: One Servlet Per URL**

In the low-level servlet approach, a separate servlet class is required for each URL pattern.

```
Client Requests                    Servlets managed by Tomcat
                              ┌─────────────────────────────┐
GET /users    ──────────────→ │ UsersServlet     (Wrapper)   │
GET /orders   ──────────────→ │ OrdersServlet    (Wrapper)   │
GET /products ──────────────→ │ ProductsServlet  (Wrapper)   │
                              └─────────────────────────────┘
```

Tomcat looks at the URL, finds the corresponding `StandardWrapper`, and calls `allocate()`. As we saw in Part 1, the first request triggers servlet object creation via reflection with `instanceManager.newInstance(servletClass)`. If 10 servlets are needed, Tomcat creates each one separately via reflection 10 times. **Tomcat directly manages both URL routing and the entire servlet lifecycle** in this architecture.

The problem with this approach is that common logic is duplicated across all servlets.

```java
public class UsersServlet extends HttpServlet {
    protected void doGet(...) {
        // Encoding setup (duplicated)
        // Authentication check (duplicated)
        // Logging (duplicated)
        // Actual business logic
    }
}

public class OrdersServlet extends HttpServlet {
    protected void doGet(...) {
        // Encoding setup (duplicated)
        // Authentication check (duplicated)
        // Logging (duplicated)
        // Actual business logic
    }
}
```

## **2. Front Controller Pattern: A Single Entry Point**

Front Controller is a design pattern where **a single entry point receives all requests and delegates them to the appropriate handlers**. Spring's `DispatcherServlet` is the implementation of this pattern.

```
Client Requests              Tomcat              Spring
                           ┌──────────┐     ┌──────────────────────┐
GET /users    ───────────→ │          │     │  HandlerMapping      │
GET /orders   ───────────→ │ Dispatch │────→│    ↓                 │
GET /products ───────────→ │ erServlet│     │  UserController      │
POST /users   ───────────→ │ (only 1) │     │  OrderController     │
                           └──────────┘     │  ProductController   │
                                            └──────────────────────┘
```

**From Tomcat's perspective, there is only one servlet: the DispatcherServlet.** All requests enter this single servlet mapped to `"/"`. It is **Spring, not Tomcat**, that determines which controller method to invoke based on the URL.

## **3. Fundamental Differences in Object Creation**

The most critical difference between the two approaches is **who creates the objects, when, and how**.

**Low-Level Servlet: Tomcat creates via reflection (Lazy)**

```java
// Tomcat's DefaultInstanceManager — called at first request time
clazz.getConstructor().newInstance()
// → Dynamically creates each servlet per URL
```

**Spring: Spring IoC container creates as a bean (Eager)**

```java
// Inside DispatcherServletAutoConfiguration
@Bean
public DispatcherServlet dispatcherServlet() {
    return new DispatcherServlet();  // Spring creates it directly with new
}
```

The DispatcherServlet is pre-created by Spring as a bean and registered with Tomcat. `@Controller` classes are also created as beans by Spring through component scanning. **Rather than Tomcat's reflection-based dynamic creation, the Spring container creates everything at application startup.**

## **4. How DispatcherServlet Gets Registered in Spring Boot**

When Spring Boot starts, the DispatcherServlet goes through the following process to be registered with Tomcat.

### SpringApplication.run() — Bootstrap Start

```java
@SpringBootApplication
public class MyApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

`@SpringBootApplication` is simply an annotation (metadata); the actual execution flow begins in `SpringApplication.run()`.

### Web Application Type Determination

`WebApplicationType.deduceFromClasspath()` is called in the `SpringApplication` constructor.

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

If the `spring-boot-starter-web` dependency is present, then `DispatcherServlet` and `Servlet` classes exist on the classpath, so the type is determined as `SERVLET`.

### ApplicationContext Creation and Auto-Configuration

When the web type is `SERVLET`, an `AnnotationConfigServletWebServerApplicationContext` is created, and Auto-Configuration registers the following beans:

- `TomcatServletWebServerFactory` — a factory that creates the embedded Tomcat
- `DispatcherServlet` — the front controller that receives all HTTP requests
- `DispatcherServletRegistrationBean` — responsible for registering the DispatcherServlet as a servlet

### context.refresh() → Embedded Tomcat Creation

When `onRefresh()` is called during the `context.refresh()` process, embedded Tomcat creation begins in earnest.

```java
// org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext
private void createWebServer() {
    ServletWebServerFactory factory = getWebServerFactory();
    // → TomcatServletWebServerFactory is returned

    this.webServer = factory.getWebServer(getSelfInitializer());
}
```

### TomcatServletWebServerFactory.getWebServer() — Tomcat Instance Creation

```java
// org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory
public WebServer getWebServer(ServletContextInitializer... initializers) {
    Tomcat tomcat = new Tomcat();

    Connector connector = new Connector(this.protocol);
    connector.setPort(getPort());   // default 8080
    tomcat.getService().addConnector(connector);

    prepareContext(tomcat.getHost(), initializers);

    return getTomcatWebServer(tomcat);
}
```

### prepareContext() → Registering DispatcherServlet with Tomcat

During the `prepareContext()` process, `ServletContextInitializer`s are applied.

```
prepareContext()
  └→ Register TomcatStarter (a ServletContainerInitializer implementation)
       └→ onStartup() is called at server startup
            └→ DispatcherServletRegistrationBean.onStartup()
                 └→ servletContext.addServlet("dispatcherServlet", dispatcherServlet)
                 └→ registration.setLoadOnStartup(1)  ← initialize immediately at startup
                 └→ registration.addMapping("/")       ← map all requests
```

At this point, the DispatcherServlet is wrapped in a Tomcat `StandardWrapper` and registered. Since `loadOnStartup = 1`, it is initialized immediately when Tomcat starts via `StandardContext.loadOnStartup()`.

```
StandardContext.startInternal()
  └→ loadOnStartup(findChildren())
       └→ StandardWrapper.load()
            └→ loadServlet()
                 └→ initServlet(servlet)
                      └→ servlet.init(config)  ← DispatcherServlet.init() called
```

> **Key Difference from Low-Level Servlets!**
>
> In the low-level servlet approach, `loadServlet()` called `instanceManager.newInstance()` to create the object via reflection. However, in the Spring Boot case, the DispatcherServlet is **already created by Spring as a bean and handed over to Tomcat**, so Tomcat does not create a new instance via reflection — it only calls `init()` on the already-existing instance.

## **5. Comparing HTTP Request Processing**

### Request Processing in Low-Level Servlets

```
GET /servlets/debug
  │
  ▼
Tomcat Mapper: "/servlets/debug" → StandardWrapper(__DebuggingServlet__)
  │
  ▼
StandardWrapperValve.invoke()
  └→ wrapper.allocate() → returns __DebuggingServlet__ instance
  └→ FilterChain → servlet.service()
       └→ __DebuggingServlet__.doGet()  ← handles directly
```

**Tomcat handles everything from URL routing to servlet execution.**

### Request Processing in Spring

```
GET /api/users
  │
  ▼
Tomcat Mapper: "/" → StandardWrapper(DispatcherServlet)
  │  (all URLs map to the single DispatcherServlet)
  ▼
StandardWrapperValve.invoke()
  └→ wrapper.allocate() → returns DispatcherServlet instance
  └→ FilterChain → servlet.service()
       └→ DispatcherServlet.doDispatch()  ← Spring's domain begins here
```

`DispatcherServlet.doDispatch()` is the core of Spring MVC.

```java
// org.springframework.web.servlet.DispatcherServlet
protected void doDispatch(HttpServletRequest request, HttpServletResponse response) {

    // 1. Ask HandlerMapping: "Who handles GET /api/users?"
    HandlerExecutionChain handler = getHandler(request);
    // → RequestMappingHandlerMapping finds the
    //   UserController.getUsers() method annotated with @GetMapping("/api/users")

    // 2. Look up HandlerAdapter: "Which adapter can execute this handler?"
    HandlerAdapter adapter = getHandlerAdapter(handler.getHandler());
    // → RequestMappingHandlerAdapter is selected

    // 3. Execute interceptor preHandle

    // 4. Invoke the actual controller method
    ModelAndView mv = adapter.handle(request, response, handler.getHandler());
    // → UserController.getUsers() is called via reflection

    // 5. Execute interceptor postHandle

    // 6. Process the response (View rendering or @ResponseBody serialization)
}
```

Reflection is also used inside `adapter.handle()` to invoke the controller method. However, this is not reflection for Tomcat to create a servlet — it is **reflection for Spring to invoke a method on an already-existing bean**. This is a critical distinction.

## **6. Complete Comparison of Both Approaches**

|                            | Low-Level Servlet                                                  | Spring (DispatcherServlet)                                                     |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Number of Servlets**     | One per URL pattern                                                | One for the entire application                                                 |
| **URL Routing**            | Tomcat (Mapper → StandardWrapper)                                  | Spring (HandlerMapping)                                                        |
| **Object Creation**        | Tomcat (reflection, on first request)                              | Spring IoC (bean, at application startup)                                      |
| **Creation Timing**        | Lazy (on first request via `loadServlet()`)                        | Eager (bean registered at container startup)                                   |
| **Reflection Purpose**     | Servlet instance creation (`clazz.getConstructor().newInstance()`) | Controller method invocation (`method.invoke()`)                               |
| **Cross-Cutting Concerns** | Duplicated across each servlet                                     | Handled centrally by DispatcherServlet                                         |
| **Tomcat's Role**          | URL routing + full servlet lifecycle management                    | Network communication + managing only the single DispatcherServlet's lifecycle |

In conclusion, while Spring's DispatcherServlet is technically a servlet running on Tomcat, **Spring has effectively replaced most of Tomcat's servlet management capabilities with its own**. Tomcat only manages network communication and the lifecycle of the single DispatcherServlet, while all routing and controller management is handled entirely by Spring. In the traditional external Tomcat setup, Tomcat starts first and Spring is deployed on top of it. In Spring Boot, however, **Spring starts first and creates Tomcat as an embedded object under its own control** — and this is the most significant structural difference.

## Closing Thoughts (๑╹o╹)✎

Writing this post allowed me to trace the internal workings of servlets and Spring Boot at the source code level — things I had always taken for granted. I found the exact point where servlet objects are created via reflection in `DefaultInstanceManager.newInstance()` and the process by which Spring Boot registers the DispatcherServlet with Tomcat particularly fascinating.

If anything is incorrect, please let me know in the comments. 🙇🏻‍♀️

## References

- [Apache Tomcat 9 Source Code — StandardWrapper.java](https://github.com/apache/tomcat/blob/main/java/org/apache/catalina/core/StandardWrapper.java)
- [Apache Tomcat 9 Source Code — DefaultInstanceManager.java](https://github.com/apache/tomcat/blob/main/java/org/apache/catalina/core/DefaultInstanceManager.java)
- [Spring Boot Reference — Servlet Web Applications](https://docs.spring.io/spring-boot/reference/web/servlet.html)
- [Spring Boot Source Code — DispatcherServletAutoConfiguration](https://github.com/spring-projects/spring-boot/blob/main/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/web/servlet/DispatcherServletAutoConfiguration.java)
- [Tomcat & Spring Bootstrapping Sequence](https://medium.com/chequer/tomcat-spring-bootstrapping-sequence-3%ED%8E%B8-http-43c789078e3)
