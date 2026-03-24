---
author: Hanna922
pubDatetime: 2026-03-21T09:00:00.000Z
modDatetime:
title: From Monolith to Spring Cloud MSA - A 4-Step Evolution Record
titleEn: From Monolith to Spring Cloud MSA - A 4-Step Evolution Record
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
description: Let us analyze how an order-payment system evolves step by step from a monolith to microservices, service discovery, and centralized configuration, and what problems were solved at each stage
---

This post is written based on Spring Boot 3.5.x / Spring Cloud 2025.0.1 / Java 17.

In this post, I study **what kinds of problems appear when moving from a monolithic structure to microservices, and how each Spring Cloud component solves them**. I gradually evolve an order-payment system through four stages and record the problems resolved at each step along with the code-level changes.

## Prerequisites

**What is a Cloud Native Application?**

A cloud-native application is an application designed to operate optimally in a cloud environment, with key characteristics such as scalability, loose coupling, resilience, and observability.

**Monolith vs Microservice**

- **Monolith**: A structure where all features are included in a single deployment unit. It is simple in the early stages of development, but as the system grows, a failure in one part can affect the entire system.
- **Microservice**: A structure where each feature is separated into an independent service that can be deployed and scaled independently.

**What is Spring Cloud?**

Spring Cloud is a collection of Spring-based frameworks for solving common problems in microservice architectures, such as service discovery, configuration management, and load balancing.

**Example Domain**

The domain used throughout this post is an **order-payment system**. When a user creates an order, payment is processed, and the order status is determined based on whether the payment succeeds or fails.

```
User -> [Create Order] -> [Process Payment] -> Finalize Order Status (COMPLETED / FAILED)
```

---

# Part 1. From Monolith to Microservice (Step 01 -> Step 02)

## **1. Step 01 - Monolith: Everything in One Structure**

At the beginning, orders and payments exist inside a single application.

```
order-payment-monolith (port 8080)
  |- OrderController    (/orders)
  |- OrderService       <- both order + payment logic live here
  |- OrderRepository
  \- PaymentRepository
```

If you look at `OrderService`, order persistence and payment processing are executed synchronously **within the same transaction**.

```java
// step01 - OrderService.java
@Transactional
public Order createOrder(OrderRequest request) {
    Order order = Order.builder()
            .itemName(request.itemName())
            .quantity(request.quantity())
            .price(request.price())
            .status(OrderStatus.PENDING)
            .build();
    order = orderRepository.save(order);

    // ★ payment processing is executed directly inside the same service
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

`simulatePaymentFailure()` randomly decides payment success or failure according to the `simulation.payment.success-rate` configuration value. In step01, this value is set to `0`, so **all payments fail** in the simulation.

> **Problem with the monolith 🧐**
>
> If the payment logic fails, the order itself cannot proceed. Because the payment service exists in the same process, a payment exception becomes an order exception immediately. In other words, there is strong tight coupling: **payment failure = order failure**.

## **2. Step 02 - Microservice: Split the Services**

To solve this, the order and payment parts are split into separate projects.

```
order-service  (port 8080)          payment-service (port 8081)
  |- OrderController                  |- PaymentController
  |- OrderService                     |- PaymentService
  |- OrderRepository                  \- PaymentRepository
  \- RestTemplate (HTTP client)
