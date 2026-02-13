# Implementation Plan(tasks.md) 검증 결과

## 총평
현재 `tasks.md`는 **실행 순서가 명확하고, 단계별 체크포인트/테스트 전략/요구사항 추적성까지 포함한 매우 좋은 구현 계획**입니다. 특히 Phase 분리, fallback 전략, API 호환성 유지, 증분 인덱싱 분리 설계는 실제 운영 환경에서 강점입니다.

다만, 운영 안정성과 일정 현실성을 높이려면 아래 항목을 우선 보완하는 것을 권장합니다.

## 잘 작성된 점
- Phase 0→4 순차 구조로 리스크를 낮춘 점
- `/api/search` 하위호환(요청/응답/스트리밍 마커) 요구를 명시한 점
- 증분 인덱싱(해시/manifest/delete/upsert)을 독립 Phase로 분리한 점
- 체크포인트를 둬 실패 시 롤백/중단 기준이 있는 점
- 요구사항 번호를 태스크마다 연결해 traceability를 확보한 점

## 우선 수정 권장 사항 (High Priority)

### 1) 상태 표기와 완료 기준 불일치
- 상단에 `Phase 0`과 일부 `Phase 1A`가 `[x]`로 완료 처리되어 있으나, 실제로는 해당 구현/테스트 산출물 존재 여부를 문서만으로 검증할 수 없습니다.
- "계획 문서"와 "진행 현황"이 혼재되어 관리 혼선을 유발할 수 있습니다.

**권장 수정**
- 계획 문서에서는 기본적으로 전부 `[ ]`로 두고, 별도 `status.md`/프로젝트 보드로 진행률 관리
- 또는 각 `[x]` 항목에 증거 링크(커밋/파일/테스트 리포트) 추가

### 2) 필수/선택 테스트 정의가 충돌
- Notes에서 `*`는 optional이라고 했지만, 일부 `REQUIRED` 테스트와 우선순위 체계가 겹쳐 혼동됩니다.

**권장 수정**
- 라벨 체계를 통일: `MUST`, `SHOULD`, `NICE_TO_HAVE`
- `*` 제거 후 각 태스크에 우선순위 명시

### 3) 성능 목표와 타임아웃 수치의 정합성 부족
- Phase 4에서 `vector query timeout 1000ms`, `total search timeout 2000ms`인데, 상위 요구사항의 retrieval/LLM 포함 목표와 충돌 가능성이 큽니다.

**권장 수정**
- p50/p95 기준으로 목표 재정의
- 콜드스타트 포함/제외 명시
- 타임아웃은 "하드 컷오프"와 "경고 임계치"를 분리

### 4) 보안/개인정보 로그 가드 누락
- 계획상 query text, IDs, stack trace 로그가 많지만 PII 마스킹/보존 정책/샘플링 정책이 없습니다.

**권장 수정**
- 로그 정책 태스크 추가(마스킹 규칙, retention, debug only 필드)
- 운영 환경에서 원문 query 로그 opt-in 기본값 적용

### 5) 서버리스 런타임 제약 반영 부족
- Runtime 캐시/임베딩 전략이 인스턴스 재시작에 취약한데, 계획에 이를 상쇄할 운영 전략이 제한적입니다.

**권장 수정**
- 캐시/큐/manifest의 영속 저장소 우선순위 명시
- "in-memory는 best-effort"를 태스크 레벨의 acceptance criteria로 격상

## 섹션별 피드백

### Phase 0
- 구성/로깅 추상화 순서가 적절합니다.
- 다만 `vector store abstraction`과 `config`에 adapter contract test를 조기 추가하면 이후 라이브러리 변경 리스크가 크게 줄어듭니다.

### Phase 1A~1C
- 문서 로더 → chunking → embeddings → semantic search → API 통합 흐름이 이상적입니다.
- `token counting (words * 1.3)`는 언어/코드 블록 비율에 따라 오차가 큽니다. 가능하면 실제 tokenizer 기반 측정으로 변경 권장.
- similarity threshold(0.6)는 환경변수화 + 실험 로그 기반 튜닝 필요.

### Phase 2
- Hybrid + RRF 도입은 품질 개선에 유효합니다.
- 단, 가중치(0.4/0.6)와 임계값은 고정값보다 실험 파라미터로 관리하는 것이 안전합니다.

### Phase 3
- 해시/manifest/증분 upsert-delete 설계는 매우 좋습니다.
- 삭제 검증(removed post purge)과 orphan chunk 정리 작업을 명시적으로 추가하면 운영 중 데이터 오염을 예방할 수 있습니다.

### Phase 4
- 관측성과 운영 문서화 분리가 좋습니다.
- E2E를 "한 번은 반드시" 실행한다는 규칙은 타당하나, 실행 증빙(리포트 아카이브) 태스크를 함께 두는 것이 좋습니다.

## 바로 추가하면 좋은 태스크 (권장)
1. **Adapter Contract Tests (MUST)**: `Retriever`, `VectorStore`, `Embedder` 인터페이스 호환성 테스트
2. **PII-safe Logging (MUST)**: 이메일/전화번호/토큰 마스킹 테스트 포함
3. **Golden Set Evaluation (MUST)**: Recall@K, MRR, Faithfulness baseline 대비 개선 검증
4. **Orphan Vector Cleanup (SHOULD)**: 삭제/slug 변경 시 잔여 벡터 정리 작업
5. **SLO Dashboard (SHOULD)**: p50/p95 retrieval, fallback rate, cache hit rate 추적
6. **Feature Rollout Plan (SHOULD)**: 0%→10%→50%→100% 단계 롤아웃 + 자동 롤백 조건

## 결론
- 현재 `tasks.md`는 **구현 가능한 고품질 실행 계획**입니다.
- 다만 실제 프로덕션 성공률을 높이려면 다음 3가지를 우선 반영하세요:
  1) 상태/우선순위 체계 정합화,
  2) 성능·타임아웃·서버리스 제약의 현실화,
  3) 보안/로그/평가 지표 태스크의 필수화.

이 3가지를 보완하면, 현재 계획은 PoC 일정표를 넘어 **운영 가능한 delivery plan**으로 충분히 사용할 수 있습니다.
