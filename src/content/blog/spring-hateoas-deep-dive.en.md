---
author: Hanna922
pubDatetime: 2026-03-18T07:00:00.000Z
modDatetime:
title: Spring HATEOAS Deep Dive - From REST Maturity Model to Product Service Implementation
titleEn: Spring HATEOAS Deep Dive - From REST Maturity Model to Product Service Implementation
featured: false
draft: false
tags:
  - Spring Boot
  - HATEOAS
  - REST API
  - JWT
  - Spring Security
  - JPA
  - Deep Dive
description: Let us walk step by step from the concept of the REST API maturity model to implementing a Product Service with Spring HATEOAS
---

This post is written based on Spring Boot 4.0.3 / Java 21.

After analyzing the REST API maturity model and understanding why HATEOAS is necessary, I learn the core abstractions of Spring HATEOAS through a Hello World project. Finally, by directly implementing a Product Service that combines JWT authentication, JPA, and Bean Validation, I show how HATEOAS works in real API design.

## Prerequisites

**What is REST (Representational State Transfer)?**

REST is an architectural style proposed by Roy Fielding in his 2000 doctoral dissertation. It is a set of principles for designing interactions between clients and servers by making maximum use of the web's existing infrastructure such as HTTP, URI, and media types. Core REST constraints include Client-Server, Stateless, Cacheable, Uniform Interface, and Layered System.

**Richardson Maturity Model - REST API Maturity**

This model, proposed by Leonard Richardson, classifies REST APIs into four levels. Most APIs stop at Level 2, and only when they reach Level 3 (HATEOAS) can they truly be called "RESTful."

```
Level 3 |  Hypermedia Controls (HATEOAS)    <- the core of this post
        |  Include links for the next possible actions in the response
--------|
Level 2 |  HTTP Verbs
        |  Use GET, POST, PUT, DELETE appropriately
--------|
Level 1 |  Resources
        |  Resource-based URIs such as /products, /products/{id}
--------|
Level 0 |  The Swamp of POX
        |  All requests go to a single endpoint (RPC style)
--------|
```

Up to Level 2, the client has to **read the API documentation and hardcode the next URL to call**. In Level 3, the server includes **links for "what can be done next"** in the response, so the client can follow the workflow using only the server's response.

**Layered Structure in Spring Boot**

The Product Service implemented in this post follows a typical Spring Boot layered structure.

```
HTTP Request
    |
    v
+-------------------------------------+
|          Controller Layer           |
|  +-----------------------------+    |
|  | ProductController           |    |
|  | AuthController              |    |
|  +----------+------------------+    |
|             | DTO (Request/Response)|
+-------------+-----------------------+
              |
+-------------v-----------------------+
|            Service Layer            |
|  +-----------------------------+    |
|  | ProductService              |    |
|  | AuthService                 |    |
|  +----------+------------------+    |
|             | Entity                |
+-------------+-----------------------+
              |
+-------------v-----------------------+
|          Repository Layer           |
|  +-----------------------------+    |
|  | ProductRepository (JPA)     |    |
|  +----------+------------------+    |
|             | SQL                   |
+-------------+-----------------------+
              |
              v
         MySQL / H2
```

Each layer has a one-way dependency relationship and is called only in the order Controller -> Service -> Repository. Thanks to this structure, each layer can be tested and replaced independently.

---

# Part 1. Core Concepts and Principles of HATEOAS

## **1. What is HATEOAS?**

HATEOAS (Hypermedia As The Engine Of Application State) is one of the constraints of REST architecture. The core idea is to **include hypermedia links for "what can be done next" in the server's response**.

The difference becomes clear when comparing a regular REST API response with a HATEOAS-enabled response.

```json
// -- Level 2: regular REST API response --
{
  "id": 1,
  "name": "MacBook Pro",
  "price": 3500000,
  "category": "Electronics"
}

// -- Level 3: HATEOAS-enabled response --
{
  "id": 1,
  "name": "MacBook Pro",
  "price": 3500000,
  "category": "Electronics",
  "_links": {
    "self": { "href": "/api/products/1" },
    "update-product": { "href": "/api/products/1", "type": "PUT" },
    "delete-product": { "href": "/api/products/1", "type": "DELETE" },
    "list-products": { "href": "/api/products?page=0&size=10", "type": "GET" }
  }
}
```

