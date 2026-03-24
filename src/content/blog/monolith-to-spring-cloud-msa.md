---
author: Hanna922
pubDatetime: 2026-03-21T09:00:00.000Z
modDatetime:
title: 모놀리스에서 Spring Cloud MSA까지, 4단계 진화 과정 기록
titleEn: From Monolith to Spring Cloud MSA — A 4-Step Evolution Record
featured: false
draft: false
tags:
  - Spring Cloud
  - MSA
  - Eureka
  - Config Server
  - Service Discovery
  - Monolith
  - Deep Dive
description: 주문-결제 시스템을 모놀리스 → 마이크로서비스 → 서비스 디스커버리 → 중앙화 설정으로 점진적으로 진화시키며 각 단계에서 해결한 문제를 분석해보자
---

이 글은 Spring Boot 3.5.x / Spring Cloud 2025.0.1 / Java 17 기준으로 작성되었습니다.

이번 글에서는 모놀리스 구조에서 마이크로서비스로 전환하면서 **어떤 문제가 발생하고, Spring Cloud의 각 컴포넌트가 그 문제를 어떻게 해결하는지**를 공부합니다. 주문-결제 시스템을 4단계에 걸쳐 점진적으로 진화시키며, 각 단계에서 해결한 문제와 코드 레벨의 변화를 기록해보았습니다.

## Prerequisites

**Cloud Native Application이란**

클라우드 네이티브 애플리케이션은 클라우드 환경에서 최적으로 동작하도록 설계된 애플리케이션으로, 확장성(Scalability), 느슨한 결합(Loose Coupling), 회복성(Resilience), 관측 가능성(Observability)을 핵심 특성으로 가집니다.

**모놀리스 vs 마이크로서비스**

- **모놀리스(Monolith)**: 모든 기능이 하나의 배포 단위에 포함된 구조. 개발 초기에는 단순하지만, 규모가 커지면 하나의 장애가 전체 시스템에 영향을 줌
- **마이크로서비스(Microservice)**: 각 기능이 독립된 서비스로 분리되어 독립적으로 배포·확장 가능한 구조

**Spring Cloud란**

Spring Cloud는 마이크로서비스 아키텍처에서 발생하는 공통 문제들(서비스 탐색, 설정 관리, 부하 분산 등)을 해결하기 위한 Spring 기반 프레임워크 모음입니다.

**예제 도메인**

이 글 전체에서 사용하는 도메인은 **주문-결제 시스템**입니다. 사용자가 주문을 생성하면 결제가 처리되고, 결제 성공/실패에 따라 주문 상태가 결정됩니다.

```
사용자 → [주문 생성] → [결제 처리] → 주문 상태 확정 (COMPLETED / FAILED)
```

---

# Part 1. 모놀리스에서 마이크로서비스로 (Step 01 → Step 02)

## **1. Step 01 — 모놀리스: 모든 것이 하나인 구조**

처음에는 주문과 결제가 하나의 애플리케이션 안에 존재합니다.

```
order-payment-monolith (포트 8080)
  ├→ OrderController    (/orders)
  ├→ OrderService       ← 주문 + 결제 로직이 모두 여기에
  ├→ OrderRepository
  └→ PaymentRepository
```

`OrderService`를 보면, 주문 저장과 결제 처리가 **같은 트랜잭션 안에서** 동기적으로 실행됩니다.

```java
// step01 — OrderService.java
@Transactional
public Order createOrder(OrderRequest request) {
    Order order = Order.builder()
            .itemName(request.itemName())
            .quantity(request.quantity())
            .price(request.price())
            .status(OrderStatus.PENDING)
            .build();
    order = orderRepository.save(order);

    // ★ 결제 처리가 같은 서비스 안에서 직접 실행됨
    PaymentStatus paymentStatus = simulatePaymentFailure();

    Payment payment = Payment.builder()
            .orderId(order.getId())
            .amount(request.price() * request.quantity())
            .status(paymentStatus)
            .paidAt(paymentStatus == PaymentStatus.SUCCESS ? LocalDateTime.now() : null)
            .build();
    paymentRepository.save(payment);

    OrderStatus orderStatus = paymentStatus == PaymentStatus.SUCCESS
            ? OrderStatus.COMPLETED : OrderStatus.FAILED;
    order.setStatus(orderStatus);

    return orderRepository.save(order);
}
```

`simulatePaymentFailure()`는 `simulation.payment.success-rate` 설정값에 따라 결제 성공/실패를 랜덤으로 결정합니다. step01에서는 이 값이 `0`으로 설정되어, **모든 결제가 실패**하도록 시뮬레이션됩니다.

