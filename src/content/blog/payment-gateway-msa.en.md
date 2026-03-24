---
author: Hanna922
pubDatetime: 2026-03-23T09:00:00.000Z
modDatetime:
title: Applying Spring Cloud MSA in Practice - Building a Card Payment Gateway in 6 Phases
titleEn: Applying Spring Cloud MSA in Practice - Building a Card Payment Gateway in 6 Phases
featured: false
draft: false
tags:
  - Spring Cloud
  - MSA
  - Payment Gateway
  - Circuit Breaker
  - Resilience4j
  - OpenFeign
  - BIN Routing
  - Deep Dive
description: Let us analyze the process of applying Spring Cloud from an order-payment learning project to a real card authorization system and advancing the PG service through 6 phases
---

This post is written based on Spring Boot 4.0.3 / Spring Cloud 2025.1.0 / Java 17, and explains the project based on the contents up to commit `e0ef9cc`.

In the [previous post](https://hanna-dev.co.kr), I gradually evolved an order-payment system from monolith -> microservices -> service discovery -> centralized configuration and studied the core Spring Cloud components. This time, I apply that learning to a **real domain**. In an MSA system for card payment authorization, I **advance the PG (Payment Gateway) service through 6 phases**, recording at the code level what problems were solved in each phase and what design decisions were made.

## Prerequisites

**Card Payment Authorization Flow**

In real card payments, when a customer presents a card, authorization is completed by passing through several participants. This project implements that flow as MSA.

```
Customer (presents card)
  |
  v
Merchant -- payment request --> PG (Payment Gateway)
                               |
                               |- Identify BIN -> determine card brand
                               |
                               v
                         Card Company (Acquirer) -- balance check --> Bank
                               |
                               v
                         Return authorization result
```

**Service Composition of the Project**

| Service                        | Port | Role                                          |
| ------------------------------ | ---- | --------------------------------------------- |
| `eureka-server`                | 8761 | Service discovery                             |
| `api-gateway`                  | 8000 | API gateway (the single external entry point) |
| `merchant-service`             | 7070 | Merchant stub                                 |
| `pg-service`                   | 8081 | **PG gateway (the target of the refinement)** |
| `card-authorization-service`   | 9090 | Acquirer A - Visa only                        |
| `card-authorization-service-2` | 9091 | Acquirer B - MC/Amex/Discover/JCB             |
| `bank-service`                 | 8080 | Bank (balance inquiry / withdrawal)           |

**Connection to the Previous Post**

In the order-payment system from the previous post, the structure was a simple 1:1 call of `order-service` -> `payment-service`. In this project, `pg-service` must **route to different card companies depending on the card number**, and even when a card company fails, **the entire system must not go down**. The core of this post is how Spring Cloud components such as Eureka, OpenFeign, and Circuit Breaker, which were studied in the previous post, are combined in a real system.

---

# Part 1. Building the Transaction Ledger and Authorization Flow (Phase 1~2)

## **1. Phase 1 - Transaction Ledger + Idempotency Foundation**

The first task of the PG service is to **record all transactions in a traceable ledger**. In payment systems, duplicate requests caused by network errors happen frequently, so it is essential to guarantee **idempotency**, meaning that even if the same request arrives twice, it returns the same result.

```
dev.pg.ledger/
  |- entity/PaymentTransaction.java      <- transaction ledger entity
  |- enums/ApprovalStatus.java           <- PENDING / APPROVED / FAILED / TIMEOUT
  |- enums/SettlementStatus.java
  |- repository/PaymentTransactionRepository.java
  \- service/
      |- TransactionLedgerService.java   <- ledger CRUD
      \- IdempotencyService.java         <- duplicate request check
```

The `PaymentTransaction` entity is the core of the ledger. Every payment request is recorded with this entity, and its status transitions through `PENDING -> APPROVED / FAILED / TIMEOUT`.

`IdempotencyService` looks up an existing transaction by the `merchantTransactionId` sent by the merchant. If a processed transaction already exists, it does not process it again and instead returns the existing result.

## **2. Phase 2 - Separating Authorization Flow Responsibilities (Facade Pattern)**

Once the ledger foundation is in place in Phase 1, `PgApprovalFacade` is introduced to orchestrate the entire authorization flow.

```java
// PgApprovalFacade.java - the core orchestrator of the authorization flow
@Service
public class PgApprovalFacade {

    public MerchantApprovalResponse approve(MerchantApprovalRequest request) {
        // 1. Input validation
        approvalValidationService.validate(request);

        // 2. Idempotency check: has this transaction already been processed?
        Optional<PaymentTransaction> existing =
                idempotencyService.findExistingTransaction(request.getMerchantTransactionId());
        if (existing.isPresent()) {
            return approvalMapper.toMerchantApprovalResponse(existing.get());
        }

        // 3. Generate PG transaction ID + record PENDING in the ledger
        String pgTransactionId = pgTransactionIdGenerator.generate();
        RoutingTarget routingTarget = acquirerRoutingService.resolveRoutingTarget(request);
        PaymentTransaction transaction = transactionLedgerService.createPendingTransaction(
                request, pgTransactionId, routingTarget.acquirerType()
        );

        // 4. Send authorization request to the card company
        CardAuthorizationRequest cardRequest =
                cardAuthorizationRequestFactory.create(request, pgTransactionId);

        try {
            CardAuthorizationResponse cardResponse =
                    acquirerRoutingService.authorize(routingTarget, cardRequest);

            // 5. Update the ledger status based on the authorization result
            PaymentTransaction updated = cardResponse.isApproved()
                    ? transactionLedgerService.markApproved(transaction, cardResponse)
                    : transactionLedgerService.markFailed(transaction, cardResponse);
            return approvalMapper.toMerchantApprovalResponse(updated);

        } catch (CardAuthorizationClientException e) {
            // 6. Handle communication failure with the card company
            PaymentTransaction failed = handleClientFailure(transaction, e);
            return approvalMapper.toMerchantApprovalResponse(failed);
        }
    }
}
```

The key point is that each step in this Facade is delegated to a separate service. Validation is handled by `ApprovalValidationService`, idempotency by `IdempotencyService`, routing by `AcquirerRoutingService`, and ledger management by `TransactionLedgerService`.

> **Why apply the Facade pattern? 🧐**
>
> Payment authorization is a complex flow: validation -> idempotency check -> ledger record -> card company call -> reflect the result. If all of this is placed inside a single service method, the method becomes hundreds of lines long and each step becomes hard to test independently. By separating flow orchestration from the implementation of each step with the Facade pattern, each service can be unit-tested independently.

---

# Part 2. Stabilizing External System Integration (Phase 3~4)

## **3. Phase 3 - Stabilizing Card Company Integration (Timeout / Retry / Circuit Breaker)**

If the previous post's step02 only had `try-catch` around the payment service call, that is not enough in a real system. Because the card company system is outside the PG service's control, the following three defensive mechanisms are required.

```
When pg-service calls card-authorization-service

  [1] Timeout: give up if no response arrives within N seconds
  [2] Retry:   retry if the error is a temporary network issue
  [3] Circuit Breaker: block calls themselves for some time after continuous failure
```

`CardAuthorizationClient` acts as a wrapper around all three. Instead of exposing the FeignClient interface directly, the system calls it through an error-handling wrapper.

```
dev.pg.client/
  |- CardAuthorizationClient.java             <- ★ wrapper for CB + retry + error translation
  |- CardAuthorizationServiceClient.java      <- @FeignClient(name="card-authorization-service")
  \- support/
      |- CardAuthorizationErrorType.java      <- COMMUNICATION_FAILURE / DOWNSTREAM_FAILURE / CIRCUIT_OPEN
      |- CardAuthorizationClientException.java
      \- ExternalErrorTranslator.java
```

`CardAuthorizationErrorType` is important. It classifies various external system failures into three types.

| ErrorType               | Meaning                              | PG service response                                       |
| ----------------------- | ------------------------------------ | --------------------------------------------------------- |
| `COMMUNICATION_FAILURE` | Network timeout / connection failure | Mark the ledger as `TIMEOUT`                              |
| `DOWNSTREAM_FAILURE`    | Card company returns HTTP 5xx        | Mark the ledger as `FAILED`                               |
| `CIRCUIT_OPEN`          | Circuit breaker is open              | Mark the ledger as `FAILED` (do not make the call itself) |

> **Why is a Circuit Breaker necessary? 🧐**
>
> If the card company system is down and every request waits until timeout, the PG service's thread pool can be exhausted, and even other normal requests can no longer be processed. A Circuit Breaker prevents failure propagation by **blocking the call itself (OPEN)** once continuous failures exceed a threshold. After some time, it sends only a few trial requests (HALF-OPEN), and if the card company recovers, it transitions back to normal calls (CLOSED).

## **4. Phase 4 - Standardizing PG Internal Exceptions + Global Handling**

Now that external system errors are classified in Phase 3, they are converted into a standardized internal exception system for the PG service.

```java
// CardAuthorizationExceptionMapper.java
public BusinessException toBusinessException(CardAuthorizationClientException e) {
    return switch (e.getErrorType()) {
        case COMMUNICATION_FAILURE -> new BusinessException(
                ErrorCode.CARD_AUTH_COMMUNICATION_FAILURE, e.getMessage());
        case DOWNSTREAM_FAILURE -> new BusinessException(
                ErrorCode.CARD_AUTH_DOWNSTREAM_FAILURE, e.getMessage());
        case CIRCUIT_OPEN -> new BusinessException(
                ErrorCode.CARD_AUTH_CIRCUIT_OPEN, e.getMessage());
    };
}
```

Each `ErrorCode` is mapped to an HTTP status code.

| ErrorCode                         | HTTP Status           | Meaning                       |
| --------------------------------- | --------------------- | ----------------------------- |
| `CARD_AUTH_COMMUNICATION_FAILURE` | 504 Gateway Timeout   | No response from card company |
| `CARD_AUTH_DOWNSTREAM_FAILURE`    | 502 Bad Gateway       | Card company server error     |
| `CARD_AUTH_CIRCUIT_OPEN`          | 429 Too Many Requests | Circuit breaker open          |

`GlobalExceptionHandler` catches `BusinessException` and converts it into a standardized JSON response. From the merchant's perspective, every type of failure is returned in a consistent error-response format.

---

# Part 3. Routing Abstraction and BIN-based Multi-Acquirer Routing (Phase 5~6)

## **5. Phase 5 - Routing Abstraction (`RoutingPolicy` / `AcquirerRoutingService`)**

In Phase 5 there is still only one card company, but the system creates an abstraction in advance **to support multiple card companies later**.

```java
// RoutingPolicy.java - routing strategy interface
public interface RoutingPolicy {
    RoutingTarget route(MerchantApprovalRequest request);
}

// SingleAcquirerRoutingPolicy.java - implementation for Phase 5 (one card company)
@Component
public class SingleAcquirerRoutingPolicy implements RoutingPolicy {
    @Override
    public RoutingTarget route(MerchantApprovalRequest request) {
        return RoutingTarget.cardAuthorizationService();  // always the same card company
    }
}
```

At this point, `SingleAcquirerRoutingPolicy` may look like overengineering because it always returns the same card company. But in Phase 6, this abstraction proves its value.

## **6. Phase 6 - ★ BIN-based Multi-Acquirer Routing (currently in progress)**

This is the core goal of the project. Identify the card brand using the leading digits of the card number (BIN, Bank Identification Number), then route to a different card company (Acquirer) for each brand.

```
pg-service decides routing by looking at the card number:

  4111 1111 1111 1111  -> BIN "4"  -> Visa       -> Acquirer A (card-authorization-service)
  5555 5555 5555 4444  -> BIN "5"  -> Mastercard -> Acquirer B (card-authorization-service-2)
  3782 8224 6310 005   -> BIN "3"  -> Amex       -> Acquirer B
  3530 1113 3330 0000  -> BIN "35" -> JCB        -> Acquirer B
  6011 1111 1111 1117  -> BIN "6"  -> Discover   -> Acquirer B
```

Phase 6 proceeds through seven sub-stages.

### Phase 6-1. `CardBrand` model + expand `AcquirerType`

```java
// CardBrand.java - enum for card brand identification
public enum CardBrand {
    VISA, MASTERCARD, AMEX, JCB, DISCOVER, UNKNOWN
}

// AcquirerType.java - expanded from one existing type to two
public enum AcquirerType {
    CARD_AUTHORIZATION_SERVICE,
    CARD_AUTHORIZATION_SERVICE_2  // ★ newly added
}
```

### Phase 6-2. `BinResolver` - BIN identification service

```java
// BinResolver.java - identify the card brand from the card number
@Component
public class BinResolver {
    public CardBrand resolve(String cardNumber) {
        // longest prefix first: match "35" before "3"
        if (cardNumber.startsWith("35")) return CardBrand.JCB;
        if (cardNumber.startsWith("3"))  return CardBrand.AMEX;
        if (cardNumber.startsWith("4"))  return CardBrand.VISA;
        if (cardNumber.startsWith("5"))  return CardBrand.MASTERCARD;
        if (cardNumber.startsWith("6"))  return CardBrand.DISCOVER;
        return CardBrand.UNKNOWN;
    }
}
```

> **Why separate BIN identification from routing policy? 🧐**
>
> BIN identification ("What brand is this card?") and routing decision ("Which acquirer should this brand be sent to?") are different responsibilities. BIN identification logic can also be reused elsewhere for things like fraud checks or card-brand display. If these are separated into `BinResolver` and `RoutingPolicy`, each can be changed and tested independently.

### Phase 6-3. `BinBasedRoutingPolicy` - the moment the abstraction from Phase 5 proves useful

Add a new implementation of the `RoutingPolicy` interface created in Phase 5. The routing strategy is replaced **without modifying the existing code, only by adding a new class**.

```java
// BinBasedRoutingPolicy.java - real use of the abstraction introduced in Phase 5
@Primary
@Component
@ConditionalOnProperty(name = "pg.routing.policy", havingValue = "bin", matchIfMissing = true)
public class BinBasedRoutingPolicy implements RoutingPolicy {

    private final BinResolver binResolver;
    private final RoutingProperties routingProperties;

    @Override
    public RoutingTarget route(MerchantApprovalRequest request) {
        // ★ identify the card brand from BIN and find the mapped acquirer in configuration
        CardBrand cardBrand = binResolver.resolve(request.getCardNumber());
        AcquirerType acquirerType = routingProperties.getBrandAcquirerMap()
                .getOrDefault(cardBrand, routingProperties.getDefaultAcquirer());

        return switch (acquirerType) {
            case CARD_AUTHORIZATION_SERVICE -> RoutingTarget.cardAuthorizationService();
            case CARD_AUTHORIZATION_SERVICE_2 -> RoutingTarget.cardAuthorizationService2();
        };
    }
}
```

The mapping between brand and acquirer is **externalized** in `application.yaml`.

```yaml
# pg-service application.yaml
pg:
  routing:
    policy: bin
    default-acquirer: CARD_AUTHORIZATION_SERVICE
    brand-acquirer-map:
      VISA: CARD_AUTHORIZATION_SERVICE
      MASTERCARD: CARD_AUTHORIZATION_SERVICE_2
      AMEX: CARD_AUTHORIZATION_SERVICE_2
      JCB: CARD_AUTHORIZATION_SERVICE_2
      DISCOVER: CARD_AUTHORIZATION_SERVICE_2
```

By changing only this configuration, JCB can be moved to Acquirer A or Acquirer C can be added. If the **Config Server + Actuator Refresh** learned in the previous post is also applied, routing can be changed without restarting the service.

### Phase 6-4. Second Acquirer FeignClient - independent Circuit Breaker

Add a FeignClient and Circuit Breaker wrapper for the second card company.

```
client/
  |- CardAuthorizationClient.java              <- for Acquirer A (existing)
  |- CardAuthorizationServiceClient.java       <- @FeignClient(name="card-authorization-service")
  |- CardAuthorizationClient2.java             <- ★ for Acquirer B (new)
  |- CardAuthorizationServiceClient2.java      <- ★ @FeignClient(name="card-authorization-service-2")
  \- support/...
```

> **Why is an independent Circuit Breaker per card company essential? 🧐**
>
> If Acquirer A (Visa) is down and there is only one Circuit Breaker, Mastercard requests would also be blocked. Circuit Breaker instances must be separated by card company so that even if A is down, Mastercard/Amex/JCB/Discover payments through B can still operate normally. Because the `name` attribute of `@FeignClient` maps 1:1 to the Eureka service name, a separate FeignClient interface is needed for each card company.

### Phase 6-5. Expand `AcquirerRoutingService` - dynamic client selection

`AcquirerRoutingService` chooses the correct client according to the `acquirerType` in `RoutingTarget`. A common `AcquirerClient` interface is extracted, and the Strategy pattern is applied by injecting `Map<AcquirerType, AcquirerClient>`.

```
AcquirerRoutingService
  |
  |- resolveRoutingTarget(request)  -> delegate to RoutingPolicy
  |
  \- authorize(routingTarget, cardRequest)
        |
        |- CARD_AUTHORIZATION_SERVICE   -> CardAuthorizationClient.authorize()
        \- CARD_AUTHORIZATION_SERVICE_2 -> CardAuthorizationClient2.authorize()
```

Even if a third card company is added, `AcquirerRoutingService` itself does not need to be modified. You only need to add a new `AcquirerClient` implementation and extend the yaml mapping (satisfying OCP).

### Phase 6-6~7. Ledger traceability + tests

Record **which card company each transaction passed through** in the `PaymentTransaction.acquirerType` field. This is necessary during settlement to answer questions such as, "Did this transaction go through Acquirer A or B?"

---

# Part 4. Overall Architecture and Request Flow

## Final Architecture (after completing Phase 6)

```
Client
  |
  v
api-gateway (:8000) -- single external entry point
  |  /api/merchant/** -> lb://merchant-service
  v
merchant-service (:7070)
  |  POST /api/pg/approve (FeignClient)
  v
pg-service (:8081)  <- ★ this is the service advanced across 6 phases
  |
  |  [1] Input validation
  |  [2] Idempotency check (merchantTransactionId)
  |  [3] Generate PG TX ID + record PENDING in ledger
  |  [4] Identify BIN -> determine card brand -> decide routing
  |
  |- BIN 4xxx (Visa) ------------ CB1 ---> card-authorization-service   (:9090)
  |                                         |
  |                                         \-> bank-service (:8080) balance check / withdrawal
  |
  \- BIN 5xxx/3xxx/6xxx/35xx -- CB2 ---> card-authorization-service-2 (:9091)
                                            |
                                            \-> bank-service (:8080) shared
  |
  |  [5] Update ledger status by authorization result (APPROVED / FAILED / TIMEOUT)
  |  [6] Return standardized response
  v
merchant-service <- receive response
```

## Summary of the Phase Evolution

| Phase | What was added                                       | Problem solved                                                           |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| 1     | Transaction ledger + idempotency service             | Prevent duplicate payments, establish transaction traceability           |
| 2     | `PgApprovalFacade` (orchestrator)                    | Separate responsibilities in the authorization flow, improve testability |
| 3     | CB + Retry + Timeout wrapper                         | Prevent the whole system from being paralyzed by card company failure    |
| 4     | Exception standardization + `GlobalExceptionHandler` | Guarantee consistent error responses to merchants                        |
| 5     | `RoutingPolicy` interface                            | Prepare a structure where routing strategies can be replaced             |
| 6     | BIN routing + multiple card companies                | Branch to the correct card company by card brand                         |

## Comparing Spring Cloud Component Usage Between the Previous Post (Learning) and This Post (Practice)

| Spring Cloud component          | Previous post (order-payment learning)   | This post (card payment practice)                             |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| **Eureka**                      | Basics of service registration/discovery | Registry for 7 services, instance management per card company |
| **Inter-service communication** | `RestTemplate` + `@LoadBalanced`         | `OpenFeign` (`@FeignClient`)                                  |
| **Circuit Breaker**             | (teased for the next post)               | Resilience4j, independent CB instances per card company       |
| **API Gateway**                 | (not applied)                            | Spring Cloud Gateway WebMVC, single entry point               |
| **Config Server**               | Basics of centralized config management  | Externalized routing map (`pg.routing.brand-acquirer-map`)    |

---

## Closing Thoughts (๑╹o╹)✎

If the previous post studied each Spring Cloud component individually through an order-payment system, this project let me experience how those components **combine organically within one system**.

What especially stood out was the moment when the `RoutingPolicy` interface created in Phase 5 was replaced by `BinBasedRoutingPolicy` in Phase 6. The fact that **the entire routing strategy changes without modifying a single line of the existing Facade code** made me feel that OCP (the Open-Closed Principle) is not just a theory, but a design principle that truly works in practice.

I also learned through the independent Circuit Breaker design for each card company that the core MSA value of "failure isolation" must be implemented not only at the infrastructure level (`Eureka`, `Gateway`) but also at the **business-logic level** (`AcquirerClient`).

If you spot anything incorrect, please let me know in the comments. 🙇🏻‍♀️

## References

- [Spring Cloud OpenFeign - Declarative REST Client](https://docs.spring.io/spring-cloud-openfeign/reference/)
- [Resilience4j - Circuit Breaker Documentation](https://resilience4j.readme.io/docs/circuitbreaker)
- [Spring Cloud Circuit Breaker](https://docs.spring.io/spring-cloud-circuitbreaker/reference/)
- [Spring Cloud Gateway - Server WebMVC](https://docs.spring.io/spring-cloud-gateway/reference/)
- [Cloud Native Lecture Notes - Implementing a Card Processing Flow](https://baceru.vercel.app/Daily/practice/3.card-process-msa)
