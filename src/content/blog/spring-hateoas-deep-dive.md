---
author: Hanna922
pubDatetime: 2026-03-18T07:00:00.000Z
modDatetime:
title: Spring HATEOAS Deep Dive - REST API 성숙도 모델부터 Product Service 구현까지
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
description: REST API 성숙도 모델의 개념부터 Spring HATEOAS를 활용한 Product Service 구현까지, 단계별 실습으로 체감해보자
---

이 글은 Spring Boot 4.0.3 / Java 21 기준으로 작성되었습니다.

REST API의 성숙도 모델을 분석하고, HATEOAS가 왜 필요한지 이해한 뒤, Spring HATEOAS의 핵심 추상화를 Hello World 프로젝트로 학습합니다. 마지막으로 JWT 인증, JPA, Bean Validation을 결합한 Product Service를 직접 구현하여 HATEOAS가 실제 API 설계에서 어떻게 동작하는지 체감합니다.

## Prerequisites

**REST(Representational State Transfer)란**

REST는 Roy Fielding이 2000년 박사 논문에서 제안한 아키텍처 스타일입니다. 웹의 기존 인프라(HTTP, URI, 미디어 타입)를 최대한 활용하여, 클라이언트와 서버 사이의 상호작용을 설계하는 원칙의 집합입니다. REST의 핵심 제약 조건으로는 Client-Server, Stateless, Cacheable, Uniform Interface, Layered System 등이 있습니다.

**Richardson Maturity Model — REST API의 성숙도**

Leonard Richardson이 제안한 이 모델은 REST API를 4단계로 분류합니다. 대부분의 API가 Level 2에 머물러 있으며, Level 3(HATEOAS)까지 도달해야 비로소 "RESTful"하다고 할 수 있습니다.

```
Level 3 │  Hypermedia Controls (HATEOAS)    ← 이 글의 핵심
        │  응답에 다음 가능한 행동의 링크를 포함
────────┤
Level 2 │  HTTP Verbs
        │  GET, POST, PUT, DELETE를 목적에 맞게 사용
────────┤
Level 1 │  Resources
        │  /products, /products/{id} 등 리소스 기반 URI
────────┤
Level 0 │  The Swamp of POX
        │  단일 엔드포인트에 모든 요청 (RPC 스타일)
────────┘
```

Level 2까지의 API는 클라이언트가 **API 문서를 읽고 다음에 호출할 URL을 하드코딩**해야 합니다. Level 3에서는 서버가 응답에 **"다음에 할 수 있는 행동"의 링크를 포함**하므로, 클라이언트가 서버의 응답만으로 워크플로우를 따라갈 수 있습니다.

**Spring Boot의 계층 구조**

이 글에서 구현하는 Product Service는 전형적인 Spring Boot 계층 구조를 따릅니다.

```
HTTP 요청
    │
    ▼
┌─────────────────────────────────────┐
│          Controller 계층             │
│  ┌─────────────────────────────┐    │
│  │ ProductController           │    │
│  │ AuthController              │    │
│  └──────────┬──────────────────┘    │
│             │  DTO (Request/Response)│
└─────────────┼───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│           Service 계층               │
│  ┌─────────────────────────────┐    │
│  │ ProductService              │    │
│  │ AuthService                 │    │
│  └──────────┬──────────────────┘    │
│             │  Entity                │
└─────────────┼───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│         Repository 계층              │
│  ┌─────────────────────────────┐    │
│  │ ProductRepository (JPA)     │    │
│  └──────────┬──────────────────┘    │
│             │  SQL                   │
└─────────────┼───────────────────────┘
              │
              ▼
         MySQL / H2
```

각 계층은 단방향 의존 관계를 가지며, Controller → Service → Repository 순서로만 호출합니다. 이 구조 덕분에 각 계층을 독립적으로 테스트하고 교체할 수 있습니다.

---

# Part 1. HATEOAS의 개념과 핵심 원리

## **1. HATEOAS란**

