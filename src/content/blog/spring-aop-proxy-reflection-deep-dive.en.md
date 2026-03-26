---
author: Hanna922
pubDatetime: 2026-03-18T10:00:00.000Z
modDatetime:
title: Spring AOP Deep Dive - From Proxy Pattern to Reflection-based DI Container
titleEn: Spring AOP Deep Dive - From Proxy Pattern to Reflection-based DI Container
featured: false
draft: false
tags:
  - Spring AOP
  - Proxy Pattern
  - Dynamic Proxy
  - Reflection
  - IoC
  - Deep Dive
description: Let us understand how Spring AOP works by going from manual proxies to JDK Dynamic Proxy to the Reflection API, and finally building a DI container ourselves
---

This post is written based on Spring Framework 6.x / Java 17+.

In the previous post, [Servlet Initialization Deep Dive With Tomcat](https://hanna-dev.co.kr), I traced at the source-code level how Tomcat dynamically creates servlet objects through reflection. Inside that flow, `clazz.getConstructor().newInstance()` in `DefaultInstanceManager.newInstance()` was the key. This time, I traced **how that same reflection mechanism is extended and used inside Spring AOP**. Starting from a manual proxy implementation and moving through JDK Dynamic Proxy, the Reflection API, and finally building a DI container ourselves, I will write the code step by step to understand how Spring AOP works internally.

## Prerequisites

**What is AOP (Aspect-Oriented Programming)?**

AOP is a programming paradigm that **separates** core business logic (core concerns) from additional features such as logging, authentication, and transactions (cross-cutting concerns). It solves the problem of cross-cutting concerns being duplicated across multiple modules.

**Core AOP Terms**

- **Aspect** - A class that modularizes one cross-cutting concern. A typical example is separating the concern of logging into a `LoggingAspect` class.
- **Advice** - The method that actually executes inside an Aspect. Execution timing is specified with annotations such as `@Before`, `@After`, and `@Around`.
- **Pointcut** - An expression that selects the target methods to which Advice should be applied. It is written with patterns such as `execution(* dev.aop.controller.*Controller.*(..))`.
- **JoinPoint** - A point where Advice can be applied. In Spring AOP, this is always **the point of method invocation**.
- **Target** - The actual target object to which Advice is applied.
- **Proxy** - A delegate object that wraps the Target and executes Advice.

**What is a Proxy?**

A proxy is an object that plays the role of a **delegate**. Instead of a client calling the Target object directly, it calls through the Proxy. The Proxy executes additional logic (Advice) before and after the call, then delegates the actual work to the Target. This proxy mechanism is the core of Spring AOP.

```
Client --> Proxy --> Target
            |         |
            | Before  | Business logic
            | After   |
            +---------+
```

---

# Part 1. Manual Proxy Implementation - Why AOP Is Needed

To understand AOP, you first need to experience what problems appear when handling cross-cutting concerns **without AOP**.

## **1. Before AOP: Business Logic Mixed with Logging**

Let us look at the simplest possible `UserController`.

```java
public class UserController {
    Logger logger = Logger.getLogger("UserController");

    public List<User> getUsers() {
        logger.info("GET: before calling getUsers()");  // <- logging (cross-cutting concern)

        List<User> users = new ArrayList<>();
        users.add(new User(1, "Tom"));
        users.add(new User(2, "Jerry"));

        logger.info("GET: after calling getUsers()");  // <- logging (cross-cutting concern)
        return users;
    }
}
```

Right now it looks fine because there is only one `getUsers()` method. But the problem becomes obvious when the number of controllers grows.

```java
// The same logging code is duplicated in OrderController as well
public class OrderController {
    public List<Order> getOrders() {
        logger.info("GET: before calling getOrders()");  // duplicate!
        // ... business logic
        logger.info("GET: after calling getOrders()");   // duplicate!
        return orders;
    }
}
```

In the previous post, I pointed out that one problem with the low-level servlet approach was that common logic such as encoding, authentication, and logging gets duplicated across all servlets. Here, **the exact same problem** appears again. If you want to change the logging format, you have to modify every controller one by one, and it is easy to miss one by mistake.

## **2. Attempting Separation with the Proxy Pattern**

To separate cross-cutting concerns from business logic, let us apply the **Proxy Pattern**.

```
Client (AppClient)
      |
      v
GreetingServiceProxy (proxy object)
      |  1. Execute additional logic ("intercept access")
      |  2. Delegate to Target
      v
GreetingServiceImpl (target object)
      |  Actual business logic ("Hello, World!")
      v
Return result
```

First, define the interface that both the Target and the Proxy will implement.

```java
// Interface for the target object
// The Proxy also implements the same interface
// -> from the client's perspective, it looks as if it is calling the Target directly
public interface GreetingService {
    void sayHello();
}
```

The Target implementation contains only pure business logic.

```java
public class GreetingServiceImpl implements GreetingService {
    @Override
    public void sayHello() {
        System.out.println("GreetingService: Hello, World!");
    }
}
```

The Proxy implements the same interface as the Target, but **intercepts the call**, executes additional logic, and then delegates to the Target.

```java
public class GreetingServiceProxy implements GreetingService {

    private GreetingServiceImpl targetService;

    @Override
    public void sayHello() {
        if (targetService == null) {
            // Delay creation of the Target object until the actual call (Lazy)
            targetService = new GreetingServiceImpl();
        }

        // ★ Proxy-specific additional logic
        System.out.println("Proxy intercepted access to GreetingServiceImpl");

        // Delegate work to the actual Target
        targetService.sayHello();
    }
}
```

The client code calls through the Proxy.

```java
public class AppClient {
    public static void main(String[] args) {
        // Create the proxy object, not the target
        GreetingService greetingService = new GreetingServiceProxy();

        greetingService.sayHello();
        // output:
        // "Proxy intercepted access to GreetingServiceImpl"
        // "GreetingService: Hello, World!"
    }
}
```

From the client's point of view, it only needs to know the `GreetingService` interface, so the code is identical to calling the Target directly. This is **the essence of the Proxy Pattern**.

> **Lazy Initialization in the Proxy 🧐**
>
> Creating `targetService` at the moment `sayHello()` is called in `GreetingServiceProxy` is the **Lazy Initialization** pattern. This is the same concept as Tomcat's `StandardWrapper.allocate()` creating the servlet only on the first request in the previous post. It delays creation of a heavy object until it is actually needed.

## **3. Limitations of the Manual Proxy**

Let us apply the same approach to `MouseService`.

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
        System.out.println("before save...");      // additional logic
        mouseService.save(mouse);                  // delegate to Target
        System.out.println("after save...");       // additional logic
    }
}
```

So far, it works. But what happens if an `update()` method is added to `MouseService`?

```java
public interface MouseService {
    void save(Mouse mouse);
    void update(Mouse mouse);  // <- add a new method
}
```

You now have to implement `update()` in the Proxy too. And if you want to apply logging to this method as well, you must **write the same before/after code again**.

```java
@Override
public void update(Mouse mouse) {
    System.out.println("before update...");  // duplicate!
    mouseService.update(mouse);
    System.out.println("after update...");   // duplicate!
}
```

If there are 10 services and each service has 5 methods, you have to write 50 methods across 10 proxy classes by hand. **Manual proxies do not scale well.**

```
Problem summary:
  1. You have to create a proxy class manually for every new service
  2. Proxy handling code is duplicated for every new method
  3. When additional logic changes, every proxy must be modified