> **모놀리스의 문제점 🧐**
>
> 결제 로직에 장애가 발생하면 주문 자체가 불가능합니다. 결제 서비스가 동일 프로세스 안에 있기 때문에, 결제의 예외가 곧 주문의 예외가 됩니다. 즉, **결제 장애 = 주문 장애**라는 강한 결합(tight coupling)이 존재합니다.

## **2. Step 02 — 마이크로서비스: 서비스 분리**

이 문제를 해결하기 위해 주문과 결제를 별도의 프로젝트로 분리합니다.

```
order-service  (포트 8080)          payment-service (포트 8081)
  ├→ OrderController                  ├→ PaymentController
  ├→ OrderService                     ├→ PaymentService
  ├→ OrderRepository                  └→ PaymentRepository
  └→ RestTemplate (HTTP 클라이언트)
```

핵심 변화는 `OrderService`에서 **결제 로직이 사라지고**, 대신 `RestTemplate`으로 결제 서비스를 HTTP 호출한다는 것입니다.

```java
// step02 — OrderService.java
@Transactional
public Order createOrder(OrderRequest request) {
    Order order = Order.builder()/* ... */.build();
    order = orderRepository.save(order);

    // ★ 결제 서비스를 HTTP로 호출 (별도 프로세스)
    try {
        PaymentRequest paymentRequest = new PaymentRequest(
                order.getId(),
                order.getPrice() * order.getQuantity()
        );

        PaymentResponse paymentResponse = restTemplate.postForObject(
                paymentServiceUrl + "/payments",  // http://localhost:8081
                paymentRequest,
                PaymentResponse.class
        );

        if (paymentResponse != null && "SUCCESS".equals(paymentResponse.status())) {
            order.setStatus(OrderStatus.COMPLETED);
        } else {
            order.setStatus(OrderStatus.FAILED);
        }
    } catch (Exception e) {
        // ★ 결제 서비스 장애 시에도 주문은 PENDING 상태로 유지
    }

    return orderRepository.save(order);
}
```

`try-catch`로 결제 서비스 호출을 감싸고 있다는 것이 핵심입니다. 결제 서비스에 장애가 발생하더라도 예외가 잡히고, 주문은 `PENDING` 상태로 생성됩니다.

> **해결된 문제 ✅**
>
> **결제 서비스 장애 시에도 주문 생성 가능 (내결함성, Fault Tolerance)**. 모놀리스에서는 결제 실패가 곧 주문 실패였지만, 서비스 분리 후에는 결제 서비스가 다운되어도 주문은 `PENDING` 상태로 정상 생성됩니다.

## **3. Step 01 → 02 코드 변화 요약**

|                       | Step 01 (모놀리스)              | Step 02 (마이크로서비스)                        |
| --------------------- | ------------------------------- | ----------------------------------------------- |
| **프로젝트 개수**     | 1개 (`order-payment-monolith`)  | 2개 (`order-service`, `payment-service`)        |
| **결제 처리 위치**    | `OrderService` 내부 메서드 호출 | HTTP 요청 (`RestTemplate`)                      |
| **결제 장애 시 주문** | 불가능 (같은 트랜잭션)          | 가능 (`PENDING` 상태로 생성)                    |
| **서비스 간 통신**    | 메서드 호출 (in-process)        | REST API (inter-process)                        |
| **DB**                | 단일 DB (`msa_step01`)          | 분리 (`msa_step02_order`, `msa_step02_payment`) |
| **결제 서비스 주소**  | 해당 없음                       | `http://localhost:8081` (하드코딩)              |

> **새로운 문제 발생 🧐**
>
> 결제 서비스의 주소가 `http://localhost:8081`로 하드코딩되어 있습니다. 결제 서비스가 다른 서버로 이동하거나, 인스턴스가 여러 개로 스케일아웃되면 어떻게 될까요? 서비스의 주소를 매번 수동으로 변경해야 하고, 로드 밸런싱도 불가능합니다.

---

# Part 2. 서비스 디스커버리 도입 (Step 03)

## **1. 문제: 서비스 위치를 어떻게 알 수 있는가?**

Step 02에서 주문 서비스는 결제 서비스의 주소를 직접 알고 있어야 했습니다.

```yaml
# step02 — order-service의 application.yml
service:
  payment:
    url: http://localhost:8081  ← 하드코딩된 주소
```