HATEOAS(Hypermedia As The Engine Of Application State)는 REST 아키텍처의 제약 조건 중 하나입니다. 핵심은 **서버의 응답에 "다음에 수행할 수 있는 행동"의 하이퍼미디어 링크를 포함**하는 것입니다.

일반적인 REST API 응답과 HATEOAS 적용 응답을 비교하면 차이가 명확합니다.

```json
// ── Level 2: 일반 REST API 응답 ──
{
  "id": 1,
  "name": "MacBook Pro",
  "price": 3500000,
  "category": "Electronics"
}

// ── Level 3: HATEOAS 적용 응답 ──
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

Level 2 응답을 받은 클라이언트는 "이 상품을 수정하려면 어디로 요청해야 하지?"라는 질문에 **API 문서를 다시 찾아봐야** 합니다. 반면 Level 3 응답을 받은 클라이언트는 `_links` 안의 `update-product` 링크를 따라가기만 하면 됩니다.

## **2. HATEOAS가 해결하는 문제**

HATEOAS 없이 클라이언트와 서버가 소통하면, 클라이언트는 API의 URL 구조를 하드코딩해야 합니다.

```
// 클라이언트 코드 (HATEOAS 없이)
const product = await fetch('/api/products/1');
// 상품 수정 URL을 클라이언트가 직접 조합
await fetch(`/api/products/${product.id}`, { method: 'PUT', ... });
// 상품 목록 URL도 클라이언트가 직접 알고 있어야 함
await fetch('/api/products?page=0&size=10');
```

이 방식은 서버의 URL 구조가 변경되면 **모든 클라이언트를 수정**해야 합니다. HATEOAS를 적용하면 클라이언트는 서버가 알려주는 링크만 따라가므로, URL 구조가 변경되어도 클라이언트 코드를 수정할 필요가 없습니다.

> **웹 브라우저와의 유사성 🧐**
>
> 사실 우리가 매일 사용하는 웹 브라우저가 바로 HATEOAS의 완벽한 구현체입니다. 브라우저는 첫 페이지의 URL만 알면, 이후에는 페이지에 포함된 링크(`<a href="...">`)를 클릭하여 다음 페이지로 이동합니다. API도 이처럼 동작해야 한다는 것이 HATEOAS의 철학입니다.

## **3. Spring HATEOAS의 핵심 추상화**

Spring HATEOAS는 이 개념을 Java로 구현하기 위한 라이브러리입니다. 핵심 클래스는 세 가지입니다.

```
┌──────────────────────────────────┐
│       RepresentationModel        │  ← 링크를 담을 수 있는 기본 모델
│  ┌──────────────────────────┐    │
│  │  List<Link> links        │    │     add(Link)으로 링크 추가
│  └──────────────────────────┘    │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│         EntityModel<T>           │  ← 단일 리소스 + 링크
│  ┌──────────────────────────┐    │
│  │  T content               │    │     EntityModel.of(product)
│  │  List<Link> links        │    │       .add(Link.of(...))
│  └──────────────────────────┘    │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│       WebMvcLinkBuilder          │  ← 컨트롤러 메서드로부터 링크 생성
│                                  │
│  linkTo(methodOn(Controller      │     타입 안전한 방식으로
│    .class).method(args))         │     URI를 자동 생성
│    .withSelfRel()                │
│    .withRel("next")              │
└──────────────────────────────────┘
```

`RepresentationModel`은 링크 목록을 가지는 기본 클래스이고, `EntityModel<T>`는 여기에 실제 데이터(`content`)를 감싸는 래퍼입니다. `WebMvcLinkBuilder`는 컨트롤러의 메서드 시그니처로부터 타입 안전하게 URI를 생성합니다.

---

# Part 2. Hello World로 배우는 Spring HATEOAS 기초

## **1. 프로젝트 구조와 의존성**

먼저 Spring HATEOAS의 기본 동작을 이해하기 위해 `spring-hateoas-hello-world` 프로젝트를 구성합니다.

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-hateoas'
    implementation 'org.springframework.boot:spring-boot-starter-webmvc'
}
```

