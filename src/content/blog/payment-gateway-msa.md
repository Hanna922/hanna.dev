---
author: Hanna922
pubDatetime: 2026-03-23T09:00:00.000Z
modDatetime:
title: Spring Cloud MSA 실전 적용 — 카드 결제 게이트웨이를 6단계에 걸쳐 고도화하기
titleEn: Applying Spring Cloud MSA in Practice — Building a Card Payment Gateway in 6 Phases
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
description: 주문-결제 학습 프로젝트에서 배운 Spring Cloud를 실제 카드 결제 승인 시스템에 적용하며 PG 서비스를 6단계에 걸쳐 고도화한 과정을 분석해보자
---

이 글은 Spring Boot 4.0.3 / Spring Cloud 2025.1.0 / Java 17 기준으로 작성되었으며 e0ef9cc commit까지의 내용을 바탕으로 설명합니다.

[이전 글](https://hanna-dev.co.kr)에서 주문-결제 시스템을 모놀리스 → 마이크로서비스 → 서비스 디스커버리 → 중앙화 설정으로 점진적으로 진화시키며 Spring Cloud의 핵심 컴포넌트들을 학습했습니다. 이번에는 그 학습을 **실제 도메인**에 적용합니다. 카드 결제 승인 처리를 위한 MSA 시스템에서 **PG(Payment Gateway) 서비스를 6단계(Phase)에 걸쳐 고도화**하며, 각 Phase에서 어떤 문제를 해결했고, 어떤 설계 결정을 내렸는지를 코드 레벨에서 기록합니다.

## Prerequisites

**카드 결제 승인 흐름**

실제 카드 결제에서는 고객이 카드를 긁으면 여러 참여자를 거쳐 승인이 이루어집니다. 이 프로젝트는 그 흐름을 MSA로 구현한 것입니다.

```
고객 (카드 제시)
  │
  ▼
가맹점 (Merchant) ── 결제 요청 ──→ PG (Payment Gateway)
                                      │
                                      ├── BIN 식별 → 카드 브랜드 판별
                                      │
                                      ▼
                                 카드사 (Acquirer) ── 잔액 확인 ──→ 은행 (Bank)
                                      │
                                      ▼
                                 승인 결과 반환
```

**프로젝트의 서비스 구성**

| 서비스                         | 포트 | 역할                                |
| ------------------------------ | ---- | ----------------------------------- |
| `eureka-server`                | 8761 | 서비스 디스커버리                   |
| `api-gateway`                  | 8000 | API 게이트웨이 (유일한 외부 진입점) |
| `merchant-service`             | 7070 | 가맹점 스텁                         |
| `pg-service`                   | 8081 | **PG 게이트웨이 (고도화 대상)**     |
| `card-authorization-service`   | 9090 | Acquirer A — Visa 전용              |
| `card-authorization-service-2` | 9091 | Acquirer B — MC/Amex/Discover/JCB   |
| `bank-service`                 | 8080 | 은행 (잔액 조회/출금)               |

**이전 글과의 연결**

이전 글의 주문-결제 시스템에서는 `order-service` → `payment-service`라는 단순한 1:1 호출 구조였습니다. 이 프로젝트에서는 `pg-service`가 카드 번호에 따라 **다른 카드사로 라우팅**해야 하고, 카드사 장애 시에도 **시스템 전체가 죽지 않아야** 합니다. 이전 글에서 학습한 Eureka, OpenFeign, Circuit Breaker 같은 Spring Cloud 컴포넌트들이 실전에서 어떻게 조합되는지가 이 글의 핵심입니다.

---

# Part 1. 거래 원장과 승인 흐름 구축 (Phase 1~2)

## **1. Phase 1 — 거래 원장 + 멱등성 기반**

PG 서비스의 첫 번째 과제는 **모든 거래를 추적 가능한 원장(Ledger)에 기록**하는 것입니다. 결제 시스템에서는 네트워크 오류로 인한 중복 요청이 빈번하게 발생하므로, 동일한 요청이 두 번 들어와도 같은 결과를 반환하는 **멱등성(Idempotency)** 보장이 필수입니다.

```
dev.pg.ledger/
  ├── entity/PaymentTransaction.java      ← 거래 원장 엔티티
  ├── enums/ApprovalStatus.java           ← PENDING / APPROVED / FAILED / TIMEOUT
  ├── enums/SettlementStatus.java
  ├── repository/PaymentTransactionRepository.java
  └── service/
      ├── TransactionLedgerService.java   ← 원장 CRUD
      └── IdempotencyService.java         ← 중복 요청 검사
```

`PaymentTransaction` 엔티티가 원장의 핵심입니다. 모든 결제 요청은 이 엔티티로 기록되고, 상태가 `PENDING → APPROVED / FAILED / TIMEOUT`으로 전이됩니다.

`IdempotencyService`는 가맹점이 보낸 `merchantTransactionId`로 기존 거래를 조회합니다. 이미 처리된 거래가 있으면 새로 처리하지 않고 기존 결과를 반환합니다.

## **2. Phase 2 — 승인 흐름 책임 분리 (Facade 패턴)**

Phase 1에서 원장 기반이 마련되면, 승인 흐름 전체를 오케스트레이션하는 `PgApprovalFacade`를 도입합니다.

```java
// PgApprovalFacade.java — 승인 흐름의 핵심 오케스트레이터
@Service
public class PgApprovalFacade {

    public MerchantApprovalResponse approve(MerchantApprovalRequest request) {
        // 1. 입력 검증
        approvalValidationService.validate(request);

        // 2. 멱등성 체크: 이미 처리된 거래인가?
        Optional<PaymentTransaction> existing =
                idempotencyService.findExistingTransaction(request.getMerchantTransactionId());
        if (existing.isPresent()) {
            return approvalMapper.toMerchantApprovalResponse(existing.get());
        }

        // 3. PG 거래 ID 생성 + 원장에 PENDING 상태로 기록
        String pgTransactionId = pgTransactionIdGenerator.generate();
        RoutingTarget routingTarget = acquirerRoutingService.resolveRoutingTarget(request);
        PaymentTransaction transaction = transactionLedgerService.createPendingTransaction(
                request, pgTransactionId, routingTarget.acquirerType()
        );

        // 4. 카드사에 승인 요청
        CardAuthorizationRequest cardRequest =
                cardAuthorizationRequestFactory.create(request, pgTransactionId);

        try {
            CardAuthorizationResponse cardResponse =
                    acquirerRoutingService.authorize(routingTarget, cardRequest);

            // 5. 승인 결과에 따라 원장 상태 갱신
            PaymentTransaction updated = cardResponse.isApproved()
                    ? transactionLedgerService.markApproved(transaction, cardResponse)
                    : transactionLedgerService.markFailed(transaction, cardResponse);
            return approvalMapper.toMerchantApprovalResponse(updated);

        } catch (CardAuthorizationClientException e) {
            // 6. 카드사 통신 장애 처리
            PaymentTransaction failed = handleClientFailure(transaction, e);
            return approvalMapper.toMerchantApprovalResponse(failed);
        }
    }
}
```

이 Facade의 각 단계가 별도의 서비스에 위임되어 있다는 것이 핵심입니다. 검증은 `ApprovalValidationService`, 멱등성은 `IdempotencyService`, 라우팅은 `AcquirerRoutingService`, 원장 관리는 `TransactionLedgerService`가 담당합니다.

> **Facade 패턴을 적용한 이유 🧐**
>
> 결제 승인은 검증 → 멱등성 체크 → 원장 기록 → 카드사 호출 → 결과 반영이라는 복잡한 흐름입니다. 이 흐름을 하나의 서비스 메서드에 모두 넣으면 수백 줄의 메서드가 되고, 각 단계를 독립적으로 테스트하기 어렵습니다. Facade 패턴으로 흐름의 오케스트레이션과 각 단계의 구현을 분리하면, 각 서비스를 독립적으로 단위 테스트할 수 있습니다.

---

# Part 2. 외부 시스템 연동 안정화 (Phase 3~4)

## **3. Phase 3 — 카드사 연동 안정화 (Timeout / Retry / Circuit Breaker)**

이전 글의 step02에서 결제 서비스 호출 시 `try-catch`만 있었다면, 실전에서는 그것만으로 부족합니다. 카드사 시스템은 PG 서비스의 통제 밖에 있으므로, 다음 세 가지 방어 메커니즘이 필요합니다.

```
pg-service → card-authorization-service 호출 시

  [1] Timeout: 응답이 N초 안에 오지 않으면 포기
  [2] Retry:   일시적 네트워크 오류면 재시도
  [3] Circuit Breaker: 연속 실패 시 일정 시간 호출 자체를 차단
```

`CardAuthorizationClient`가 이 세 가지를 모두 감싸는 래퍼 역할을 합니다. FeignClient 인터페이스를 직접 노출하지 않고, 에러 핸들링 래퍼를 통해 호출합니다.

```
dev.pg.client/
  ├── CardAuthorizationClient.java             ← ★ CB + retry + error translation 래퍼
  ├── CardAuthorizationServiceClient.java      ← @FeignClient(name="card-authorization-service")
  └── support/
      ├── CardAuthorizationErrorType.java      ← COMMUNICATION_FAILURE / DOWNSTREAM_FAILURE / CIRCUIT_OPEN
      ├── CardAuthorizationClientException.java
      └── ExternalErrorTranslator.java
```

`CardAuthorizationErrorType`이 중요합니다. 외부 시스템의 다양한 장애 유형을 세 가지로 분류합니다.

| ErrorType               | 의미                        | PG 서비스의 대응                               |
| ----------------------- | --------------------------- | ---------------------------------------------- |
| `COMMUNICATION_FAILURE` | 네트워크 타임아웃/연결 실패 | 원장을 `TIMEOUT`으로 마킹                      |
| `DOWNSTREAM_FAILURE`    | 카드사가 HTTP 5xx 반환      | 원장을 `FAILED`로 마킹                         |
| `CIRCUIT_OPEN`          | 서킷 브레이커가 열린 상태   | 원장을 `FAILED`로 마킹 (호출 자체를 하지 않음) |

> **Circuit Breaker가 왜 필요한가? 🧐**
>
> 카드사 시스템이 다운된 상태에서 모든 요청이 타임아웃까지 기다리면, PG 서비스의 스레드 풀이 고갈되어 다른 정상적인 요청까지 처리하지 못하게 됩니다. Circuit Breaker는 연속 실패가 임계치를 넘으면 **호출 자체를 차단(OPEN)**하여, 장애가 전파되는 것을 막습니다. 일정 시간 후 일부 요청만 시험적으로 보내(HALF-OPEN), 카드사가 복구되면 다시 정상 호출(CLOSED)로 전환합니다.

## **4. Phase 4 — PG 내부 예외 표준화 + 전역 처리**

Phase 3에서 외부 시스템의 에러를 분류했으므로, 이를 PG 서비스 내부의 표준화된 예외 체계로 변환합니다.

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

각 `ErrorCode`는 HTTP 상태 코드와 매핑됩니다.

| ErrorCode                         | HTTP Status           | 의미               |
| --------------------------------- | --------------------- | ------------------ |
| `CARD_AUTH_COMMUNICATION_FAILURE` | 504 Gateway Timeout   | 카드사 응답 없음   |
| `CARD_AUTH_DOWNSTREAM_FAILURE`    | 502 Bad Gateway       | 카드사 서버 에러   |
| `CARD_AUTH_CIRCUIT_OPEN`          | 429 Too Many Requests | 서킷 브레이커 열림 |

`GlobalExceptionHandler`가 `BusinessException`을 잡아서 표준화된 JSON 응답으로 변환합니다. 가맹점 입장에서는 어떤 종류의 장애든 일관된 형식의 에러 응답을 받게 됩니다.

---

# Part 3. 라우팅 추상화와 BIN 기반 다중 카드사 라우팅 (Phase 5~6)

## **5. Phase 5 — 라우팅 추상화 (RoutingPolicy / AcquirerRoutingService)**

Phase 5에서는 아직 카드사가 하나뿐이지만, **앞으로 여러 카드사를 지원하기 위한 추상화**를 미리 만들어둡니다.

```java
// RoutingPolicy.java — 라우팅 전략 인터페이스
public interface RoutingPolicy {
    RoutingTarget route(MerchantApprovalRequest request);
}

// SingleAcquirerRoutingPolicy.java — Phase 5의 구현체 (카드사 1개)
@Component
public class SingleAcquirerRoutingPolicy implements RoutingPolicy {
    @Override
    public RoutingTarget route(MerchantApprovalRequest request) {
        return RoutingTarget.cardAuthorizationService();  // 항상 같은 카드사
    }
}
```

이 시점에서는 `SingleAcquirerRoutingPolicy`가 항상 동일한 카드사를 반환하므로 오버엔지니어링처럼 보일 수 있습니다. 하지만 Phase 6에서 이 추상화가 빛을 발합니다.

## **6. Phase 6 — ★ BIN 기반 다중 Acquirer 라우팅 (현재 진행 중)**

이 프로젝트의 핵심 목표입니다. 카드 번호 앞자리(BIN, Bank Identification Number)로 카드 브랜드를 식별하고, 브랜드별로 다른 카드사(Acquirer)로 라우팅합니다.

```
pg-service가 카드 번호를 보고 라우팅 결정:

  4111 1111 1111 1111  → BIN "4" → Visa     → Acquirer A (card-authorization-service)
  5555 5555 5555 4444  → BIN "5" → Mastercard → Acquirer B (card-authorization-service-2)
  3782 8224 6310 005   → BIN "3" → Amex      → Acquirer B
  3530 1113 3330 0000  → BIN "35" → JCB      → Acquirer B
  6011 1111 1111 1117  → BIN "6" → Discover  → Acquirer B
```

Phase 6은 7개의 서브 단계로 나뉘어 진행됩니다.

### Phase 6-1. CardBrand 모델 + AcquirerType 확장

```java
// CardBrand.java — 카드 브랜드 식별용 enum
public enum CardBrand {
    VISA, MASTERCARD, AMEX, JCB, DISCOVER, UNKNOWN
}

// AcquirerType.java — 기존 1개에서 2개로 확장
public enum AcquirerType {
    CARD_AUTHORIZATION_SERVICE,
    CARD_AUTHORIZATION_SERVICE_2  // ★ 새로 추가
}
```

### Phase 6-2. BinResolver — BIN 식별 서비스

```java
// BinResolver.java — 카드 번호에서 브랜드를 식별
@Component
public class BinResolver {
    public CardBrand resolve(String cardNumber) {
        // longest prefix first: "35"를 "3"보다 먼저 매칭
        if (cardNumber.startsWith("35")) return CardBrand.JCB;
        if (cardNumber.startsWith("3"))  return CardBrand.AMEX;
        if (cardNumber.startsWith("4"))  return CardBrand.VISA;
        if (cardNumber.startsWith("5"))  return CardBrand.MASTERCARD;
        if (cardNumber.startsWith("6"))  return CardBrand.DISCOVER;
        return CardBrand.UNKNOWN;
    }
}
```

> **BIN 식별과 라우팅 정책을 분리한 이유 🧐**
>
> BIN 식별(이 카드가 무슨 브랜드인가?)과 라우팅 결정(이 브랜드를 어느 카드사로 보낼 것인가?)은 다른 책임입니다. BIN 식별 로직은 fraud check, 카드 브랜드 표시 등 다른 곳에서도 재사용할 수 있습니다. 이 둘을 `BinResolver`와 `RoutingPolicy`로 분리하면 각각 독립적으로 변경·테스트할 수 있습니다.

### Phase 6-3. BinBasedRoutingPolicy — Phase 5의 추상화가 빛나는 순간

Phase 5에서 만들어둔 `RoutingPolicy` 인터페이스의 새로운 구현체를 추가합니다. **기존 코드를 수정하지 않고, 새 클래스를 추가하는 것만으로** 라우팅 전략이 교체됩니다.

```java
// BinBasedRoutingPolicy.java — Phase 5의 추상화를 실제로 활용
@Primary
@Component
@ConditionalOnProperty(name = "pg.routing.policy", havingValue = "bin", matchIfMissing = true)
public class BinBasedRoutingPolicy implements RoutingPolicy {

    private final BinResolver binResolver;
    private final RoutingProperties routingProperties;

    @Override
    public RoutingTarget route(MerchantApprovalRequest request) {
        // ★ BIN으로 카드 브랜드를 식별하고, 설정에서 매핑된 카드사를 찾음
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

브랜드와 카드사의 매핑은 `application.yaml`에 **외부화**되어 있습니다.

```yaml
# pg-service의 application.yaml
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

이 설정을 바꾸는 것만으로 JCB를 Acquirer A로 옮기거나, Acquirer C를 추가하는 것이 가능합니다. 이전 글에서 학습한 **Config Server + Actuator Refresh**를 함께 적용하면 재시작 없이 라우팅 변경도 가능합니다.

### Phase 6-4. Second Acquirer FeignClient — 독립적 Circuit Breaker

두 번째 카드사를 위한 FeignClient와 Circuit Breaker 래퍼를 추가합니다.

```
client/
  ├── CardAuthorizationClient.java              ← Acquirer A용 (기존)
  ├── CardAuthorizationServiceClient.java       ← @FeignClient(name="card-authorization-service")
  ├── CardAuthorizationClient2.java             ← ★ Acquirer B용 (신규)
  ├── CardAuthorizationServiceClient2.java      ← ★ @FeignClient(name="card-authorization-service-2")
  └── support/...
```

> **카드사별 독립 Circuit Breaker가 필수인 이유 🧐**
>
> Acquirer A(Visa)가 장애 상태일 때 Circuit Breaker가 하나뿐이면, Mastercard 요청까지 차단됩니다. 카드사별로 CB 인스턴스를 분리해야, A가 다운되어도 B를 통한 Mastercard/Amex/JCB/Discover 결제는 정상 동작합니다. FeignClient의 `name` 속성이 Eureka 서비스 이름과 1:1 매핑이므로, 카드사별로 별도 FeignClient 인터페이스가 필요합니다.

### Phase 6-5. AcquirerRoutingService 확장 — 동적 Client 선택

`AcquirerRoutingService`가 `RoutingTarget`의 `acquirerType`에 따라 올바른 Client를 선택합니다. `AcquirerClient` 공통 인터페이스를 도출하고, `Map<AcquirerType, AcquirerClient>`로 주입하는 Strategy 패턴을 적용합니다.

```
AcquirerRoutingService
  │
  ├── resolveRoutingTarget(request)  → RoutingPolicy에 위임
  │
  └── authorize(routingTarget, cardRequest)
        │
        ├── CARD_AUTHORIZATION_SERVICE   → CardAuthorizationClient.authorize()
        └── CARD_AUTHORIZATION_SERVICE_2 → CardAuthorizationClient2.authorize()
```

3번째 카드사가 추가되어도 `AcquirerRoutingService`의 코드를 수정할 필요가 없습니다. `AcquirerClient` 구현체를 추가하고 yaml에 매핑만 추가하면 됩니다 (OCP 준수).

### Phase 6-6~7. 원장 추적성 + 테스트

모든 거래에 **어느 카드사를 경유했는지**를 `PaymentTransaction.acquirerType` 필드에 기록합니다. 정산 시 "이 거래가 Acquirer A를 통했는가, B를 통했는가?"를 알아야 하기 때문입니다.

---

# Part 4. 전체 아키텍처와 요청 흐름

## 최종 아키텍처 (Phase 6 완료 시)

```
Client
  │
  ▼
api-gateway (:8000) ── 유일한 외부 진입점
  │  /api/merchant/** → lb://merchant-service
  ▼
merchant-service (:7070)
  │  POST /api/pg/approve (FeignClient)
  ▼
pg-service (:8081)  ← ★ 이 서비스를 6단계에 걸쳐 고도화
  │
  │  [1] 입력 검증
  │  [2] 멱등성 체크 (merchantTransactionId)
  │  [3] PG TX ID 생성 + 원장 PENDING 기록
  │  [4] BIN 식별 → 카드 브랜드 판별 → 라우팅 결정
  │
  ├─ BIN 4xxx (Visa) ─── CB₁ ──→ card-authorization-service   (:9090)
  │                                      │
  │                                      └── bank-service (:8080) 잔액 확인/출금
  │
  └─ BIN 5xxx/3xxx/6xxx/35xx ─ CB₂ ──→ card-authorization-service-2 (:9091)
                                             │
                                             └── bank-service (:8080) 공유
  │
  │  [5] 승인 결과로 원장 상태 갱신 (APPROVED / FAILED / TIMEOUT)
  │  [6] 표준화된 응답 반환
  ▼
merchant-service ← 응답 수신
```

## Phase 진화 과정 요약

| Phase | 추가된 것                            | 해결한 문제                          |
| ----- | ------------------------------------ | ------------------------------------ |
| 1     | 거래 원장 + 멱등성 서비스            | 중복 결제 방지, 거래 추적 기반       |
| 2     | PgApprovalFacade (오케스트레이터)    | 승인 흐름의 책임 분리, 테스트 용이성 |
| 3     | CB + Retry + Timeout 래퍼            | 카드사 장애 시 시스템 전체 마비 방지 |
| 4     | 예외 표준화 + GlobalExceptionHandler | 가맹점에 일관된 에러 응답 보장       |
| 5     | RoutingPolicy 인터페이스             | 라우팅 전략 교체 가능한 구조 준비    |
| 6     | BIN 라우팅 + 다중 카드사             | 카드 브랜드별 올바른 카드사로 분기   |

## 이전 글(학습)과 이번 글(실전)의 Spring Cloud 컴포넌트 사용 비교

| Spring Cloud 컴포넌트 | 이전 글 (주문-결제 학습)         | 이번 글 (카드 결제 실전)                             |
| --------------------- | -------------------------------- | ---------------------------------------------------- |
| **Eureka**            | 서비스 등록/발견 기초            | 7개 서비스 레지스트리, 카드사별 인스턴스 관리        |
| **서비스 간 통신**    | `RestTemplate` + `@LoadBalanced` | `OpenFeign` (@FeignClient)                           |
| **Circuit Breaker**   | (다음 글 예고)                   | Resilience4j, 카드사별 독립 CB 인스턴스              |
| **API Gateway**       | (미적용)                         | Spring Cloud Gateway WebMVC, 단일 진입점             |
| **Config Server**     | 설정 중앙 관리 기초              | 라우팅 매핑 외부화 (`pg.routing.brand-acquirer-map`) |

---

## Closing Thoughts (๑╹o╹)✎

이전 글에서 주문-결제 시스템으로 Spring Cloud의 각 컴포넌트를 개별적으로 학습했다면, 이번 프로젝트에서는 그것들이 **하나의 시스템 안에서 유기적으로 결합**되는 것을 경험했습니다.

특히 인상 깊었던 점은 Phase 5에서 만들어둔 `RoutingPolicy` 인터페이스가 Phase 6에서 `BinBasedRoutingPolicy`로 교체되는 순간이었습니다. **기존 Facade 코드 한 줄도 수정하지 않고** 라우팅 전략 전체가 바뀐다는 것이, OCP(개방-폐쇄 원칙)가 단순한 이론이 아니라 실제로 동작하는 설계 원칙이라는 것을 체감하게 해주었습니다.

또한 카드사별 독립 Circuit Breaker 설계를 통해, "장애 격리"라는 MSA의 핵심 가치가 인프라 레벨(`Eureka`, `Gateway`)뿐만 아니라 **비즈니스 로직 레벨**(`AcquirerClient`)에서도 구현되어야 한다는 것을 배웠습니다.

틀린 내용이 있다면 댓글로 알려주세요. 🙇🏻‍♀️

## References

- [Spring Cloud OpenFeign — Declarative REST Client](https://docs.spring.io/spring-cloud-openfeign/reference/)
- [Resilience4j — Circuit Breaker Documentation](https://resilience4j.readme.io/docs/circuitbreaker)
- [Spring Cloud Circuit Breaker](https://docs.spring.io/spring-cloud-circuitbreaker/reference/)
- [Spring Cloud Gateway — Server WebMVC](https://docs.spring.io/spring-cloud-gateway/reference/)
- [Cloud Native 강의 교안 — 카드 처리 프로세스 구현](https://baceru.vercel.app/Daily/practice/3.card-process-msa)