서비스 인스턴스가 늘어나거나 IP가 바뀔 때마다 설정을 변경하고 재배포해야 합니다. 이를 해결하기 위해 **서비스 디스커버리(Service Discovery)** 패턴을 도입합니다.

## **2. Eureka Server — 서비스 레지스트리**

Netflix Eureka는 서비스 레지스트리 역할을 합니다. 각 서비스가 시작할 때 자신의 정보(이름, 주소, 포트)를 Eureka에 등록하고, 다른 서비스를 찾을 때 Eureka에 물어봅니다.

```
eureka-server (포트 8761)     ← ★ 새로 추가된 구성 요소
  │
  ├── order-service (8080) 등록됨
  └── payment-service (8081) 등록됨
```

Eureka Server의 전체 코드는 놀라울 정도로 간결합니다.

```java
// step03 — EurekaServerApplication.java
@SpringBootApplication
@EnableEurekaServer  // ★ 이 어노테이션 하나로 레지스트리 서버 활성화
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
```

```yaml
# step03 — eureka-server의 application.yaml
spring:
  application:
    name: eureka-server
server:
  port: 8761
eureka:
  client:
    register-with-eureka: false # 자기 자신은 등록하지 않음
    fetch-registry: false
  server:
    eviction-interval-time-in-ms: 5000 # 5초마다 만료 인스턴스 제거
```

## **3. 클라이언트 서비스 등록**

주문 서비스와 결제 서비스에 Eureka 클라이언트 의존성을 추가하고, `@EnableDiscoveryClient`를 붙입니다.

```java
// step03 — OrderServiceApplication.java
@SpringBootApplication
@EnableDiscoveryClient  // ★ Eureka 레지스트리에 클라이언트로 등록
public class OrderServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }

    @Bean
    @LoadBalanced  // ★ 서비스 이름으로 호출 가능하게 하는 핵심
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
```

`@LoadBalanced`가 핵심입니다. 이 어노테이션이 `RestTemplate`에 인터셉터를 추가하여, URL의 호스트 부분을 서비스 이름으로 인식하고 Eureka에서 실제 주소로 변환합니다.

> **@LoadBalanced의 동작 원리 🧐**
>
> Spring Cloud LoadBalancer 모듈이 `RestTemplate`의 요청을 가로채서, 서비스 이름(`payment-service`)을 Eureka 레지스트리에서 조회한 실제 주소(`192.168.0.10:8081`)로 치환합니다. 인스턴스가 여러 개면 라운드로빈 방식으로 분산합니다.

## **4. 결정적 변화: URL에서 서비스 이름 사용**

```yaml
# step02 (변경 전)
service:
  payment:
    url: http://localhost:8081

# step03 (변경 후) ★
service:
  payment:
    url: http://payment-service/payments  ← IP:포트 대신 서비스 이름 사용
```

`OrderService`의 코드도 변경됩니다.

```java
// step02: restTemplate.postForObject(paymentServiceUrl + "/payments", ...)
// step03: restTemplate.postForObject(paymentServiceUrl, ...)
//         paymentServiceUrl = "http://payment-service/payments"
```

`http://payment-service/payments`에서 `payment-service`는 결제 서비스의 `spring.application.name`입니다. 이 이름은 Eureka에 등록된 서비스 이름과 일치해야 합니다.

## **5. Heartbeat와 인스턴스 관리**

결제 서비스는 주기적으로 Eureka에 Heartbeat를 전송합니다.

```yaml
# step03 — payment-service의 application.yml
eureka:
  instance:
    lease-renewal-interval-in-seconds: 10 # 10초마다 heartbeat 전송
    lease-expiration-duration-in-seconds: 20 # 20초간 응답 없으면 제거
```

```
payment-service ──(10초마다 heartbeat)──→ Eureka Server
                                           │
                                           └→ 20초 무응답 시 레지스트리에서 제거
```

이 설정으로 결제 서비스가 다운되면 20초 내에 Eureka 레지스트리에서 자동으로 제거됩니다.

## **6. Step 02 → 03 코드 변화 요약**

|                      | Step 02                     | Step 03                                   |
| -------------------- | --------------------------- | ----------------------------------------- |
| **프로젝트 개수**    | 2개                         | 3개 (+ `eureka-server`)                   |
| **서비스 탐색 방식** | 하드코딩 (`localhost:8081`) | Eureka 레지스트리 (서비스 이름)           |
| **로드 밸런싱**      | 불가능                      | `@LoadBalanced`로 클라이언트 사이드 LB    |
| **스케일아웃 대응**  | 불가능 (주소 하드코딩)      | 자동 (Eureka에 등록된 인스턴스 목록 활용) |
| **추가 의존성**      | —                           | `spring-cloud-starter-netflix-eureka-*`   |

