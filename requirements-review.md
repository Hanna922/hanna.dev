# RAG 요구사항 문서 검증 결과

## 총평
현재 요구사항 문서는 **방향성은 매우 좋고 구현 범위도 충분히 구체적**입니다. 특히 기능별 User Story + Acceptance Criteria 구조, Fallback 고려, 기존 UI 호환성 명시는 실제 개발에 바로 연결 가능한 수준입니다.

다만, 실제 운영 단계에서 문제가 되기 쉬운 항목(측정 가능성, 보안/개인정보, 관측성, 벤더 종속성, 재색인 전략)이 일부 모호하여, 아래 보완이 필요합니다.

## 잘 작성된 점
- RAG 도입 목적(정확성 향상)과 현재 구조(MiniSearch + Gemini)를 명확히 연결함
- Build-Time / Runtime 분리 요구사항이 있어 비용/성능 트레이드오프 논의가 가능함
- Fallback Mode를 독립 요구사항으로 다뤄 장애 내성을 확보함
- 기존 `LLMSearchModal` 및 `/api/search` 호환성을 명시해 마이그레이션 리스크를 줄임
- 성능/비용/모니터링 요구사항이 포함되어 운영 관점까지 커버함

## 핵심 리스크(우선 수정 권장)

### 1) 라이브러리 선택 기준이 아직 추상적
- `supports Vercel serverless`만으로는 후보 비교가 어려움
- Embedding/Streaming/Retriever 추상화 지원 수준을 **평가 체크리스트**로 수치화 필요

권장 보완:
- 필수 기준(MUST): Gemini embedding, 문서 로더, 메타데이터 필터, SSR/serverless 안정성
- 선택 기준(SHOULD): 하이브리드 검색(BM25+Vector), reranker 연동, ingestion 파이프라인 재실행 지원

### 2) 성능 SLA가 현실적으로 타이트할 수 있음
- `retrieval 1초`, `총 3초`는 네트워크/콜드스타트/LLM 지연에 따라 불안정
- SLA와 SLO(예: p50/p95)를 분리해야 운영 지표가 명확해짐

권장 보완:
- `p95 retrieval < 1200ms`, `p95 end-to-end < 6000ms`
- 콜드스타트 제외/포함 여부 명시

### 3) 증분 인덱싱(Requirement 2-4) 구현 조건이 누락됨
- "변경된 포스트만 업데이트"를 하려면 문서 fingerprint/hash와 upsert/delete 정책이 필요

권장 보완:
- 문서 단위 `doc_id`, `content_hash`, `last_indexed_at` 메타데이터 요구 추가
- 삭제된 포스트의 벡터 삭제 기준 명시

### 4) 보안/개인정보/로그 정책 부재
- 현재 로그에 query text 전체 저장 요구가 있는데 개인정보 이슈 가능

권장 보완:
- 로그 PII 마스킹 규칙, 보존 기간(예: 14~30일), Debug 모드 제한
- API 키/토큰 노출 금지 및 에러 응답 sanitization 요구

### 5) 평가(품질 검증) 기준 부재
- "정확성 향상" 목표가 있으나 오프라인/온라인 평가 방법이 없음

권장 보완:
- golden set(질문-정답-근거) 기반 Recall@k, MRR, Faithfulness 평가 요구
- 배포 전 baseline(MiniSearch) 대비 개선 기준(예: 정답률 +15%) 정의

## 섹션별 보완 제안

### Requirement 1 (Library Selection)
- "라이브러리 선정 ADR(Architecture Decision Record) 작성" acceptance criterion 추가
- 벤더 락인 완화를 위해 `Retriever`, `VectorStore`, `Embedder` 인터페이스 분리 명시

### Requirement 2~4 (Ingestion/Chunking/Storage)
- chunk 전략에 "헤더/코드블록 보존" 명시 (개발 블로그 특성 반영)
- chunk size를 토큰 모델 기준으로 측정 방법 명시
- 재색인 모드(full/incremental) 플래그 요구

### Requirement 5~6 (Query/Prompt)
- "유사도 임계값" 고정값 대신 환경변수 + A/B 조정 가능하게 정의
- source citation format을 프롬프트와 응답 후처리 둘 다에서 검증하도록 명시

### Requirement 7 (Build-Time vs Runtime)
- Runtime embedding은 서버리스 메모리 캐시에만 의존하면 재시작 시 손실됨
- 최소한 외부 persistent store 또는 queue 기반 비동기 인덱싱 옵션 필요

### Requirement 9~10 (Performance/Cost)
- 월 비용 경고는 관측 지표 소스(예: provider usage API, 로그 집계) 명시 필요
- "free Vector Store default"는 환경별 제약이 커서 SHOULD로 낮추는 것이 안전

### Requirement 11~12 (Monitoring/Config)
- OpenTelemetry trace/span ID 연계, request correlation id 요구 추가
- feature flag 롤아웃 단계(0%, 10%, 50%, 100%) 정의 권장

## 바로 적용 가능한 추가 Acceptance Criteria (예시)
1. WHEN a document is ingested, THE RAG_System SHALL compute and persist `doc_id`, `content_hash`, and `chunk_count` metadata.
2. WHEN a post is deleted from content collection, THE RAG_System SHALL remove all associated vectors by `doc_id`.
3. WHEN query logs are stored, THE RAG_System SHALL mask emails, phone numbers, and access tokens.
4. WHEN evaluating retrieval quality, THE RAG_System SHALL report Recall@5 and MRR on a fixed golden dataset.
5. WHEN RAG is enabled, THE system SHALL expose p50/p95 retrieval latency metrics.
6. WHEN the selected RAG library changes, THE adapter interface contract tests SHALL pass without UI changes.

## 결론
- 현재 문서는 **"좋은 초안"을 넘어 구현 가능한 수준**입니다.
- 다만 실제 운영 품질을 보장하려면 **평가 지표, 증분 인덱싱 세부, 보안/로그 정책, SLA 정의**를 보강하는 것이 핵심입니다.
- 위 보완을 반영하면 PoC 문서가 아니라 **프로덕션 요구사항 문서(PRD)**로 사용 가능한 품질에 도달합니다.