```

The key change is that **the payment logic disappears from `OrderService`**, and instead the payment service is called over HTTP using `RestTemplate`.

```java
// step02 - OrderService.java
@Transactional
public Order createOrder(OrderRequest request) {
    Order order = Order.builder()/* ... */.build();
    order = orderRepository.save(order);

    // ★ call the payment service over HTTP (separate process)
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
        // ★ even if the payment service fails, the order remains in PENDING
    }

    return orderRepository.save(order);
}
```

The key is that the payment service call is wrapped in `try-catch`. Even if the payment service is down, the exception is caught and the order is still created with `PENDING` status.

> **Problem solved ✅**
>
> **Orders can still be created even when the payment service fails (fault tolerance).** In the monolith, payment failure immediately meant order failure. After splitting the services, even if the payment service goes down, the order can still be created normally in `PENDING` status.

## **3. Summary of the Code Changes from Step 01 -> 02**

|                                  | Step 01 (Monolith)                     | Step 02 (Microservice)                           |
| -------------------------------- | -------------------------------------- | ------------------------------------------------ |
| **Number of projects**           | 1 (`order-payment-monolith`)           | 2 (`order-service`, `payment-service`)           |
| **Where payment runs**           | Internal method call in `OrderService` | HTTP request (`RestTemplate`)                    |
| **Order during payment failure** | Impossible (same transaction)          | Possible (created as `PENDING`)                  |
| **Service communication**        | Method call (in-process)               | REST API (inter-process)                         |
| **DB**                           | Single DB (`msa_step01`)               | Split (`msa_step02_order`, `msa_step02_payment`) |
| **Payment service URL**          | N/A                                    | `http://localhost:8081` (hardcoded)              |

> **A new problem appears 🧐**
>
> The payment service address is hardcoded as `http://localhost:8081`. What happens if the payment service moves to another server, or if we scale out to multiple instances? We would have to change the service address manually every time, and load balancing would also be impossible.

---

# Part 2. Introducing Service Discovery (Step 03)

## **1. Problem: How Do We Know Where a Service Is?**

In Step 02, the order service had to know the payment service's address directly.

```yaml
# step02 - order-service application.yml
service:
  payment:
    url: http://localhost:8081  <- hardcoded address
```

Whenever service instances increase or IP addresses change, the configuration must be updated and redeployed. To solve this, we introduce the **Service Discovery** pattern.

## **2. Eureka Server - Service Registry**

Netflix Eureka acts as a service registry. Each service registers its own information (name, address, port) in Eureka when it starts, and when a service needs to find another one, it asks Eureka.

```
eureka-server (port 8761)     <- ★ newly added component
  |
  |- order-service (8080) registered
  \- payment-service (8081) registered
```

The full code for Eureka Server is surprisingly simple.

```java
// step03 - EurekaServerApplication.java
@SpringBootApplication
@EnableEurekaServer  // ★ this single annotation enables the registry server
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
```

```yaml
# step03 - eureka-server application.yaml
spring:
  application:
    name: eureka-server
server:
  port: 8761
eureka:
  client:
    register-with-eureka: false # do not register itself
    fetch-registry: false
  server:
    eviction-interval-time-in-ms: 5000 # remove expired instances every 5 seconds
```

## **3. Registering Client Services**

Add the Eureka client dependency to both the order service and the payment service, then add `@EnableDiscoveryClient`.

```java
// step03 - OrderServiceApplication.java
@SpringBootApplication
@EnableDiscoveryClient  // ★ register as a client in the Eureka registry
public class OrderServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }

    @Bean
    @LoadBalanced  // ★ the key that enables calling by service name
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
```

`@LoadBalanced` is the critical part. This annotation adds an interceptor to `RestTemplate`, allowing it to interpret the host part of the URL as a service name and translate it into the real address from Eureka.

> **How `@LoadBalanced` works 🧐**
>
> The Spring Cloud LoadBalancer module intercepts `RestTemplate` requests and replaces the service name (`payment-service`) with the real address (`192.168.0.10:8081`) looked up from the Eureka registry. If multiple instances exist, requests are distributed in a round-robin manner.

## **4. The Decisive Change: Use the Service Name in the URL**

```yaml
# step02 (before)
service:
  payment:
    url: http://localhost:8081

# step03 (after) ★
service:
  payment:
    url: http://payment-service/payments  <- use a service name instead of IP:port
```

The `OrderService` code changes as well.

```java
// step02: restTemplate.postForObject(paymentServiceUrl + "/payments", ...)
// step03: restTemplate.postForObject(paymentServiceUrl, ...)
//         paymentServiceUrl = "http://payment-service/payments"
```

In `http://payment-service/payments`, `payment-service` is the payment service's `spring.application.name`. This name must match the service name registered in Eureka.

## **5. Heartbeat and Instance Management**