When a client receives the Level 2 response, it has to **go back to the API documentation** to answer the question, "Where should I send a request to update this product?" In contrast, a client that receives the Level 3 response only needs to follow the `update-product` link inside `_links`.

## **2. The Problem HATEOAS Solves**

Without HATEOAS, the client has to hardcode the API's URL structure.

```
// client code (without HATEOAS)
const product = await fetch('/api/products/1');
// client constructs the product update URL directly
await fetch(`/api/products/${product.id}`, { method: 'PUT', ... });
// the client also has to know the list URL directly
await fetch('/api/products?page=0&size=10');
```

With this approach, if the server's URL structure changes, **every client must be modified**. When HATEOAS is applied, the client only follows the links the server provides, so client code does not need to change even if the URL structure changes.

> **Similarity to a Web Browser 🧐**
>
> In fact, the web browser we use every day is a perfect implementation of HATEOAS. If the browser knows only the URL of the first page, after that it moves to the next page by clicking links contained in the page (`<a href="...">`). The philosophy of HATEOAS is that APIs should behave the same way.

## **3. Core Abstractions in Spring HATEOAS**

Spring HATEOAS is a library for implementing this concept in Java. There are three core classes.

```
+----------------------------------+
|       RepresentationModel        |  <- base model that can hold links
|  +--------------------------+    |
|  |  List<Link> links        |    |     add(Link) adds links
|  +--------------------------+    |
+----------------------------------+

+----------------------------------+
|         EntityModel<T>           |  <- single resource + links
|  +--------------------------+    |
|  |  T content               |    |     EntityModel.of(product)
|  |  List<Link> links        |    |       .add(Link.of(...))
|  +--------------------------+    |
+----------------------------------+

+----------------------------------+
|       WebMvcLinkBuilder          |  <- create links from controller methods
|                                  |
|  linkTo(methodOn(Controller      |     type-safe
|    .class).method(args))         |     automatic URI generation
|    .withSelfRel()                |
|    .withRel("next")              |
+----------------------------------+
```

`RepresentationModel` is the base class that holds a list of links, and `EntityModel<T>` wraps actual data (`content`) on top of that. `WebMvcLinkBuilder` generates URIs in a type-safe way from controller method signatures.

---

# Part 2. Learning Spring HATEOAS Basics with Hello World

## **1. Project Structure and Dependencies**

To understand the basic behavior of Spring HATEOAS, start with a `spring-hateoas-hello-world` project.

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-hateoas'
    implementation 'org.springframework.boot:spring-boot-starter-webmvc'
}
```

`spring-boot-starter-hateoas` is the key dependency. This starter provides classes such as `RepresentationModel`, `EntityModel`, and `WebMvcLinkBuilder`.

## **2. Model Class: Extending `RepresentationModel`**

```java
public class Greeting extends RepresentationModel<Greeting> {

    private final String content;

    @JsonCreator
    public Greeting(@JsonProperty("content") String content) {
        this.content = content;
    }

    public String getContent() {
        return content;
    }
}
```

The key point is that `Greeting` extends `RepresentationModel<Greeting>`. Through this inheritance, the `Greeting` object gains the `add(Link)` method, and the `_links` field is automatically added during JSON serialization.

`@JsonCreator` and `@JsonProperty` specify which constructor and field mapping Jackson should use during JSON deserialization. They make explicit which constructor should be used when working with an immutable object that has no default constructor.

## **3. Controller: Generating Links with `linkTo` + `methodOn`**

```java
@RestController
public class GreetingController {

    private static final String TEMPLATE = "Hello, %s!";

    @RequestMapping("/greeting")
    public HttpEntity<Greeting> greeting(
            @RequestParam(value = "name", defaultValue = "World") String name) {

        Greeting greeting = new Greeting(String.format(TEMPLATE, name));

        // ① methodOn: "fake call" GreetingController.greeting()
        // ② linkTo: generate the actual URI from the fake call information
        // ③ withSelfRel: add the generated URI as a "self" link
        greeting.add(linkTo(methodOn(GreetingController.class)
                .greeting(name)).withSelfRel());
        greeting.add(linkTo(methodOn(GreetingController.class)
                .greeting(name)).withRel("next"));
        greeting.add(linkTo(methodOn(GreetingController.class)
                .greeting(name)).withRel("delete"));

        return new ResponseEntity<>(greeting, HttpStatus.OK);
    }
}
```

Let us look more closely at the `linkTo(methodOn(...))` pattern.

```
methodOn(GreetingController.class).greeting("Hanna")
    |
    |  Create a CGLIB proxy of GreetingController
    |  and "pretend" to call greeting("Hanna")
    |  -> extract metadata such as @RequestMapping
    |     and @RequestParam from that invocation information
    |
    v