```

To solve this, instead of creating proxies manually each time, the proxies need to be **generated dynamically at runtime**.

---

# Part 2. Separating Cross-cutting Concerns with Spring AOP

In Part 1, we confirmed the limitations of manual proxies. Spring solves this problem with its **AOP framework**. Let us look at two approaches in order.

## **1. The ProxyFactoryBean Approach (XML-based)**

Spring's `ProxyFactoryBean` is a factory that automatically creates a proxy object **as a bean**.

First, separate the additional logic (Advice) into its own class.

```java
// Class that defines how and when the proxy should behave
public class SimpleAdvice implements MethodBeforeAdvice {

    Logger logger = Logger.getLogger("SimpleAdvice");

    @Override
    public void before(Method method, Object[] args, Object target) throws Throwable {
        logger.info("GET: before calling getUsers()");
        // After this, the Target object's actual method is called internally
    }
}
```

`MethodBeforeAdvice` is an interface that defines logic to run **before a Target method call**. The `before()` method receives the method information (`Method`), arguments (`Object[]`), and target object (`Object target`) as parameters.

Configure the proxy with XML.

```xml
<!-- Target: the actual bean to which AOP will be applied -->
<bean id="userController" class="dev.aop.UserController" />

<!-- Advice: bean containing additional logic -->
<bean id="simpleAdvice" class="dev.aop.SimpleAdvice" />