`spring-boot-starter-hateoas`가 핵심 의존성입니다. 이 스타터가 `RepresentationModel`, `EntityModel`, `WebMvcLinkBuilder` 등의 클래스를 제공합니다.

## **2. Model 클래스: RepresentationModel 상속**

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

`Greeting`이 `RepresentationModel<Greeting>`을 상속받는 것이 핵심입니다. 이 상속으로 `Greeting` 객체에 `add(Link)` 메서드가 생기고, JSON 직렬화 시 `_links` 필드가 자동으로 추가됩니다.

`@JsonCreator`와 `@JsonProperty`는 Jackson이 JSON을 역직렬화할 때 사용할 생성자와 필드 매핑을 지정합니다. 기본 생성자가 없는 불변 객체에서 Jackson이 어떤 생성자를 사용해야 하는지 명시하는 역할입니다.

## **3. Controller: linkTo + methodOn으로 링크 생성**

```java
@RestController
public class GreetingController {

    private static final String TEMPLATE = "Hello, %s!";

    @RequestMapping("/greeting")
    public HttpEntity<Greeting> greeting(
            @RequestParam(value = "name", defaultValue = "World") String name) {

        Greeting greeting = new Greeting(String.format(TEMPLATE, name));

        // ① methodOn: GreetingController의 greeting()을 "가짜 호출"
        // ② linkTo: 가짜 호출 정보를 바탕으로 실제 URI 생성
        // ③ withSelfRel: 생성된 URI를 "self" 관계의 링크로 추가
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

`linkTo(methodOn(...))` 패턴을 자세히 살펴보겠습니다.

```
methodOn(GreetingController.class).greeting("Hanna")
    │
    │  GreetingController의 CGLIB 프록시를 생성하고,
    │  greeting("Hanna")를 호출하는 "흉내"를 냄
    │  → 이 호출 정보로부터 메서드의 @RequestMapping,
    │    @RequestParam 등의 메타데이터를 추출
    │
    ▼
linkTo(...)
    │
    │  추출된 메타데이터로 URI 생성
    │  → /greeting?name=Hanna
    │
    ▼
.withSelfRel()  또는  .withRel("next")
    │
    │  URI를 Link 객체로 변환하고 관계(rel) 설정
    │  → { "href": "/greeting?name=Hanna", "rel": "self" }
    │
    ▼
greeting.add(...)
    │
    │  Link를 RepresentationModel의 링크 목록에 추가