The payment service periodically sends Heartbeats to Eureka.

```yaml
# step03 - payment-service application.yml
eureka:
  instance:
    lease-renewal-interval-in-seconds: 10 # send heartbeat every 10 seconds
    lease-expiration-duration-in-seconds: 20 # remove after 20 seconds without response
```

```
payment-service --(heartbeat every 10s)--> Eureka Server
                                           |
                                           \-> removed from registry after 20s of no response
```

With this setting, if the payment service goes down, it is automatically removed from the Eureka registry within 20 seconds.

## **6. Summary of the Code Changes from Step 02 -> 03**

|                        | Step 02                        | Step 03                                   |
| ---------------------- | ------------------------------ | ----------------------------------------- |
| **Number of projects** | 2                              | 3 (+ `eureka-server`)                     |
| **Service discovery**  | Hardcoded (`localhost:8081`)   | Eureka registry (service name)            |
| **Load balancing**     | Impossible                     | Client-side LB with `@LoadBalanced`       |
| **Scale-out support**  | Impossible (hardcoded address) | Automatic (use instance list from Eureka) |
| **Added dependencies** | -                              | `spring-cloud-starter-netflix-eureka-*`   |

> **A new problem appears 🧐**
>
> As the number of services grows, the same settings (DB connection information, success rate, and so on) are duplicated in each service's `application.yml`. Changing configuration requires redeploying every service. Managing the same configuration values across 10 or 100 services is not realistic.

---

# Part 3. Introducing Centralized Configuration (Step 04)

## **1. Problem: Configuration Is Tied to Service Code**

Up to Step 03, all configuration was written directly into each service's `application.yml`. If we wanted to change the payment success rate from 70% to 90%, we had to modify `payment-service`'s `application.yml` and redeploy it.

## **2. Spring Cloud Config Server**

Config Server is **a dedicated server that serves configuration files stored in a Git repository**.

```
config-server (port 8888) <- Git repository (cloud-config-repository)
  |                           |- order-service.yml
  |                           \- payment-service.yml
  |
  |- configuration requested by order-service
  \- configuration requested by payment-service
```

```java
// step04 - ConfigServerApplication.java
@SpringBootApplication
@EnableConfigServer  // ★ enable it to act as a Config Server
public class ConfigServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ConfigServerApplication.class, args);
    }
}
```

```yaml
# step04 - config-server application.yaml
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

## **3. Connecting Client Services to the Config Server**

The order service's `application.yml` changes significantly. The DB connection information, Eureka configuration, and similar settings that previously lived inside the service are **moved into the Git repository**, leaving only the Config Server connection settings in the service itself.

```yaml
# step04 - order-service application.yml (greatly simplified!)
spring:
  application:
    name: order-service
  config:
    import: "optional:configserver:"
    cloud:
      config:
        uri: http://localhost:8888 # Config Server address

management:
  endpoints:
    web:
      exposure:
        include: health, refresh # ★ enable the Actuator refresh endpoint
```

In step03, the DB URL, Eureka settings, and payment service URL were all inside `application.yml`, but in step04 they are moved to `order-service.yml` in the Git repository.

## **4. Runtime Configuration Refresh - Actuator Refresh**

The most powerful feature is that **configuration can be refreshed without restarting the server**.

```java
// step04 - ConfigTestController.java
@RestController
public class ConfigTestController {

    @Value("${custom.message}")
    private String message;

    @Value("${custom.version}")
    private String version;

    @GetMapping("/config")
    public String getConfig() {
        return String.format("Current config message: %s (version: %s)", message, version);
    }
}
```

After changing the config file in the Git repository, if you call `POST /actuator/refresh`, the values injected with `@Value` are refreshed at runtime.

```
1. Change the custom.message value in the Git repository
2. Call POST http://localhost:8080/actuator/refresh
3. The @Value fields in order-service are updated with the new values (no restart needed!)
```

> **Why `@RefreshScope` is required 🧐**
>
> In step04, `ConfigTestController` still contains the comment `// TODO: Add annotation for configuration`. In practice, if `@Value` values should be refreshed at runtime, you must add the `@RefreshScope` annotation to that bean. When `/actuator/refresh` is called, a bean marked with `@RefreshScope` is recreated through a proxy so the new configuration values are applied.