<!-- ProxyFactoryBean: factory bean that creates the proxy object -->
<bean id="proxyFactoryBean" class="org.springframework.aop.framework.ProxyFactoryBean">
    <!-- target: reference to the actual target bean -->
    <property name="target" ref="userController" />
    <!-- interceptorNames: list of Advice to apply -->
    <property name="interceptorNames">
        <list>
            <value>simpleAdvice</value>
        </list>
    </property>
</bean>
```

In client code, you inject and use the **proxy bean**.

```java
public class AfterAOP {
    public static void main(String[] args) {
        var context = new ClassPathXmlApplicationContext("beans.xml");

        // ★ retrieving "proxyFactoryBean" returns the proxy object
        UserController controller = (UserController) context.getBean("proxyFactoryBean");

        List<User> users = controller.getUsers();
        System.out.println("users = " + users);
    }
}
```

The internal flow can be summarized like this.

```
context.getBean("proxyFactoryBean")
      |
      v
ProxyFactoryBean
  |- target = reference to UserController bean
  |- interceptorNames = [simpleAdvice]
  \- create proxy object and return it
      |
      v
controller.getUsers() call
      |
      v
Proxy object intercepts
  |- execute SimpleAdvice.before()  <- "GET: before calling getUsers()"
  \- delegate to UserController.getUsers()  <- actual business logic
      |
      v
Return result: [User [id=1, name=Tom], User [id=2, name=Jerry]]
```

> **Difference from a Manual Proxy 🧐**
>
> In Part 1, we had to write the `GreetingServiceProxy` class by hand. With `ProxyFactoryBean`, **there is no need to write the proxy class manually.** Spring dynamically creates the proxy object at runtime. You only need to write the additional logic (Advice) as a separate class.

## **2. The `@Aspect` Approach (Annotation-based)**

The `ProxyFactoryBean` + XML approach works, but it is cumbersome because proxy configuration has to be added to XML for every bean. Spring makes this much more concise with the **`@Aspect` annotation**.

```java
@Aspect     // Declare that this class is an AOP Aspect
@Component  // Register it as a Spring bean
@Slf4j      // Lombok logging
public class LoggingAspect {

    // Pointcut expression: apply to every method in XxxController classes under dev.aop.controller
    @Before(value = "execution(* dev.aop.controller.*Controller.*(..))")
    public void logBefore(JoinPoint joinPoint) {

        // Dynamically log the called class and method name
        log.debug(" {}'s {} was called",
                joinPoint.getTarget().getClass().getSimpleName(),
                joinPoint.getSignature().getName()
        );

        // Log the passed arguments as well
        Object[] args = joinPoint.getArgs();
        for (int i = 0; i < args.length; i++) {
            log.debug("args[" + i + "] -->" + args[i]);
        }
    }
}
```

Let us break down the Pointcut expression.

```
execution(* dev.aop.controller.*Controller.*(..))
           |  |                  |          | |
           |  |                  |          | \-> parameters: any signature
           |  |                  |          \-> method name: anything
           |  |                  \-> class name: anything ending with XxxController
           |  \-> package: under dev.aop.controller
           \-> return type: anything