```

> **linkTo + methodOn의 장점 🧐**
>
> URI를 문자열로 하드코딩(`Link.of("/greeting?name=" + name)`)하면, 컨트롤러의 `@RequestMapping` 값이 변경될 때 링크도 함께 수정해야 합니다. `linkTo(methodOn(...))`은 컨트롤러의 어노테이션으로부터 URI를 자동 생성하므로, 매핑 경로가 변경되어도 링크가 자동으로 갱신됩니다. 이것이 타입 안전한(type-safe) 링크 생성의 핵심입니다.

## **4. 응답 결과**

`GET /greeting?name=Hanna` 요청 시 다음과 같은 응답이 반환됩니다.

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

데이터(`content`)와 함께 다음에 수행할 수 있는 행동(`_links`)이 포함되어 있습니다. 이것이 HATEOAS의 기본 형태입니다. 하지만 이 예제에서는 모든 링크가 동일한 URI를 가리키고 있어, 실제 서비스에서의 HATEOAS 활용을 보기에는 한계가 있습니다. 이제 Product Service에서 실제 CRUD 연산에 맞는 링크를 구성해 보겠습니다.

---

# Part 3. Product Service 설계 — 프로젝트 구조와 의존성

## **1. 전체 프로젝트 구조**

```
product-service/
├── src/main/java/com/hanna/product/productservice/
│   ├── Application.java
│   ├── auth/
│   │   ├── config/
│   │   │   └── SecurityConfig.java       ← Spring Security 설정
│   │   ├── controller/
│   │   │   └── AuthController.java       ← 로그인 엔드포인트
│   │   ├── dto/
│   │   │   ├── LoginRequest.java
│   │   │   └── LoginResponse.java
│   │   ├── security/
│   │   │   ├── AuthenticatedUser.java    ← 인증된 사용자 정보
│   │   │   ├── JwtAuthenticationFilter.java  ← JWT 필터
│   │   │   └── JwtTokenProvider.java     ← JWT 생성/검증
│   │   └── service/
│   │       └── AuthService.java          ← 로그인 처리
│   └── product/
│       ├── controller/
│       │   └── ProductController.java    ← 상품 CRUD + HATEOAS
│       ├── dto/
│       │   ├── CreateProductRequest.java
│       │   ├── ProductListResponse.java  ← RepresentationModel 상속
│       │   └── ProductResponse.java
│       ├── entity/
│       │   └── Product.java              ← JPA 엔티티
│       ├── repository/
│       │   └── ProductRepository.java    ← Spring Data JPA
│       └── service/
│           └── ProductService.java       ← 비즈니스 로직
├── src/main/resources/
│   └── application.properties
└── src/test/
    ├── java/.../
    │   ├── auth/service/AuthServiceTest.java
    │   └── product/service/ProductServiceTest.java
    └── resources/application.properties  ← 테스트용 H2 설정