linkTo(...)
    |
    |  Generate the URI from the extracted metadata
    |  -> /greeting?name=Hanna
    |
    v
.withSelfRel()  or  .withRel("next")
    |
    |  Convert the URI into a Link object and set the relation (rel)
    |  -> { "href": "/greeting?name=Hanna", "rel": "self" }
    |
    v
greeting.add(...)
    |
    |  Add the Link to the link list in RepresentationModel
```

> **Advantage of `linkTo` + `methodOn` 🧐**
>
> If you hardcode the URI as a string (`Link.of("/greeting?name=" + name)`), the link also has to be changed whenever the controller's `@RequestMapping` value changes. `linkTo(methodOn(...))` automatically generates the URI from the controller annotations, so the link is updated automatically even if the mapping path changes. This is the core of type-safe link generation.

## **4. Response Result**

When a request is sent to `GET /greeting?name=Hanna`, the following response is returned.

```json
{
  "content": "Hello, Hanna!",
  "_links": {
    "self": {
      "href": "http://localhost:8080/greeting?name=Hanna"
    },
    "next": {
      "href": "http://localhost:8080/greeting?name=Hanna"
    },
    "delete": {
      "href": "http://localhost:8080/greeting?name=Hanna"
    }
  }
}
```

Along with the data (`content`), it includes the next possible actions (`_links`). This is the basic form of HATEOAS. However, in this example all links point to the same URI, so it is limited as a real-service HATEOAS example. Let us now move to Product Service and build links that match actual CRUD operations.

---

# Part 3. Product Service Design - Project Structure and Dependencies

## **1. Overall Project Structure**

```
product-service/
|- src/main/java/com/hanna/product/productservice/
|  |- Application.java
|  |- auth/
|  |  |- config/
|  |  |  \- SecurityConfig.java       <- Spring Security configuration
|  |  |- controller/
|  |  |  \- AuthController.java       <- login endpoint
|  |  |- dto/
|  |  |  |- LoginRequest.java
|  |  |  \- LoginResponse.java
|  |  |- security/
|  |  |  |- AuthenticatedUser.java    <- authenticated user information
|  |  |  |- JwtAuthenticationFilter.java  <- JWT filter
|  |  |  \- JwtTokenProvider.java     <- JWT generation / verification
|  |  \- service/
|  |     \- AuthService.java          <- login handling
|  \- product/
|     |- controller/
|     |  \- ProductController.java    <- product CRUD + HATEOAS
|     |- dto/
|     |  |- CreateProductRequest.java
|     |  |- ProductListResponse.java  <- extends RepresentationModel
|     |  \- ProductResponse.java
|     |- entity/
|     |  \- Product.java              <- JPA entity
|     |- repository/
|     |  \- ProductRepository.java    <- Spring Data JPA
|     \- service/
|        \- ProductService.java       <- business logic
|- src/main/resources/
|  \- application.properties
\- src/test/
   |- java/.../
   |  |- auth/service/AuthServiceTest.java
   |  \- product/service/ProductServiceTest.java
   \- resources/application.properties  <- H2 configuration for tests