```

Now the controller contains only pure business logic.

```java
@Component
@Slf4j
public class OwnerController {

    public void getOwners() {
        // logging code is gone!
        // only pure business logic remains
    }

    public void addOwner(Owner owner) {
        // only pure business logic remains
    }
}
```

If we trace the execution result, it looks like this.

```
controller.getOwners() call
  |
  v
Spring AOP proxy intercepts
  \-> execute LoggingAspect.logBefore()
       |  log.debug("OwnerController's getOwners was called")
       |  args: (none)
       v
  \-> execute OwnerController.getOwners() (Target)

controller.addOwner(new Owner(1, "gugu")) call
  |
  v
Spring AOP proxy intercepts
  \-> execute LoggingAspect.logBefore()
       |  log.debug("OwnerController's addOwner was called")
       |  log.debug("args[0] -->Owner{id=1, name='gugu'}")
       v
  \-> execute OwnerController.addOwner() (Target)
```

## **3. Comparing the Two Approaches**

|                            | ProxyFactoryBean (XML)                | `@Aspect` (annotation)                     |
| -------------------------- | ------------------------------------- | ------------------------------------------ |
| **Where config lives**     | `beans.xml`                           | Annotations inside Java classes            |
| **How targets are chosen** | XML config required per bean          | Pattern matching with Pointcut expressions |
| **How Advice is defined**  | Implement `MethodBeforeAdvice`        | `@Before`, `@After`, `@Around` annotations |
| **Scalability**            | XML becomes bulky as targets increase | One pattern can apply to many targets      |
| **JoinPoint info**         | `Method`, `Object[]`, `Object`        | Unified as a `JoinPoint` object            |

Annotation-based `@Aspect` is the standard in modern Spring applications. But in both approaches, the core fact is the same: **Spring dynamically creates proxy objects internally.** Then how does Spring dynamically generate proxies?

---

# Part 3. JDK Dynamic Proxy - Runtime Proxy Generation

In Part 1, we saw the limitations of manual proxies, and in Part 2 we saw how Spring AOP solves them. Now let us implement the internal mechanism itself: **JDK Dynamic Proxy**.

## **1. What is JDK Dynamic Proxy?**

JDK Dynamic Proxy is a feature provided by the Java standard library (`java.lang.reflect.Proxy`) that **dynamically generates interface-based proxy objects at runtime**. Unlike manual proxies, there is no need to write a proxy class by hand.

```
Manual proxy:    write the proxy class (.java) directly at compile time
Dynamic Proxy: generate the proxy class in memory by the JVM at runtime
```

## **2. InvocationHandler - The Brain of the Proxy**

The core of Dynamic Proxy is the `InvocationHandler` interface. Every method call on the proxy object is funneled into `invoke()` on this handler.

```java
public class MouseInvocationHandler implements InvocationHandler {

    // Actual target object
    MouseService mouseService = new MouseServiceImpl();

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        if (method.getName().equals("save")) {
            // Apply additional logic only when save() is called
            System.out.println("before save...");
            Object result = method.invoke(mouseService, args);  // ★ call the Target
            System.out.println("after save...");
            return result;
        }