## **5. Summary of the Code Changes from Step 03 -> 04**

|                            | Step 03                                 | Step 04                                                       |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| **Number of projects**     | 3                                       | 4 (+ `config-server`)                                         |
| **Where config lives**     | Each service's `application.yml`        | Git repository (centralized management)                       |
| **When config changes**    | Modify code -> redeploy                 | Git push -> call `/actuator/refresh`                          |
| **Added dependencies**     | -                                       | `spring-cloud-starter-config`, `spring-boot-starter-actuator` |
| **order-service yml size** | Includes DB, Eureka, service URLs, etc. | Config Server connection info + Actuator settings only        |

---

# Part 4. Summary of the Overall Architecture Evolution

## Overall Flow

```
[Step 01] Monolith
  Order + payment in a single project
  -> Problem: payment failure = order failure (tight coupling)
      |
      v
[Step 02] Microservice split
  order-service --(REST)--> payment-service
  -> Solved: orders can still be created during payment failure (fault tolerance)
  -> Problem: hardcoded service address (cannot scale out)
      |
      v
[Step 03] Service discovery
  order-service --(service name)--> Eureka --> payment-service
  -> Solved: discovery by service name, automatic load balancing
  -> Problem: configuration scattered across services (full redeploy on change)
      |
      v
[Step 04] Centralized configuration
  Config Server --(Git)--> distribute configuration to each service
  -> Solved: centralized configuration management, runtime refresh without restart
```

## Spring Cloud Components Added at Each Stage

| Stage   | Added component                | Problem solved                                            |
| ------- | ------------------------------ | --------------------------------------------------------- |
| Step 01 | -                              | - (starting point)                                        |
| Step 02 | `RestTemplate`                 | Payment failure causing order failure (fault tolerance)   |
| Step 03 | Eureka Server, `@LoadBalanced` | Hardcoded service addresses (service discovery)           |
| Step 04 | Config Server, Actuator        | Distributed configuration management (centralized config) |

## Relationship Between All Components (Based on Step 04)

```
                    +---------------------+
                    |   Config Server     |
                    |   (port 8888)       |<-- Git Repository
                    +--------+------------+
                             | config distribution
                    +--------+------------+
                    v                     v
          +---------------+      +----------------+
          | order-service |      | payment-service|
          |  (port 8080)  |      |  (port 8081)   |
          +------+--------+      +--------+-------+
                 | register/query          | register
                 v                         v
          +-------------------------------+
          |        Eureka Server          |
          |        (port 8761)            |
          +-------------------------------+
```

---

## Closing Thoughts (๑╹o╹)✎

Through this practice, I came to feel that migrating to MSA is **the process of solving, one by one, the problems that appear after you split the system**. Once you separate services, you gain fault tolerance, but service discovery becomes a problem. Once you solve service discovery, configuration management becomes the next problem. Spring Cloud was providing an exact solution for each stage of that problem chain.

What especially impressed me was that the single-line change from `http://localhost:8081` to `http://payment-service/payments` when moving from step02 to step03 actually represents the entire infrastructure behind `@LoadBalanced` + Eureka.

Next, I plan to continue this project by adding the remaining Spring Cloud components such as Circuit Breaker (Resilience4j) and API Gateway.

If you spot anything incorrect, please let me know in the comments. 🙇🏻‍♀️

## References

- [Spring Cloud Netflix Eureka - Service Discovery](https://docs.spring.io/spring-cloud-netflix/reference/spring-cloud-netflix.html)
- [Spring Cloud Config - Centralized Configuration](https://docs.spring.io/spring-cloud-config/reference/)
- [Spring Boot Actuator - Production-ready Features](https://docs.spring.io/spring-boot/reference/actuator/index.html)
- [Cloud Native Lecture Notes](https://baceru.vercel.app/Daily/cloud-native/1.cloud-native/1.cloud-native-overview/1.overview)