```

## **2. Dependency Analysis**

```groovy
dependencies {
    // -- core --
    implementation 'org.springframework.boot:spring-boot-starter-hateoas'    // HATEOAS
    implementation 'org.springframework.boot:spring-boot-starter-webmvc'     // Spring MVC
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'   // JPA
    implementation 'org.springframework.boot:spring-boot-starter-security'   // Spring Security
    implementation 'org.springframework.boot:spring-boot-starter-validation' // Bean Validation

    // -- JWT --
    implementation 'io.jsonwebtoken:jjwt-api:0.12.7'
    runtimeOnly    'io.jsonwebtoken:jjwt-impl:0.12.7'
    runtimeOnly    'io.jsonwebtoken:jjwt-jackson:0.12.7'

    // -- API docs --
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:3.0.2'

    // -- DB --
    runtimeOnly    'com.mysql:mysql-connector-j'       // production: MySQL
    testRuntimeOnly 'com.h2database:h2'                // test: H2
}
```

The `jjwt` library has a split structure of API / implementation / serialization. Only `jjwt-api` is declared as `implementation`, while `jjwt-impl` and `jjwt-jackson` are declared as `runtimeOnly`, so only the interfaces are used at compile time and the implementations are loaded at runtime.

MySQL is used in production, while an H2 in-memory database is used in tests. Because H2 is declared as `testRuntimeOnly`, it is included in the classpath only when tests are executed.

---

# Part 4. Implementing JWT Authentication - Stateless Security

In Product Service, authentication is required for product creation, updates, and deletion. To match the stateless principle of REST APIs, JWT (JSON Web Token)-based authentication is implemented.

## **1. Full Authentication Flow Architecture**

```
Client                     Server
    |                        |
    |  POST /api/auth/login  |
    |  { username, password }|
    | ---------------------> |
    |                        |  AuthController
    |                        |    -> AuthService.login()
    |                        |      -> verify credentials
    |                        |      -> JwtTokenProvider.generateToken()
    |                        |
    |  { accessToken: "ey..."}
    | <--------------------- |
    |                        |
    |  POST /api/products    |
    |  Authorization: Bearer ey.
    | ---------------------> |
    |                        |  JwtAuthenticationFilter
    |                        |    -> remove "Bearer " prefix
    |                        |    -> JwtTokenProvider.isValid()
    |                        |    -> set authentication in SecurityContext
    |                        |
    |                        |  SecurityConfig
    |                        |    -> POST /api/** -> authenticated()
    |                        |
    |                        |  ProductController
    |                        |    -> extract userId from Authentication
    |                        |
    |  201 Created + HATEOAS |
    | <--------------------- |
```

## **2. `JwtTokenProvider` - Token Generation and Verification**

```java
@Component
public class JwtTokenProvider {

    private final SecretKey secretKey;
    private final long expirationMillis;

    public JwtTokenProvider(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration-millis}") long expirationMillis) {
        this.secretKey = Keys.hmacShaKeyFor(
                secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMillis = expirationMillis;
    }

    public String generateToken(AuthenticatedUser user) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(user.username())           // sub claim
            .claim("userId", user.userId())     // custom claim
            .issuedAt(Date.from(now))           // iat
            .expiration(Date.from(              // exp
                    now.plusMillis(expirationMillis)))
            .signWith(secretKey)                // HMAC-SHA signature
            .compact();
    }

    public boolean isValid(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    public AuthenticatedUser getAuthenticatedUser(String token) {
        Claims claims = parseClaims(token);
        Long userId = claims.get("userId", Long.class);
        return new AuthenticatedUser(userId, claims.getSubject());
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
            .verifyWith(secretKey)              // set signature verification key
            .build()
            .parseSignedClaims(token)           // parse + verify signature + verify expiration
            .getPayload();
    }
}
```

`@Value` injects settings from `application.properties`. The `secret` string is converted with `Keys.hmacShaKeyFor()` to create an HMAC-SHA256 key. `parseClaims()` performs signature verification and expiration validation in one step, and throws an exception if either one fails.

> **Modeling Authentication Information: `AuthenticatedUser` record 🧐**
>
> `AuthenticatedUser` is declared as a `record`. It is an immutable value object that holds only `userId` and `username` extracted from the JWT, and it does not implement Spring Security's `UserDetails`. In this project, role-based authorization is not needed; only ownership-based authorization (`product.getUserId().equals(userId)`) is used, so this simpler structure is sufficient.

## **3. `JwtAuthenticationFilter` - Validate the Token on Every Request**

```java
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";
    private final JwtTokenProvider jwtTokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String authorizationHeader =
                request.getHeader(HttpHeaders.AUTHORIZATION);

        if (authorizationHeader != null
                && authorizationHeader.startsWith(BEARER_PREFIX)) {
            String token = authorizationHeader
                    .substring(BEARER_PREFIX.length());

            if (jwtTokenProvider.isValid(token)) {
                AuthenticatedUser user =
                        jwtTokenProvider.getAuthenticatedUser(token);

                var authentication =
                        new UsernamePasswordAuthenticationToken(
                            user,                        // principal
                            null,                        // credentials
                            AuthorityUtils.NO_AUTHORITIES // no roles
                        );

                SecurityContextHolder.getContext()
                        .setAuthentication(authentication);
            }
        }

        filterChain.doFilter(request, response);
    }
}
```

By extending `OncePerRequestFilter`, this filter runs only once per request. It extracts the token from the `Authorization: Bearer <token>` header and, if it is valid, sets authentication information into `SecurityContextHolder`. If the token is invalid or the header does not exist, it simply calls `filterChain.doFilter()` without setting authentication. In that case, endpoints that require authentication return 401 according to the authorization rules in `SecurityConfig`.

## **4. `SecurityConfig` - Access Control per Endpoint**

```java
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http)
            throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)       // disable CSRF because this is a REST API
            .sessionManagement(session -> session
                .sessionCreationPolicy(
                    SessionCreationPolicy.STATELESS))    // do not use sessions
            .authorizeHttpRequests(authorize -> authorize
                .requestMatchers("/api/auth/**",
                    "/swagger-ui/**",
                    "/v3/api-docs/**").permitAll()        // no authentication required
                .requestMatchers(HttpMethod.GET,
                    "/api/**").permitAll()                // GET is public
                .requestMatchers(HttpMethod.POST,
                    "/api/**").authenticated()            // writes require authentication
                .requestMatchers(HttpMethod.PUT,
                    "/api/**").authenticated()
                .requestMatchers(HttpMethod.DELETE,
                    "/api/**").authenticated()
                .anyRequest().permitAll()
            )
            .exceptionHandling(exception -> exception
                .authenticationEntryPoint((request, response,
                    authException) -> response
                        .sendError(HttpServletResponse.SC_UNAUTHORIZED))
            )
            .addFilterBefore(jwtAuthenticationFilter,
                UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
```

The core design is **"reads are public, writes require authentication."** `GET /api/**` uses `permitAll()`, so anyone can retrieve products. But `POST`, `PUT`, and `DELETE` use `authenticated()`, so a valid JWT is required. `SessionCreationPolicy.STATELESS` ensures that the server does not create sessions, following the stateless principle of REST.

```
Request processing order:

HTTP Request
    |
    v
JwtAuthenticationFilter        <- placed before UsernamePasswordAuthenticationFilter
    |  valid token   -> set authentication in SecurityContext
    |  no/invalid token -> just pass through
    v
Spring Security authorization check
    |  GET /api/**  -> permitAll -> pass
    |  POST /api/** -> authenticated -> pass if auth exists, 401 otherwise
    v
Controller
```

## **5. `AuthService` - Login Handling**

```java
@Service
public class AuthService {

    private final JwtTokenProvider jwtTokenProvider;
    private final Map<String, UserAccount> users = Map.of(
        "user1", new UserAccount(1L, "user1", "password1"),
        "user2", new UserAccount(2L, "user2", "password2")
    );

    public LoginResponse login(LoginRequest request) {
        UserAccount account = users.get(request.username());

        if (account == null
                || !account.password().equals(request.password())) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid username or password");
        }

        AuthenticatedUser user = new AuthenticatedUser(
                account.userId(), account.username());
        String accessToken = jwtTokenProvider.generateToken(user);
        return new LoginResponse(
                accessToken, "Bearer",
                account.userId(), account.username());
    }

    private record UserAccount(
            Long userId, String username, String password) {}
}
```

> **Intentional Choice of an In-memory User Store 🧐**
>
> The reason `AuthService` hardcodes user information in memory with `Map.of()` is that the main goal of this project is to learn the **integration pattern between HATEOAS and authentication**. In a production environment, this should of course be replaced with a DB-based `UserRepository` and a `PasswordEncoder` such as BCrypt. But if all of Spring Security's abstractions such as `UserDetails`, `UserDetailsService`, and `PasswordEncoder` were introduced at once during the learning stage, it would pull attention away from the core topic of HATEOAS. So a deliberately minimal implementation was chosen.

---

# Part 5. Product CRUD - Where HATEOAS Starts to Shine

## **1. Entity and Repository**

```java
@Entity
@Table(name = "products")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 999)
    private String description;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    @Column(nullable = false)
    private Integer stock;

    @Column(nullable = false, length = 100)
    private String category;

    @Column(nullable = false)
    private Long userId;

    public Product(String name, String description,
            BigDecimal price, Integer stock,
            String category, Long userId) {
        this.name = name;
        this.description = description;
        this.price = price;
        this.stock = stock;
        this.category = category;
        this.userId = userId;
    }

    public void update(String name, String description,
            BigDecimal price, Integer stock, String category) {
        this.name = name;
        this.description = description;
        this.price = price;
        this.stock = stock;
        this.category = category;
    }
}
```

`@NoArgsConstructor(access = AccessLevel.PROTECTED)` provides the default constructor that JPA needs to create entities through reflection, while preventing unrestricted creation of empty objects from outside. The `userId` field tracks the owner of the product and is used for ownership verification during updates and deletes.

```java
public interface ProductRepository
        extends JpaRepository<Product, Long> {
    Page<Product> findByCategory(String category, Pageable pageable);
}
```

With Spring Data JPA's method-name-based query generation, simply declaring `findByCategory` automatically creates a `WHERE category = ?` query. Because it also receives a `Pageable` parameter, pagination is handled automatically as well.

## **2. DTOs and Bean Validation**

```java
public record CreateProductRequest(
    @NotBlank(message = "name is required")
    @Size(max = 100, message = "name must be 100 characters or fewer")
    String name,

    @Size(max = 999,
        message = "description must be fewer than 1000 characters")
    String description,

    @NotNull(message = "price is required")
    @DecimalMin(value = "0", message = "price must be 0 or greater")
    @Digits(integer = 10, fraction = 2,
        message = "price must have up to 10 integer and 2 fraction digits")
    BigDecimal price,

    @NotNull(message = "stock is required")
    @Min(value = 1, message = "stock must be 1 or greater")
    Integer stock,

    @NotBlank(message = "category is required")
    @Size(max = 100,
        message = "category must be 100 characters or fewer")
    String category
) {}
```

Using a `record` for the DTO guarantees immutability. Bean Validation annotations validate input values before entering the controller. Validation is enabled in the controller through `@Valid @RequestBody CreateProductRequest request`.

## **3. `ProductService` - Ownership-based Authorization**

```java
@Service
@Transactional
public class ProductService {

    public ProductResponse updateProduct(
            Long id, CreateProductRequest request, Long userId) {
        Product product = productRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Product not found"));

        // ★ ownership check: only the owner can update the product
        if (!product.getUserId().equals(userId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You can only update your own product");
        }

        product.update(request.name(), request.description(),
                request.price(), request.stock(), request.category());
        return toResponse(product);
    }
    // ...
}
```

Because `@Transactional` is declared at the class level, transactions are applied to all public methods. The reason no separate `save()` call is needed after `product.update()` is **JPA Dirty Checking**. When fields on a managed entity change inside a transaction, JPA automatically executes the UPDATE query at commit time.

For read-only methods, `@Transactional(readOnly = true)` is declared so that JPA skips Dirty Checking.

## **4. `ProductController` - Real-world Application of HATEOAS Links**

This controller is the core of the post. It shows how the `RepresentationModel`, `EntityModel`, and `Link` learned in Hello World are used in actual CRUD.

### Product Creation - 201 Created + guidance for the next action

```java
@PostMapping
public ResponseEntity<EntityModel<ProductResponse>> createProduct(
        @Valid @RequestBody CreateProductRequest request,
        Authentication authentication) {

    Long currentUserId = currentUserId(authentication);
    ProductResponse response =
            productService.createProduct(request, currentUserId);

    URI location = ServletUriComponentsBuilder
        .fromCurrentRequest()
        .path("/{id}")
        .buildAndExpand(response.id())
        .toUri();

    String baseUrl = ServletUriComponentsBuilder
        .fromCurrentContextPath().build().toUriString();

    EntityModel<ProductResponse> body = EntityModel.of(response)
        .add(Link.of(location.toString()).withSelfRel())
        .add(Link.of("/swagger-ui/index.html").withRel("profile"))
        .add(Link.of(baseUrl
            + "/api/products?page=0&size=10{&category}",
            "list-products").withType("GET"))
        .add(Link.of(location.toString(),
            "update-product").withType("PUT"))
        .add(Link.of(location.toString(),
            "delete-product").withType("DELETE"));

    return ResponseEntity.created(location).body(body);
}
```

The meaning of the links included in the response is summarized below.

| rel              | Meaning                   | Client action                                      |
| ---------------- | ------------------------- | -------------------------------------------------- |
| `self`           | The resource just created | GET this URL to retrieve product details           |
| `profile`        | API documentation         | Check the full API in Swagger UI                   |
| `list-products`  | Product list              | Filter by putting `category` into the URI template |
| `update-product` | Update product            | Send a PUT request to this URL                     |
| `delete-product` | Delete product            | Send a DELETE request to this URL                  |

`ResponseEntity.created(location)` sets both HTTP status 201 and the URI of the new resource in the `Location` header. This is the standard REST API response pattern for resource creation.

### Product Retrieval - Provide Different Links Depending on the Owner

```java
@GetMapping("/{id}")
public ResponseEntity<EntityModel<ProductResponse>> getProduct(
        @PathVariable Long id, Authentication authentication) {

    ProductResponse response = productService.getProduct(id);
    // ...

    EntityModel<ProductResponse> body = EntityModel.of(response)
        .add(Link.of(selfUri.toString()).withSelfRel())
        .add(Link.of("/swagger-ui/index.html").withRel("profile"));

    // ★ only the owner gets update/delete links
    Long currentUserId = currentUserIdOrNull(authentication);
    if (response.userId().equals(currentUserId)) {
        body.add(Link.of("/api/orders", "order").withType("POST"));
        body.add(Link.of(selfUri.toString(),
                "update-product").withType("PUT"));
        body.add(Link.of(selfUri.toString(),
                "delete-product").withType("DELETE"));
    }

    return ResponseEntity.ok(body);
}
```

> **The Real Power of HATEOAS - Dynamic Links Based on State 🧐**
>
> This method shows the real power of HATEOAS. Even when the same product is retrieved, **the links included in the response change depending on whether the requester is the owner or not**. Owners receive `update-product` and `delete-product` links, while non-owners do not. The client shows an Edit button if `update-product` exists in `_links`, and hides it if it does not. The server is directly telling the client "what actions this user can take right now" in the response. That is the meaning of "Hypermedia As The **Engine** Of **Application State**."

### Product List - Pagination and HATEOAS

```java
@GetMapping
public ResponseEntity<ProductListResponse> getProducts(
        @RequestParam(required = false) String category,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size) {

    Pageable pageable = PageRequest.of(page, size);
    Page<ProductResponse> productsPage =
            productService.getProducts(category, pageable);

    ProductListResponse response =
            new ProductListResponse(productsPage.getContent());
    response.add(Link.of("/swagger-ui/index.html").withRel("profile"));
    response.add(Link.of(
            buildProductsLink(category, page, size)).withSelfRel());

    if (productsPage.hasNext()) {
        response.add(Link.of(
                buildProductsLink(category, page + 1, size))
                .withRel("next"));
    }

    return ResponseEntity.ok(response);
}
```

Because `ProductListResponse` extends `RepresentationModel`, it can hold links at the list level. `productsPage.hasNext()` checks whether the next page exists, and only then adds a `next` link. The client shows a "Next page" button if `_links.next` exists, and hides it otherwise.

---

# Part 6. Testing Strategy - Unit Tests for the Service Layer

## **1. `AuthServiceTest`**

```java
class AuthServiceTest {

    private final JwtTokenProvider jwtTokenProvider =
            new JwtTokenProvider(
                "change-this-secret-key-change-this-secret-key",
                3600000);
    private final AuthService authService =
            new AuthService(jwtTokenProvider);

    @Test
    void loginReturnsBearerToken() {
        LoginResponse response = authService.login(
                new LoginRequest("user1", "password1"));

        assertThat(response.tokenType()).isEqualTo("Bearer");
        assertThat(response.userId()).isEqualTo(1L);
        assertThat(response.accessToken()).isNotBlank();
    }

    @Test
    void loginRejectsInvalidCredentials() {
        assertThatThrownBy(() -> authService.login(
                new LoginRequest("user1", "wrong")))
            .isInstanceOf(ResponseStatusException.class);
    }
}
```

Because the only external dependency is `JwtTokenProvider`, the service is instantiated directly without mocking. Both login success and failure cases are verified.

## **2. `ProductServiceTest`**

```java
@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    @InjectMocks
    private ProductService productService;

    @Test
    void updateProductRejectsNonOwner() {
        CreateProductRequest request = new CreateProductRequest(
            "iPod Pro", "Updated", new BigDecimal("120000"),
            3, "Electronics");
        Product product = new Product(
            "Old", "Old", new BigDecimal("1000"),
            1, "Old", 2L);   // userId=2L (owner)
        setProductId(product, 1L);

        given(productRepository.findById(1L))
            .willReturn(Optional.of(product));

        // userId=1L (requester) != userId=2L (owner) -> 403
        assertThatThrownBy(() ->
                productService.updateProduct(1L, request, 1L))
            .isInstanceOf(ResponseStatusException.class);
    }

    private void setProductId(Product product, Long id) {
        try {
            var field = Product.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(product, id);
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
```

`ProductRepository` is mocked with Mockito to remove the DB dependency. `setProductId()` uses reflection to set the `id` field because JPA entities with `@Id @GeneratedValue` typically do not provide a setter.

> **Test Environment Separation 🧐**
>
> In `src/test/resources/application.properties`, H2 in-memory DB is configured. With `spring.jpa.hibernate.ddl-auto=create-drop`, the schema is created at test start and dropped at test end. The production environment (`MySQL`, `ddl-auto=update`) and test environment (`H2`, `ddl-auto=create-drop`) are completely separated.

---

# Part 7. Hello World vs Product Service - How HATEOAS Application Matures

| Item                           | Hello World                                 | Product Service                                                        |
| ------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------- |
| **Model style**                | Directly extend `RepresentationModel`       | `EntityModel<T>` wrapper + extending `RepresentationModel` (for lists) |
| **Link generation**            | `linkTo(methodOn(...))`                     | `Link.of()` + `ServletUriComponentsBuilder`                            |
| **Meaning of links**           | All links point to the same URI (demo only) | Each link maps to a real CRUD operation                                |
| **Dynamic links**              | None (always the same links)                | Links are added/removed depending on ownership                         |
| **Pagination**                 | None                                        | Conditionally provide `next` link                                      |
| **Authentication integration** | None                                        | Links change based on the JWT-authenticated user                       |
| **HTTP status codes**          | Always 200 OK                               | Uses 201 Created, 200 OK, 401, 403, 404                                |

In Hello World, the focus is on learning type-safe link generation with `linkTo(methodOn(...))`. In Product Service, `Link.of()` and `ServletUriComponentsBuilder` are combined to create links flexible enough for a real service. In particular, providing HTTP method hints with `withType("PUT")` and `withType("DELETE")` is a practical pattern that the Hello World example does not cover.

---

## Closing Thoughts (๑╹o╹)✎

While writing this post, I realized that the casual assumption of "Isn't a REST API just about returning JSON?" changes completely once HATEOAS is applied. HATEOAS makes the self-descriptiveness of an API fundamentally different.

In particular, when I implemented the pattern in `getProduct()` that **provides update/delete links only to the owner**, I could truly feel what "Hypermedia As The Engine Of Application State" means. The server is not simply returning data, but directly including **"what this user can do right now"** in the response. The client can branch the UI based on whether those links exist, and the client code does not need to change even if the server's URL structure changes.

The step-by-step learning flow was effective: first understand type-safe link generation with `linkTo(methodOn(...))` in Hello World, then combine `Link.of()` and `EntityModel` in Product Service to build links suited to actual CRUD. Implementing the pattern where links change depending on authentication state by combining JWT authentication with HATEOAS gave a different level of understanding than learning each technology separately.

If you spot anything incorrect, please let me know in the comments. 🙇🏻‍♀️

## References

- [Spring HATEOAS Reference](https://docs.spring.io/spring-hateoas/docs/current/reference/html/)
- [Building a Hypermedia-Driven RESTful Web Service - Spring Guides](https://spring.io/guides/gs/rest-hateoas)
- [Richardson Maturity Model - Martin Fowler](https://martinfowler.com/articles/richardsonMaturityModel.html)
- [Spring Security Reference](https://docs.spring.io/spring-security/reference/)
- [JJWT - JSON Web Token for Java](https://github.com/jwtk/jjwt)
- [Spring Data JPA Reference](https://docs.spring.io/spring-data/jpa/reference/)
- [SpringDoc OpenAPI](https://springdoc.org/)