        // For methods other than save, call the Target directly without extra logic
        return method.invoke(mouseService, args);
    }
}
```

The key here is `method.invoke(mouseService, args)`. This is **a reflective method call**, which is the same mechanism used when Spring calls controller methods with `method.invoke()` inside `DispatcherServlet.doDispatch()` in the previous post.

## **3. Creating the Proxy Object**

Create the proxy at runtime with `Proxy.newProxyInstance()`.

```java
public class AppClient {
    public static void main(String[] args) {

        InvocationHandler handler = new MouseInvocationHandler();

        // ★ generate the proxy object at runtime
        MouseService mouseService = (MouseService) Proxy.newProxyInstance(
                MouseService.class.getClassLoader(),    // class loader
                new Class[] { MouseService.class },     // interfaces implemented by the proxy
                handler                                  // invocation handler
        );

        mouseService.save(new Mouse(1, "Jerry"));
        // output:
        // before save...
        // save: Jerry
        // after save...

        mouseService.update(new Mouse(2, "Jamie"));
        // output:
        // update: Jamie   <- because it is not save, it runs directly without extra logic
    }
}
```

If you break down the three parameters of `Proxy.newProxyInstance()`, they mean:

```
Proxy.newProxyInstance(
    MouseService.class.getClassLoader(),  // ① which class loader should load the proxy class
    new Class[] { MouseService.class },   // ② list of interfaces implemented by the proxy
    handler                                // ③ InvocationHandler to run on every method call
)
```

Internally, the JVM performs the following steps.

```
Proxy.newProxyInstance() call
      |
      v
JVM creates a proxy class in memory
  \-> $Proxy0 implements MouseService
       |
       |  delegates every method call to handler.invoke()
       |
       v
mouseService.save(mouse) call
      |
      v
$Proxy0.save(mouse)
  \-> handler.invoke(proxy, saveMethod, [mouse])
       |- "before save..."
       |- method.invoke(mouseService, args)  <- call Target through reflection
       \- "after save..."
```

> **Improvement Compared to a Manual Proxy 🧐**
>
> In the manual proxy approach, we had to write the `MouseServiceProxy` class directly and update the proxy code every time a method was added. With JDK Dynamic Proxy, **a single method**, `InvocationHandler.invoke()`, handles all calls. Even if the number of methods grows to 100, you only need to adjust the branching logic inside `invoke()`.

## **4. Limitations of JDK Dynamic Proxy**

There is one important restriction: **it can generate proxies only for interfaces**.

```java
// What if MouseService (interface) is replaced with MouseServiceImpl (class)?
MouseService mouseService = (MouseService) Proxy.newProxyInstance(
        MouseService.class.getClassLoader(),
        new Class[] { MouseServiceImpl.class },  // <- a class, not an interface!
        handler
);
// ⚠ Exception: dev.aop.step02.MouseServiceImpl is not an interface
```

Because JDK Dynamic Proxy supports interfaces only, it cannot be used when there is only a concrete class and no interface. To overcome this limitation, **CGLIB (Code Generation Library)** appears. CGLIB manipulates bytecode at runtime to create **class-based proxies**. Internally, Spring AOP uses JDK Dynamic Proxy when an interface exists, and CGLIB when it does not.

```
Proxy generation strategy:
  interface exists -> JDK Dynamic Proxy (java.lang.reflect.Proxy)
  no interface     -> CGLIB (bytecode generation, Spring default)
```

---

# Part 4. Reflection API Deep Dive

Both `method.invoke()` in JDK Dynamic Proxy and `clazz.getConstructor().newInstance()` in Tomcat are based on **reflection**. This time, let us understand the core features of the Reflection API one by one through practice.

## **1. Three Ways to Obtain a Class Object**

The starting point of reflection is the `Class` object. When a class is loaded in Java, the JVM creates an instance of type `Class` on the heap containing that class's metadata.

```java
// Method 1: getClass() from an instance
String s = "Hello, Reflection";
Class<?> clazz1 = s.getClass();
System.out.println(clazz1.getName());  // java.lang.String

// Method 2: .class literal (access without creating an object)
Class<?> clazz2 = Mouse.class;
System.out.println(clazz2.getName());  // dev.aop.step03.Mouse