> **새로운 문제 발생 🧐**
>
> 서비스가 늘어나면 각 서비스의 `application.yml`에 동일한 설정(DB 접속 정보, 성공률 등)이 중복됩니다. 설정을 변경하려면 모든 서비스를 재배포해야 합니다. 10개, 100개의 서비스에서 동일한 설정값을 관리하는 것은 현실적으로 불가능합니다.

---

# Part 3. 중앙화 설정 도입 (Step 04)

## **1. 문제: 설정이 서비스 코드에 묶여 있다**

Step 03까지는 모든 설정이 각 서비스의 `application.yml`에 직접 작성되어 있었습니다. 결제 성공률을 70%에서 90%로 바꾸려면 `payment-service`의 `application.yml`을 수정하고 재배포해야 합니다.

## **2. Spring Cloud Config Server**

Config Server는 **Git 리포지토리에 저장된 설정 파일을 서빙하는 전용 서버**입니다.

```
config-server (포트 8888) ←── Git 리포지토리 (cloud-config-repository)
  │                              ├→ order-service.yml
  │                              └→ payment-service.yml
  │
  ├── order-service가 설정 요청
  └── payment-service가 설정 요청
```

```java
// step04 — ConfigServerApplication.java
@SpringBootApplication
@EnableConfigServer  // ★ Config 서버로 동작하도록 적용
public class ConfigServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ConfigServerApplication.class, args);
    }
}
```

```yaml
# step04 — config-server의 application.yaml
spring:
  cloud:
    config:
      server:
        git:
          uri: https://github.com/Hanna922/cloud-config-repository
          default-label: main
          timeout: 5
server:
  port: 8888
```

## **3. 클라이언트 서비스에서 Config Server 연결**

주문 서비스의 `application.yml`이 크게 변화합니다. 기존에 서비스 내부에 있던 DB 접속 정보, Eureka 설정 등이 **Git 리포지토리로 이동**하고, 서비스에는 Config Server 연결 정보만 남습니다.

```yaml
# step04 — order-service의 application.yml (대폭 간소화!)
spring:
  application:
    name: order-service
  config:
    import: "optional:configserver:"
    cloud:
      config:
        uri: http://localhost:8888 # Config Server 주소

management:
  endpoints:
    web:
      exposure:
        include: health, refresh # ★ Actuator refresh 엔드포인트 활성화
```

step03에서는 DB URL, Eureka 설정, 결제 서비스 URL 등이 모두 `application.yml`에 있었지만, step04에서는 Git 리포지토리의 `order-service.yml`로 옮겨졌습니다.

## **4. 런타임 설정 갱신 — Actuator Refresh**

가장 강력한 기능은 **서버 재시작 없이 설정을 갱신**할 수 있다는 것입니다.

```java
// step04 — ConfigTestController.java
@RestController
public class ConfigTestController {

    @Value("${custom.message}")
    private String message;

    @Value("${custom.version}")
    private String version;

    @GetMapping("/config")
    public String getConfig() {
        return String.format("현재 설정 메시지: %s (version: %s)", message, version);
    }
}
```

Git 리포지토리의 설정 파일을 변경한 후 `POST /actuator/refresh`를 호출하면, `@Value`로 주입된 값이 런타임에 갱신됩니다.

```
1. Git 리포지토리에서 custom.message 값 변경
2. POST http://localhost:8080/actuator/refresh 호출
3. order-service의 @Value 필드가 새 값으로 갱신됨 (재시작 불필요!)
```

> **@RefreshScope가 필요한 이유 🧐**
>
> step04의 `ConfigTestController`에 `// TODO: 설정을 위한 Annotation 추가`라는 주석이 남아 있습니다. 실제로 `@Value` 값이 런타임에 갱신되려면 해당 빈에 `@RefreshScope` 어노테이션을 추가해야 합니다. `@RefreshScope`가 붙은 빈은 `/actuator/refresh` 호출 시 프록시가 빈을 재생성하여 새로운 설정값을 반영합니다.

## **5. Step 03 → 04 코드 변화 요약**