```

## **2. 의존성 분석**

```groovy
dependencies {
    // ── 핵심 ──
    implementation 'org.springframework.boot:spring-boot-starter-hateoas'    // HATEOAS
    implementation 'org.springframework.boot:spring-boot-starter-webmvc'     // Spring MVC
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'   // JPA
    implementation 'org.springframework.boot:spring-boot-starter-security'   // Spring Security
    implementation 'org.springframework.boot:spring-boot-starter-validation' // Bean Validation

    // ── JWT ──
    implementation 'io.jsonwebtoken:jjwt-api:0.12.7'
    runtimeOnly    'io.jsonwebtoken:jjwt-impl:0.12.7'
    runtimeOnly    'io.jsonwebtoken:jjwt-jackson:0.12.7'

    // ── API 문서 ──
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:3.0.2'

    // ── DB ──
    runtimeOnly    'com.mysql:mysql-connector-j'       // 운영: MySQL
    testRuntimeOnly 'com.h2database:h2'                // 테스트: H2
}
```

jjwt 라이브러리는 API/구현/직렬화가 분리된 구조입니다. `jjwt-api`만 `implementation`으로 의존하고, `jjwt-impl`과 `jjwt-jackson`은 `runtimeOnly`로 선언하여 컴파일 타임에는 인터페이스만 사용하고 런타임에 구현체가 로드되는 구조입니다.

운영 환경에서는 MySQL을, 테스트에서는 H2 인메모리 DB를 사용합니다. `testRuntimeOnly`로 선언된 H2는 테스트 실행 시에만 클래스패스에 포함됩니다.

---

# Part 4. JWT 인증 구현 — Stateless 보안

Product Service에서는 상품 생성/수정/삭제에 인증이 필요합니다. REST API의 Stateless 원칙에 맞게 JWT(JSON Web Token) 기반 인증을 구현합니다.

## **1. 인증 흐름 전체 아키텍처**

```
클라이언트                     서버
    │                           │
    │  POST /api/auth/login     │
    │  { username, password }   │
    │ ─────────────────────────→│
    │                           │  AuthController
    │                           │    → AuthService.login()
    │                           │      → 자격 증명 확인
    │                           │      → JwtTokenProvider.generateToken()
    │                           │
    │  { accessToken: "ey..." } │
    │ ←─────────────────────────│
    │                           │
    │  POST /api/products       │
    │  Authorization: Bearer ey.│
    │ ─────────────────────────→│
    │                           │  JwtAuthenticationFilter
    │                           │    → "Bearer " 접두사 제거
    │                           │    → JwtTokenProvider.isValid()
    │                           │    → SecurityContext에 인증 정보 설정
    │                           │
    │                           │  SecurityConfig
    │                           │    → POST /api/** → authenticated()
    │                           │
    │                           │  ProductController
    │                           │    → Authentication에서 userId 추출
    │                           │
    │  201 Created + HATEOAS    │
    │ ←─────────────────────────│
```

## **2. JwtTokenProvider — 토큰 생성과 검증**

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
            .subject(user.username())           // sub 클레임
            .claim("userId", user.userId())     // 커스텀 클레임
            .issuedAt(Date.from(now))           // iat
            .expiration(Date.from(              // exp
                    now.plusMillis(expirationMillis)))
            .signWith(secretKey)                // HMAC-SHA 서명
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
            .verifyWith(secretKey)              // 서명 검증 키 설정
            .build()
            .parseSignedClaims(token)           // 파싱 + 서명 검증 + 만료 확인
            .getPayload();
    }
}
```

`@Value`로 `application.properties`의 설정값을 주입받습니다. `secret` 문자열을 `Keys.hmacShaKeyFor()`로 변환하여 HMAC-SHA256 키를 생성합니다. `parseClaims()`는 서명 검증과 만료 시간 확인을 한번에 수행하며, 어느 하나라도 실패하면 예외를 던집니다.

> **인증 정보 모델링: AuthenticatedUser record 🧐**
>
> `AuthenticatedUser`는 `record`로 선언되어 있습니다. JWT에서 추출한 `userId`와 `username`만 보유하는 불변 값 객체로, Spring Security의 `UserDetails`를 구현하지 않습니다. 이 프로젝트에서는 역할(Role) 기반 인가가 필요하지 않고, 소유권 기반 인가(`product.getUserId().equals(userId)`)만 사용하므로 이 간결한 구조로 충분합니다.

## **3. JwtAuthenticationFilter — 매 요청마다 토큰 검증**

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
                            AuthorityUtils.NO_AUTHORITIES // 역할 없음
                        );

                SecurityContextHolder.getContext()
                        .setAuthentication(authentication);
            }
        }

        filterChain.doFilter(request, response);
    }
}
```

`OncePerRequestFilter`를 상속하여 요청당 한 번만 실행됩니다. `Authorization: Bearer <token>` 헤더에서 토큰을 추출하고, 유효한 경우 `SecurityContextHolder`에 인증 정보를 설정합니다. 유효하지 않은 토큰이거나 헤더가 없으면, 인증 정보를 설정하지 않고 `filterChain.doFilter()`로 다음 필터에 넘깁니다. 이 경우 `SecurityConfig`의 인가 규칙에 따라 인증이 필요한 엔드포인트에서 401이 반환됩니다.

## **4. SecurityConfig — 엔드포인트별 접근 제어**

```java
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http)
            throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)       // REST API이므로 CSRF 비활성화
            .sessionManagement(session -> session
                .sessionCreationPolicy(
                    SessionCreationPolicy.STATELESS))    // 세션 미사용
            .authorizeHttpRequests(authorize -> authorize
                .requestMatchers("/api/auth/**",
                    "/swagger-ui/**",
                    "/v3/api-docs/**").permitAll()        // 인증 불필요
                .requestMatchers(HttpMethod.GET,
                    "/api/**").permitAll()                // GET은 공개
                .requestMatchers(HttpMethod.POST,
                    "/api/**").authenticated()            // 쓰기는 인증 필요
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

핵심 설계는 **"읽기는 공개, 쓰기는 인증 필요"**입니다. `GET /api/**`는 `permitAll()`이므로 누구나 상품을 조회할 수 있지만, `POST`, `PUT`, `DELETE`는 `authenticated()`이므로 유효한 JWT가 필요합니다. `SessionCreationPolicy.STATELESS`로 서버에 세션을 생성하지 않아 REST의 Stateless 원칙을 준수합니다.

```
요청 처리 순서:

HTTP Request
    │
    ▼
JwtAuthenticationFilter        ← UsernamePasswordAuthenticationFilter 앞에 위치
    │  토큰 유효 → SecurityContext에 인증 설정
    │  토큰 없음/무효 → 그냥 통과
    ▼
Spring Security 인가 체크
    │  GET /api/** → permitAll → 통과
    │  POST /api/** → authenticated → 인증 정보 있으면 통과, 없으면 401
    ▼
Controller
```

## **5. AuthService — 로그인 처리**

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

> **인메모리 사용자 저장소에 대한 의도적 선택 🧐**
>
> `AuthService`에서 사용자 정보를 `Map.of()`로 메모리에 하드코딩한 것은, 이 프로젝트의 주 목적이 **HATEOAS와 인증 연동 패턴**을 학습하는 것이기 때문입니다. 운영 환경에서는 당연히 DB 기반의 `UserRepository`와 `PasswordEncoder`(BCrypt 등)로 교체해야 합니다. 다만 학습 단계에서 UserDetails, UserDetailsService, PasswordEncoder 등 Spring Security의 모든 추상화를 한꺼번에 도입하면 HATEOAS라는 핵심 주제에서 벗어나므로, 의도적으로 최소한의 구현을 선택했습니다.

---

# Part 5. Product CRUD — HATEOAS가 빛나는 순간

## **1. Entity와 Repository**

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

`@NoArgsConstructor(access = AccessLevel.PROTECTED)`는 JPA가 리플렉션으로 엔티티를 생성할 때 필요한 기본 생성자를 제공하되, 외부에서 무분별하게 빈 객체를 생성하는 것을 방지합니다. `userId` 필드로 상품의 소유자를 추적하여, 수정/삭제 시 소유권 검증에 사용합니다.

```java
public interface ProductRepository
        extends JpaRepository<Product, Long> {
    Page<Product> findByCategory(String category, Pageable pageable);
}
```

Spring Data JPA의 메서드 이름 기반 쿼리 생성으로, `findByCategory`만 선언하면 `WHERE category = ?` 쿼리가 자동 생성됩니다. `Pageable` 파라미터를 받아 페이징 처리도 자동입니다.

## **2. DTO와 Bean Validation**

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

`record`를 DTO로 사용하여 불변성을 보장합니다. Bean Validation 어노테이션으로 컨트롤러 진입 전에 입력값을 검증합니다. `@Valid @RequestBody CreateProductRequest request`로 컨트롤러에서 검증을 활성화합니다.

## **3. ProductService — 소유권 기반 인가**

```java
@Service
@Transactional
public class ProductService {

    public ProductResponse updateProduct(
            Long id, CreateProductRequest request, Long userId) {
        Product product = productRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Product not found"));

        // ★ 소유권 검증: 자신의 상품만 수정 가능
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

`@Transactional`이 클래스 레벨에 선언되어 모든 public 메서드에 트랜잭션이 적용됩니다. `product.update()` 호출 후 별도의 `save()`가 필요 없는 이유는, JPA의 **Dirty Checking** 때문입니다. 트랜잭션 내에서 영속 상태의 엔티티 필드가 변경되면, 트랜잭션 커밋 시점에 JPA가 자동으로 UPDATE 쿼리를 실행합니다.

읽기 전용 메서드에는 `@Transactional(readOnly = true)`를 선언하여 JPA가 Dirty Checking을 건너뛰게 합니다.

## **4. ProductController — HATEOAS 링크의 실전 적용**

이 컨트롤러가 이 글의 핵심입니다. Hello World에서 배운 `RepresentationModel`, `EntityModel`, `Link`가 실제 CRUD에서 어떻게 활용되는지 살펴봅니다.

### 상품 생성 — 201 Created + 다음 행동 안내

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

응답에 포함되는 링크의 의미를 정리하면 다음과 같습니다.

| rel              | 의미               | 클라이언트 행동                   |
| ---------------- | ------------------ | --------------------------------- |
| `self`           | 방금 생성된 리소스 | 이 URL로 GET하면 상품 상세 조회   |
| `profile`        | API 문서           | Swagger UI에서 전체 API 확인      |
| `list-products`  | 상품 목록          | URI 템플릿에 category를 넣어 필터 |
| `update-product` | 상품 수정          | 이 URL로 PUT 요청                 |
| `delete-product` | 상품 삭제          | 이 URL로 DELETE 요청              |

`ResponseEntity.created(location)`은 HTTP 201 상태 코드와 함께 `Location` 헤더에 새 리소스의 URI를 설정합니다. 이것이 REST API의 표준적인 리소스 생성 응답 패턴입니다.

### 상품 조회 — 소유자에 따라 다른 링크 제공

```java
@GetMapping("/{id}")
public ResponseEntity<EntityModel<ProductResponse>> getProduct(
        @PathVariable Long id, Authentication authentication) {

    ProductResponse response = productService.getProduct(id);
    // ...

    EntityModel<ProductResponse> body = EntityModel.of(response)
        .add(Link.of(selfUri.toString()).withSelfRel())
        .add(Link.of("/swagger-ui/index.html").withRel("profile"));

    // ★ 소유자에게만 수정/삭제 링크 제공
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

> **HATEOAS의 진가 — 상태에 따른 동적 링크 🧐**
>
> 이 메서드가 HATEOAS의 진가를 보여줍니다. 동일한 상품을 조회하더라도, **요청자가 소유자인지 아닌지에 따라 응답에 포함되는 링크가 달라집니다**. 소유자에게는 `update-product`, `delete-product` 링크가 제공되고, 비소유자에게는 제공되지 않습니다. 클라이언트는 응답의 `_links`에 `update-product`이 있으면 수정 버튼을 보여주고, 없으면 숨깁니다. 서버가 "이 사용자가 지금 할 수 있는 행동"을 응답에 직접 알려주는 것입니다. 이것이 "Hypermedia As The **Engine** Of **Application State**"의 의미입니다.

### 상품 목록 — 페이지네이션과 HATEOAS

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

`ProductListResponse`가 `RepresentationModel`을 상속받아 목록 레벨에서 링크를 가집니다. `productsPage.hasNext()`로 다음 페이지 존재 여부를 확인하고, 있을 때만 `next` 링크를 추가합니다. 클라이언트는 `_links.next`가 있으면 "다음 페이지" 버튼을 보여주고, 없으면 숨깁니다.

---

# Part 6. 테스트 전략 — Service 계층 단위 테스트

## **1. AuthServiceTest**

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

외부 의존성이 `JwtTokenProvider`뿐이므로 Mocking 없이 직접 인스턴스를 생성합니다. 로그인 성공과 실패 케이스를 모두 검증합니다.

## **2. ProductServiceTest**

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
            1, "Old", 2L);   // userId=2L (소유자)
        setProductId(product, 1L);

        given(productRepository.findById(1L))
            .willReturn(Optional.of(product));

        // userId=1L (요청자) ≠ userId=2L (소유자) → 403
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

Mockito로 `ProductRepository`를 Mock하여 DB 의존성을 제거합니다. `setProductId()`에서 리플렉션으로 `id` 필드를 설정하는 것은, JPA 엔티티의 `@Id @GeneratedValue` 필드가 setter를 제공하지 않기 때문입니다.

> **테스트 환경 분리 🧐**
>
> `src/test/resources/application.properties`에서 H2 인메모리 DB를 설정합니다. `spring.jpa.hibernate.ddl-auto=create-drop`으로 테스트 시작 시 스키마를 생성하고 종료 시 삭제합니다. 운영(`MySQL`, `ddl-auto=update`)과 테스트(`H2`, `ddl-auto=create-drop`) 환경이 완전히 분리되어 있습니다.

---

# Part 7. Hello World vs Product Service 비교 — HATEOAS 적용의 성숙도 변화

| 항목               | Hello World                     | Product Service                                           |
| ------------------ | ------------------------------- | --------------------------------------------------------- |
| **모델 방식**      | `RepresentationModel` 직접 상속 | `EntityModel<T>` 래퍼 + `RepresentationModel` 상속 (목록) |
| **링크 생성**      | `linkTo(methodOn(...))`         | `Link.of()` + `ServletUriComponentsBuilder`               |
| **링크 의미**      | 모든 링크가 동일 URI (데모용)   | 각 링크가 실제 CRUD 연산에 대응                           |
| **동적 링크**      | 없음 (항상 같은 링크)           | 소유자 여부에 따라 링크 추가/제거                         |
| **페이지네이션**   | 없음                            | `next` 링크 조건부 제공                                   |
| **인증 연동**      | 없음                            | JWT로 인증된 사용자에 따라 링크 변경                      |
| **HTTP 상태 코드** | 항상 200 OK                     | 201 Created, 200 OK, 401, 403, 404 활용                   |

Hello World에서는 `linkTo(methodOn(...))`의 타입 안전한 링크 생성을 학습하고, Product Service에서는 `Link.of()`와 `ServletUriComponentsBuilder`를 조합하여 실제 서비스에 적합한 유연한 링크를 구성합니다. 특히 `withType("PUT")`, `withType("DELETE")`로 HTTP 메서드까지 힌트를 제공하는 것은 Hello World에서는 다루지 않은 실전 패턴입니다.

---

## Closing Thoughts (๑╹o╹)✎

이번 글을 작성하면서, 평소에 "REST API는 JSON 반환하면 되는 거 아닌가?"라고 가볍게 생각했던 부분이, HATEOAS를 적용하면 API의 자기 설명력(self-descriptiveness)이 완전히 달라진다는 것을 체감할 수 있었습니다.

특히 Product Service의 `getProduct()` 메서드에서 **소유자에게만 수정/삭제 링크를 제공**하는 패턴을 구현했을 때, "아, 이것이 Hypermedia As The Engine Of Application State의 의미구나"를 실감했습니다. 서버가 단순히 데이터를 반환하는 것이 아니라, **"지금 이 사용자가 할 수 있는 행동"을 응답에 직접 포함**하는 것입니다. 클라이언트는 이 링크의 존재 여부로 UI를 분기할 수 있고, 서버의 URL 구조가 변경되어도 클라이언트 코드를 수정할 필요가 없습니다.

Hello World에서 `linkTo(methodOn(...))`의 타입 안전한 링크 생성을 먼저 이해하고, Product Service에서 `Link.of()`와 `EntityModel`을 결합하여 실제 CRUD에 맞는 링크를 구성하는 단계적 학습 과정이 효과적이었습니다. JWT 인증과 HATEOAS를 결합하여 "인증 상태에 따라 응답의 링크가 달라지는" 패턴을 직접 구현해 본 것은, 두 기술을 각각 학습했을 때와는 다른 차원의 이해를 줍니다.

틀린 내용이 있다면 댓글로 알려주세요. 🙇🏻‍♀️

## References

- [Spring HATEOAS Reference](https://docs.spring.io/spring-hateoas/docs/current/reference/html/)
- [Building a Hypermedia-Driven RESTful Web Service — Spring Guides](https://spring.io/guides/gs/rest-hateoas)
- [Richardson Maturity Model — Martin Fowler](https://martinfowler.com/articles/richardsonMaturityModel.html)
- [Spring Security Reference](https://docs.spring.io/spring-security/reference/)
- [JJWT — JSON Web Token for Java](https://github.com/jwtk/jjwt)
- [Spring Data JPA Reference](https://docs.spring.io/spring-data/jpa/reference/)
- [SpringDoc OpenAPI](https://springdoc.org/)