// Method 3: Class.forName() (dynamic loading from a string)
Class<?> clazz3 = Class.forName("java.util.List");
System.out.println(clazz3.getSimpleName());  // List
```

> **Where Have We Seen This Pattern Before? 🧐**
>
> `Class.forName()` in Method 3 is exactly the same pattern Tomcat's `DefaultInstanceManager` used in the previous post when loading a servlet class. Inside `loadClassMaybePrivileged(className, classLoader)`, it obtained the `Class` object from the class name string and used that object to create an instance. The familiar JDBC pattern `Class.forName("com.mysql.cj.jdbc.Driver")` uses the same principle.

## **2. Field Access**

Through the `Class` object, you can access field information for that class.

```java
Class<?> mouseClass = Mouse.class;

// Query only public fields
Field[] publicFields = mouseClass.getFields();
for (Field f : publicFields) {
    System.out.println(f.getName() + " - " + f.getType());
}
// output: age - int

System.out.println("========================");

// Query all fields including private ones
Field[] allFields = mouseClass.getDeclaredFields();
for (Field f : allFields) {
    System.out.println(f.getName() + " - " + f.getType());
}
// output:
// age - int
// name - class java.lang.String
```

`getFields()` returns only `public` fields, while `getDeclaredFields()` returns **all fields declared in the class itself**, regardless of access modifier. The same distinction applies to methods (`getMethods()` vs `getDeclaredMethods()`) and constructors (`getConstructors()` vs `getDeclaredConstructors()`).

## **3. Method Lookup and Invocation (`invoke`)**

The most powerful feature of reflection is **dynamically invoking methods**.

```java
Class<?> stringClass = String.class;

// 1. Obtain the Method object from the Class object
Method toUpperCaseMethod = stringClass.getMethod("toUpperCase");

// 2. Dynamically invoke it with Method.invoke()
String result = (String) toUpperCaseMethod.invoke("hello");
System.out.println(result);  // HELLO
```

This is exactly what `method.invoke(mouseService, args)` inside `InvocationHandler.invoke()` of JDK Dynamic Proxy does. And when Spring MVC's `RequestMappingHandlerAdapter` calls a `@GetMapping` method, it also uses this same `Method.invoke()`.

## **4. Modifying Field Values**

You can also read and write private fields through reflection.

```java
Mouse jerry = new Mouse();
jerry.setName("Jerry");

Class<?> mouseClass = Mouse.class;

Field nameField = mouseClass.getDeclaredField("name");
nameField.setAccessible(true);  // ★ allow access to a private field

// read
String name = (String) nameField.get(jerry);
System.out.println(name);  // Jerry

// write
nameField.set(jerry, "Jamie");
System.out.println((String) nameField.get(jerry));  // Jamie
```

`setAccessible(true)` is the key. It allows reflection to bypass Java access modifiers such as `private`. ORM frameworks such as JPA/Hibernate use this capability when injecting values directly into private entity fields.

## **5. Constructor Lookup and Instance Creation**

```java
Class<?> mouseClass = Mouse.class;

Constructor<?>[] constructors = mouseClass.getDeclaredConstructors();
for (Constructor<?> c : constructors) {
    System.out.println(c.getName() + " - " + Arrays.toString(c.getParameterTypes()));
}
// output:
// dev.aop.step03.Mouse - []                     <- default constructor
// dev.aop.step03.Mouse - [int, class java.lang.String]  <- parameter constructor
```

Creating an instance through the default constructor was covered deeply in the previous post.

```java
// The same pattern as Tomcat's servlet creation code
Object instance = mouseClass.getConstructor().newInstance();
```

This is the core mechanism used in DI frameworks when injecting dependencies based on configuration files or annotations.

---

# Part 5. Building a DI Container with Reflection

By combining what we have learned from the Reflection API so far, let us **implement the core behavior of the Spring IoC container ourselves**.

## **1. Goal**

Suppose we have the following dependency relationship:

```
BookService -> BookRepository (dependency)
```

We will create a container that automatically **injects the `BookRepository` dependency** while creating the `BookService` instance.

## **2. Defining the `@Inject` Annotation**

Create a custom annotation that plays the same role as Spring's `@Autowired`.

```java
@Retention(RetentionPolicy.RUNTIME)  // ★ accessible through reflection at runtime
public @interface Inject {
}
```

`RetentionPolicy.RUNTIME` is the key here. Without this setting, the annotation information disappears after compilation and cannot be read through reflection.

## **3. Setting Up the Dependency Relationship**

```java
public class BookRepository {
    // data access logic
}