|                            | Step 03                             | Step 04                                                       |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| **프로젝트 개수**          | 3개                                 | 4개 (+ `config-server`)                                       |
| **설정 위치**              | 각 서비스의 `application.yml`       | Git 리포지토리 (중앙 관리)                                    |
| **설정 변경 시**           | 코드 수정 → 재배포                  | Git push → `/actuator/refresh` 호출                           |
| **추가 의존성**            | —                                   | `spring-cloud-starter-config`, `spring-boot-starter-actuator` |
| **order-service yml 크기** | DB, Eureka, 서비스 URL 등 전부 포함 | Config Server 연결 정보 + Actuator 설정만                     |

---

# Part 4. 전체 아키텍처 진화 과정 요약

## 전체 흐름

```
[Step 01] 모놀리스
  주문 + 결제가 하나의 프로젝트
  → 문제: 결제 장애 = 주문 장애 (강한 결합)
      │
      ▼
[Step 02] 마이크로서비스 분리
  order-service ──(REST)──→ payment-service
  → 해결: 결제 장애 시에도 주문 생성 가능 (내결함성)
  → 문제: 서비스 주소 하드코딩 (스케일아웃 불가)
      │
      ▼
[Step 03] 서비스 디스커버리
  order-service ──(서비스 이름)──→ Eureka ──→ payment-service
  → 해결: 서비스 이름으로 탐색, 자동 로드 밸런싱
  → 문제: 설정이 각 서비스에 분산 (변경 시 전체 재배포)
      │
      ▼
[Step 04] 중앙화 설정
  Config Server ──(Git)──→ 각 서비스에 설정 배포
  → 해결: 설정 중앙 관리, 재시작 없이 런타임 갱신
```

## 각 단계에서 추가된 Spring Cloud 컴포넌트

| 단계    | 추가된 컴포넌트                | 해결한 문제                        |
| ------- | ------------------------------ | ---------------------------------- |
| Step 01 | —                              | — (출발점)                         |
| Step 02 | `RestTemplate`                 | 결제 장애 → 주문 장애 (내결함성)   |
| Step 03 | Eureka Server, `@LoadBalanced` | 서비스 주소 하드코딩 (서비스 탐색) |
| Step 04 | Config Server, Actuator        | 설정 분산 관리 (중앙화 설정)       |

## 전체 구성 요소 관계도 (Step 04 기준)

```
                    ┌─────────────────────┐
                    │   Config Server     │
                    │   (포트 8888)        │←── Git Repository
                    └────────┬────────────┘
                             │ 설정 배포
                    ┌────────┴────────────┐
                    ▼                     ▼
          ┌──────────────┐      ┌──────────────┐
          │ order-service │      │payment-service│
          │  (포트 8080)  │      │  (포트 8081)  │
          └──────┬───────┘      └──────┬───────┘
                 │  등록/조회           │  등록
                 ▼                     ▼
          ┌─────────────────────────────┐
          │       Eureka Server         │
          │       (포트 8761)            │
          └─────────────────────────────┘
```

---

## Closing Thoughts (๑╹o╹)✎

이번 실습을 통해 MSA 전환이 **쪼갠 후에 발생하는 문제들을 하나씩 해결하는 과정**이라는 것을 체감했습니다. 서비스를 분리하면 내결함성은 확보되지만 서비스 탐색 문제가 생기고, 서비스 탐색을 해결하면 설정 관리 문제가 생깁니다. Spring Cloud는 이 문제 체인의 각 단계에 정확히 대응하는 솔루션을 제공하고 있었습니다.

특히 step02에서 step03으로 넘어갈 때 `http://localhost:8081`이 `http://payment-service/payments`로 바뀌는 한 줄의 변화가, `@LoadBalanced` + Eureka라는 인프라 전체를 대변한다는 것이 인상 깊었습니다.

다음에는 Circuit Breaker(Resilience4j), API Gateway 등 Spring Cloud의 나머지 컴포넌트들도 이 프로젝트에 추가하며 기록해볼 예정입니다.

틀린 내용이 있다면 댓글로 알려주세요. 🙇🏻‍♀️

## References

- [Spring Cloud Netflix Eureka — Service Discovery](https://docs.spring.io/spring-cloud-netflix/reference/spring-cloud-netflix.html)
- [Spring Cloud Config — Centralized Configuration](https://docs.spring.io/spring-cloud-config/reference/)
- [Spring Boot Actuator — Production-ready Features](https://docs.spring.io/spring-boot/reference/actuator/index.html)
- [Cloud Native 강의 교안](https://baceru.vercel.app/Daily/cloud-native/1.cloud-native/1.cloud-native-overview/1.overview)