public class BookService {
    @Inject
    BookRepository bookRepository;  // <- an instance should be injected automatically here
}
```

## **4. Implementing `ContainerService` - ★ the Core Code**

```java
public class ContainerService {

    public static <T> T getObject(Class<T> classType) {
        // Step 1: create an instance of the given class
        T instance = createInstance(classType);

        // Step 2: iterate through fields and inject dependencies into fields marked with @Inject
        Arrays.stream(classType.getDeclaredFields()).forEach(field -> {
            Inject annotation = field.getAnnotation(Inject.class);

            if (annotation != null) {
                // Create an instance using the type of the field marked with @Inject
                Object fieldInstance = createInstance(field.getType());

                // Allow access even to private fields
                field.setAccessible(true);

                try {
                    // Inject the created instance into the field
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
            // Create an instance through the default constructor (reflection)
            return classType.getConstructor(null).newInstance();
        } catch (InstantiationException | IllegalAccessException |
                 IllegalArgumentException | InvocationTargetException |
                 NoSuchMethodException | SecurityException e) {
            throw new RuntimeException(e);
        }
    }
}
```

Let us trace what this code does step by step.

```
Call ContainerService.getObject(BookService.class)
      |
      v
[Step 1] createInstance(BookService.class)
  \-> BookService.class.getConstructor(null).newInstance()
       \-> Create BookService instance (bookRepository is still null)
      |
      v
[Step 2] Iterate through fields of BookService
  |- find bookRepository field
  |    \-> field.getAnnotation(Inject.class) -> @Inject exists!
  |         |
  |         v
  |    createInstance(BookRepository.class)
  |    \-> BookRepository.class.getConstructor(null).newInstance()
  |         \-> create BookRepository instance
  |         |
  |         v
  |    field.setAccessible(true)  <- allow access to private field
  |    field.set(bookServiceInstance, bookRepositoryInstance)
  |         \-> BookService.bookRepository = new BookRepository()
  |
  v
Return BookService (with bookRepository injected)
```

## **5. Verifying with Tests**

```java
public class AppTest {

    @Test
    public void getObject_BookService() {
        BookService bookService = ContainerService.getObject(BookService.class);

        assertNotNull(bookService);                // verify BookService instance creation
        assertNotNull(bookService.bookRepository); // verify automatic BookRepository injection
    }

    @Test
    public void getObject_BookRepository() {
        BookRepository bookRepository = ContainerService.getObject(BookRepository.class);

        assertNotNull(bookRepository);  // verify classes without @Inject are also created normally
    }
}
```

Both tests pass. When `BookService` is created, a `BookRepository` instance is automatically injected into the `bookRepository` field marked with `@Inject`.

## **6. Comparison with the Spring IoC Container**

Let us compare the `ContainerService` we built with the real Spring IoC container.

|                          | `ContainerService` (manual implementation)             | Spring IoC Container                                      |
| ------------------------ | ------------------------------------------------------ | --------------------------------------------------------- |
| **Instance creation**    | `clazz.getConstructor().newInstance()` (reflection)    | same principle + CGLIB proxy creation                     |
| **Dependency detection** | scan `@Inject` through reflection                      | scan `@Autowired` / `@Inject` through reflection          |
| **Dependency injection** | `field.set(instance, fieldInstance)` (field injection) | supports field, constructor, and setter injection         |
| **Bean scope**           | always a new instance (Prototype)                      | Singleton by default + Prototype, Request, and more       |
| **Dependency graph**     | resolves only one level deep                           | recursively resolves the full dependency graph            |
| **Lifecycle management** | none                                                   | `@PostConstruct`, `@PreDestroy`, `InitializingBean`, etc. |

The core principle is the same: **read class metadata through reflection, create instances, and inject dependencies based on annotations**. Spring adds features on top of that such as singleton management, circular dependency detection, and AOP proxy generation.

---

# Summary of the Full Learning Flow

```
[Part 1] Manual proxy
  \-> Problem: proxy classes must be written by hand, duplicate code appears when methods are added
      |
      v
[Part 2] Spring AOP
  |- ProxyFactoryBean: delegate proxy generation to Spring
  \- @Aspect: declarative AOP with Pointcut expressions
      |  Q: how does Spring dynamically create proxies?
      v
[Part 3] JDK Dynamic Proxy
  \-> Proxy.newProxyInstance() + InvocationHandler
      |  Q: how does method.invoke() inside invoke() work?
      |  Limitation: interface-based only -> CGLIB complements with class-based proxies
      v
[Part 4] Reflection API
  |- Obtain Class objects (getClass(), .class, Class.forName())
  |- Query and manipulate fields / methods / constructors
  \- method.invoke(), constructor.newInstance()
      |  Q: can this be used to build a DI container like Spring?
      v
[Part 5] Implement a DI container directly
  \-> Automatic dependency injection with @Inject + reflection
      \-> Experience the core principle of Spring IoC firsthand
```

The bigger picture becomes even clearer if we connect this to the previous Servlet Deep Dive post.

```
Tomcat (servlet container)            Spring (IoC container)
  |                                    |
  | clazz.getConstructor()             | clazz.getConstructor()
  |      .newInstance()                |      .newInstance()
  | -> create servlet instance         | -> create bean instance
  |                                    |
  |                                    | field.set(instance, dep)
  |                                    | -> dependency injection
  |                                    |
  |                                    | Proxy.newProxyInstance()
  |                                    | -> create AOP proxy
  \-> servlet.init()                   |
     servlet.service()                 \-> @PostConstruct
                                          execute business logic
```

All of Tomcat's servlet management, Spring's DI, and Spring AOP's proxy generation are built on top of the same foundational technology: **reflection**.

## Closing Thoughts (๑╹o╹)✎

In this post, I traced the process step by step from the limitations of manual proxies to Spring AOP, JDK Dynamic Proxy, the Reflection API, and finally implementing a DI container ourselves. In particular, when I implemented `ContainerService.getObject()` in Part 5, I could directly experience that Spring's `@Autowired` works internally through `field.setAccessible(true)` + `field.set()`.

In the previous post, I traced how Tomcat's `DefaultInstanceManager` creates servlets through reflection. This time, seeing that the same reflection mechanism also plays a core role in Spring AOP and DI made the whole picture much clearer.

If you spot anything incorrect, please let me know in the comments. 🙇🏻‍♀️

## References

- [Spring Framework Reference - Aspect Oriented Programming](https://docs.spring.io/spring-framework/reference/core/aop.html)
- [Java Reflection API - Oracle Documentation](https://docs.oracle.com/javase/tutorial/reflect/)
- [Spring AOP Source Code - ProxyFactoryBean](https://github.com/spring-projects/spring-framework/blob/main/spring-aop/src/main/java/org/springframework/aop/framework/ProxyFactoryBean.java)
- [Java Dynamic Proxy - java.lang.reflect.Proxy](https://docs.oracle.com/javase/8/docs/api/java/lang/reflect/Proxy.html)
- [Lecture Notes - AOP Overview to Dynamic Proxy](https://baceru.vercel.app/Daily/1.aop-overview/1.aop-overview)
