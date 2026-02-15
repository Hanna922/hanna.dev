---
author: Hanna922
pubDatetime: 2026-02-14T10:00:00.000Z
modDatetime:
title: MiniSearch에서 RAG로 - 블로그 검색 고도화의 실패와 설계, MVP 구현기
featured: false
draft: false
tags:
  - RAG
  - LLM
  - Astro
  - MiniSearch
description: MiniSearch 기반 키워드 검색에서 RAG 통합 요구사항이 도출된 배경과 MVP 구현 과정
---

"요구사항 문서"는 보통 기능 명세처럼 보이지만, 사실은 **운영 중에 겪은 실패의 기록**에 가깝습니다.

이번 글에서는 현재 Astro 블로그에 적용한 RAG 시스템의 요구사항이 왜 필요해졌는지, 그리고 그 출발점이었던 **MiniSearch + LLM 프롬프트 주입 방식**에서 어떤 한계를 겪었는지 공유합니다. 또한 requirements/design/tasks 문서를 실제 코드로 옮긴 **MVP(Task 1~7) 구현 과정**까지 코드와 함께 공유합니다.

## 시작점: MiniSearch + Gemini 조합은 왜 매력적이었나

초기 구조는 단순했습니다.

1. 정적 블로그 글을 MiniSearch로 색인한다.
2. 사용자 질문이 오면 키워드 기반으로 문서를 몇 개 찾는다.
3. 찾은 본문 일부를 LLM 프롬프트 앞에 붙여서 답변을 생성한다.

이 방식은 구현 속도가 빠르고, 인프라 비용이 거의 없다는 장점을 가집니다. 특히 개인 블로그처럼 문서 수가 많지 않은 환경에서는 "충분히 괜찮아 보이는" 결과가 자주 나옵니다. 하지만 사용자 질문이 길어지고, 표현이 다양해지고, 코드 맥락을 요구하기 시작하면 문제가 발생했습니다.

### 1) 키워드가 맞아야만 찾는 구조의 한계

MiniSearch는 기본적으로 키워드 매칭입니다. 사용자가 "reconcile phase" 대신 "파이버 비교 단계"라고 물으면 관련 글을 놓칩니다. 즉, 영문/한글 혼합 표현, 축약어, 문맥적 유사어에 취약하며 질문의 **의미**가 아닌 **표현 문자열**에 크게 의존했습니다.

### 2) 프롬프트 주입 컨텍스트의 품질 불안정

MiniSearch 검색 결과를 그대로 프롬프트에 붙이면 질문과 무관한 문단까지 함께 들어가 LLM이 판단하기 어려워집니다.
또한 코드 블록/링크 맥락이 깨져 근거 인용이 부정확해집니다. 결국 "검색 → 주입"은 했지만, **주입되는 컨텍스트의 밀도와 정합성**이 보장되지 않았습니다.

### 3) 출처 표기와 UI 계약 유지의 어려움

기존 UI(`LLMSearchModal`)는 스트리밍 응답과 `sources` 포맷을 기대합니다. 초기에는 검색 결과와 답변이 느슨하게 연결되어서, 실제로 사용되지 않은 문서가 출처에 뜨거나 반대로 답변에 반영된 문서가 누락되기도 했습니다. 따라서 사용자 입장에서는 "이 답변이 진짜 해당 블로그 글 기반인지" 신뢰하기 어려웠습니다.

### 4) 운영 관점에서 재현성과 관측 가능성 부족

문제가 생겼을 때 원인 분석 또한 어려웠습니다. 어떤 쿼리에서 어떤 문서를 붙였는지, 유사도 기준으로 왜 탈락했는지, 장애 시 왜 fallback 되었는지 파악하기 어려웠습니다.

## design 문서에서 확정한 핵심 구현 의사결정

requirements 문서가 "왜 필요한가"를 설명했다면, design 문서는 "어떻게 구현할 것인가"를 구체화했습니다. 아래는 design에서 내린 핵심 결정들과, 그 결정을 내리게 된 배경입니다.

### 1) 아키텍처: MiniSearch 제거가 아닌 Hybrid Search

설계의 핵심은 대체(replace)가 아니라 결합(combine)이었습니다.

MiniSearch는 빠른 키워드 매칭에 여전히 강합니다. 사용자가 정확한 용어를 입력하면 즉시 결과를 돌려주는 이 속도를 버릴 이유가 없었습니다. 대신 MiniSearch가 놓치는 의미 검색 영역을 Upstash Vector로 보강하고, 두 결과를 임계값 필터 후 RRF(Reciprocal Rank Fusion)로 병합하는 방식을 택했습니다. 즉, 기존 장점을 버리지 않고 recall/precision을 함께 개선하는 방향입니다.

### 2) 기술 스택 선택 이유를 명문화

design에서는 스택 선택뿐 아니라 "왜 이것인지, 왜 다른 것은 아닌지"까지 명문화했습니다.

**Vercel AI SDK**는 이미 기존 스트리밍 파이프라인에서 사용 중이었기 때문에, 새 파이프라인을 추가하더라도 인터페이스가 자연스럽게 결합됩니다. **Upstash Vector**는 서버리스 환경과 궁합이 좋고, 무료 티어가 있어 개인 블로그 규모에서 비용 부담이 없습니다. 임베딩 모델은 **Gemini `gemini-embedding-001`**(768-dim)로 고정해서 속도와 비용 사이 균형을 잡았습니다.

반면 LangChain은 복잡도와 번들 크기 부담 때문에, 로컬 벡터만 사용하는 방식은 서버리스 환경의 메모리/로딩 한계 때문에 각각 배제했습니다. 이렇게 대안 배제 사유까지 문서화해 두면, 나중에 "왜 LangChain 안 썼어요?"라는 질문에 설계 시점의 판단을 그대로 참조할 수 있습니다.

### 3) 가장 중요한 결정: 인덱싱 파이프라인 분리

`astro build`와 인덱스 동기화를 분리해 배포 안정성을 확보했습니다. 별도 `sync-rag-index` 스크립트로 독립 실행하고, 수동/스케줄/CI 중 선택할 수 있도록 구성했습니다. 이렇게 분리한 이유는 명확합니다. 네트워크 불안정이나 임베딩 API 장애가 웹 배포 자체를 막아서는 안 되기 때문입니다.

### 4) 증분 업데이트 전략

매번 전체 문서를 재색인하면 비용과 시간이 낭비됩니다. "변경된 글만 갱신"을 가능하게 하려면 명확한 식별자 규칙이 필요했습니다.

chunk id는 `{postId}:{chunkIndex}` 형식으로 정의하고, manifest에 문서별 `contentHash`, `chunkIds`, `lastUpdated`를 저장합니다. 동기화 시에는 hash를 비교해서 변경된 문서의 청크만 delete/upsert 합니다. 이 구조 덕분에 재색인은 idempotent 하게 수행할 수 있고, 같은 스크립트를 여러 번 돌려도 부작용이 없습니다.

### 5) 코드 블록 처리 원칙 분리

개발 블로그에서는 코드가 중요한 근거입니다. 그래서 동일 데이터라도 검색 목적에 따라 표현을 분리했습니다. MiniSearch 인덱스에서는 코드를 제거해 경량화하고, RAG 청크에서는 코드를 보존해 정확도를 높였습니다. 같은 글이라도 "키워드로 빠르게 찾는 것"과 "LLM에게 정확한 근거를 주는 것"은 요구하는 데이터 형태가 다르기 때문입니다.

### 6) 점수 정규화와 품질 필터링

RRF는 rank 기반이라 저품질 결과가 섞이면 전체가 오염되기 쉽습니다. 그래서 병합 전에 반드시 임계값 필터를 먼저 거치도록 순서를 강제했습니다. semantic score는 0.6 이상, keyword score는 0.5 이상인 결과만 통과시키고, 필터를 통과한 결과만 RRF로 병합한 뒤 top K를 반환합니다. 이 순서를 지키지 않으면 유사도가 낮은 문서가 rank만으로 상위에 올라오는 문제가 생기기 때문에, 필터 → 병합 → 반환 순서를 설계 단계에서 고정했습니다.

### 7) 출처 정확도 개선의 단계적 적용

스트리밍 특성상 "답변이 끝나기 전에 어떤 출처가 실제로 인용됐는지" 판단하기 어렵습니다. 그래서 출처 정확도 개선은 두 단계로 나눴습니다. Phase 1에서는 검색된 source를 전체 반환해 빠르게 적용하고, Phase 2에서는 응답 텍스트에서 `(출처 N)` 마커를 파싱해 실제 인용된 source만 필터링합니다. 완벽한 정확도를 첫 릴리스에 맞추려다 전체 일정이 밀리는 것보다, 단계적으로 개선하는 편이 현실적이라고 판단했습니다.

### 8) Timeout/Cache 설계

런타임 안정성을 위해 시간과 캐시 정책도 명시적으로 정의했습니다. Vector query timeout은 1000ms, 전체 검색 예산(Total search budget)은 2000ms로 잡았고, 캐시 키는 `{query}:{indexVersion}` 형식에 TTL 5분을 적용합니다. 이 예산을 초과하면 자동으로 MiniSearch fallback이 동작하도록 설계했습니다. 이렇게 시간 제한을 명시해 두면 "느린 검색"이 사용자 경험을 해치기 전에 차선책으로 전환할 수 있습니다.

## Correctness Properties를 정의한 이유

이번 design 문서에서 특히 유효했던 부분은 "정확성 속성(property)"입니다.

요구사항이 선언이라면, property는 검증 기준입니다. 예를 들어 "문서 로딩 수 = 컬렉션 문서 수" 같은 속성은 로더가 문서를 누락하지 않았는지 확인하는 기준이 되고, "RAG 실패 시 graceful fallback" 속성은 장애 테스트의 합격 조건이 됩니다. 이 외에도 chunk metadata 완전성 보장, top-K 제한, API 호환(`prompt/query`, source marker), cache key에 indexVersion 반영 등을 명시했습니다.

이렇게 명시해야 구현/테스트/운영이 같은 기준으로 움직일 수 있습니다.

## 테스트 전략도 함께 문서화한 이유

RAG는 기능 하나가 아니라 파이프라인입니다. 그래서 테스트도 단계화했습니다.

Phase 0~4 롤아웃 계획을 먼저 세우고, 각 단계마다 계약 테스트(응답 포맷/스트리밍 마커), fallback 테스트(장애 시 MiniSearch 전환), property-based 테스트(핵심 불변성 검증)를 배치했습니다. 핵심은 "잘 동작한다"가 아니라, **"망가져도 예측 가능하게 동작한다"**를 검증하는 것입니다.

## 핵심 교훈: RAG 도입의 본질은 모델 교체가 아니라 운영 규약 수립

많은 경우 RAG는 "벡터 DB 붙이기"로 설명되지만, 실제로는 다음이 더 중요했습니다.

- 어떤 데이터를 어떤 단위로 넣는가
- 어떤 기준으로 검색 결과를 채택/제외하는가
- 실패했을 때 어떤 경로로 서비스 품질을 보장하는가
- 기존 UI/스트리밍 계약을 어떻게 유지하는가

요구사항 문서는 이 운영 규약을 정의했고,
design 문서는 그 규약을 실행 가능한 구조로 바꿨습니다.

## 실제 구현 기록: MVP Task 1~7

아래는 tasks.md 기준으로, 실제로 구현된 내용을 코드와 함께 정리한 내용입니다.

### Task 1. Phase 0 - 안전한 기반 작업

#### 1.1 환경변수/설정 로더

먼저 feature flag와 기본 파라미터를 안전하게 읽는 설정 로더를 만들었습니다. `src/lib/rag/config.ts`에서 `RAG_ENABLED`, chunk 파라미터, topK, 임계값, 임베딩 배치 크기를 로딩하며, 값이 없거나 잘못된 경우 기본값으로 폴백하도록 구성했습니다. 이렇게 설정해둠으로써 잘못된 env 값이 들어와도 즉시 장애로 번지지 않고 기본 값으로 동작합니다.

```ts
// src/lib/rag/config.ts
export function getRAGConfig(): RAGConfig {
  return {
    enabled: import.meta.env.RAG_ENABLED === "true",
    embeddingModel: normalizeEmbeddingModel(
      import.meta.env.RAG_EMBEDDING_MODEL
    ),
    chunkSize: getNumber(import.meta.env.RAG_CHUNK_SIZE, 700),
    chunkOverlap: getNumber(import.meta.env.RAG_CHUNK_OVERLAP, 120),
    topK: getNumber(import.meta.env.RAG_TOP_K, 5),
    similarityThreshold: getNumber(
      import.meta.env.RAG_SIMILARITY_THRESHOLD,
      0.6
    ),
    embeddingBatchSize: getNumber(
      import.meta.env.RAG_EMBEDDING_BATCH_SIZE,
      100
    ),
  };
}
```

#### 1.2 벡터 스토어 추상화

MVP에서는 우선 `src/lib/rag/vector-store.ts`에 `VectorStore` 인터페이스를 두고, `InMemoryVectorStore` 구현을 사용하는 방식으로 시작했습니다. Upstash 우선 전략은 유지하되, MVP에서는 local/prod 공통으로 빠르게 검증 가능한 구조를 택했습니다. `query`는 코사인 유사도로 정렬된 topK를 반환합니다.

> 설계 문서에서는 Upstash Vector를 1순위로 뒀지만, MVP 안전성을 위해 현재 브랜치에서는 인메모리 store + prebuilt index(`public/rag-index.json`) 전략으로 먼저 고정했습니다.

```ts
// src/lib/rag/vector-store.ts
export interface VectorStore {
  upsert(chunks: EmbeddedChunk[]): Promise<void>;
  query(
    queryEmbedding: number[],
    options: { topK: number }
  ): Promise<SemanticHit[]>;
  size(): number;
}

export class InMemoryVectorStore implements VectorStore {
  private readonly store = new Map<string, EmbeddedChunk>();

  async query(queryEmbedding: number[], options: { topK: number }) {
    return Array.from(this.store.values())
      .map(chunk => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
  }
}
```

#### 1.3 로깅/메트릭 유틸

RAG 파이프라인은 구간이 길기 때문에 최소한의 구조화 로그를 먼저 넣었습니다.

```ts
// src/lib/rag/logger.ts
export const ragLogger = {
  info: (message: string, context?: Record<string, unknown>) =>
    write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    write("error", message, context),
};
```

### Task 2. Phase 1A - 문서 처리 파이프라인

#### 2.1 문서 로더 구현

문서 수집은 Astro Content Collection의 blog 문서를 로드한 것과 custom 문서(`src/content/rag/custom-documents.json`)를 로드한 것을 병합해 RAG 입력으로 만듭니다. blog 로더에서는 `draft`를 제외하고, title, description, tags, url, content를 추출하도록 맞췄습니다.

```ts
// src/lib/rag/document-loader.ts
export async function loadRAGDocuments(): Promise<RAGDocument[]> {
  const [blogDocs, customDocs] = await Promise.all([
    loadBlogDocuments(),
    loadCustomDocuments(),
  ]);

  return [...blogDocs, ...customDocs];
}
```

#### 2.x 청킹 관련

청킹 모듈 자체는 이미 heading + size/overlap 기반으로 작성돼 있습니다.

```ts
// src/lib/rag/chunking.ts
function splitByHeading(markdown: string): string[] {
  const sections = markdown.split(/\n(?=#{1,6}\s)/g);
  return sections.map(section => section.trim()).filter(Boolean);
}
```

다만 현재 MVP 인제스트 경로에서는 1문서 1청크에 가까운 단순 전략을 우선 적용했고, 다음 단계에서 본격 연결할 계획입니다.

### Task 3. Phase 1A - 임베딩 생성

#### 3.1 임베딩 서비스

배치 임베딩 + 재시도(2s/4s/8s)로 API 불안정성을 흡수합니다.

```ts
// src/lib/rag/embeddings.ts
for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
  try {
    const result = await embedMany({
      // Vercel AI SDK `embedMany()` 사용
      model,
      values: batch.map(chunk => chunk.text), // 배치 처리
    });
    // ... push embeddings
    break;
  } catch (error) {
    if (attempt < backoffMs.length)
      await sleep(backoffMs[attempt]); // 지수 백오프(2s, 4s, 8s) 재시도
    else throw error;
  }
}
```

#### 3.3/3.4 sync 스크립트

`sync-rag-index` 스크립트로 blog, custom 문서를 임베딩하여 사전 임베딩 파일(`public/rag-index.json`)을 생성합니다. `package.json`의 `sync-rag-index` 스크립트 및 `build` 파이프라인에 연결해 배포 시 사전 색인이 가능하도록 했습니다.

```js
// scripts/sync-rag-index.mjs
const result = await embedMany({
  model,
  values: chunks.map(chunk => chunk.text),
});

await writeFile(outFile, JSON.stringify(embedded), "utf-8");
```

### Task 5. Phase 1B - 의미 검색/컨텍스트 구성

#### 5.1 의미 검색

쿼리 임베딩 후 유사도 임계값으로 필터링합니다.

```ts
// src/lib/rag/semantic-search.ts
const hits = await vectorStore.query(embedding, { topK: options.topK }); // 쿼리 임베딩 생성 후 vector store 조회
return hits.filter(hit => hit.score >= options.similarityThreshold); // 유사도 임계값 필터 적용
```

#### 5.3 컨텍스트 포맷터

같은 URL의 결과를 병합해서 중복 컨텍스트를 줄이고, 프롬프트에 `(출처 N)` 규칙을 포함합니다.

```ts
// src/lib/rag/context-formatter.ts
const key = hit.chunk.metadata.url;
const entry = merged.get(key) ?? { title, url, texts: [] };
entry.texts.push(hit.chunk.text); // UI에 넘길 source 배열 생성
```

### Task 6. Phase 1C - `/api/search` 통합

핵심은 "RAG ON/OFF + 장애시 즉시 fallback + 기존 계약 유지"였습니다. 아래와 같이 구현함으로써 내부 구현을 바꿔도 프론트(`LLMSearchModal`)가 기대하는 스트리밍/소스 포맷은 그대로 유지됩니다. 즉, 백엔드 내부는 바뀌어도 **프론트 계약은 그대로 유지**되도록 구현했습니다.

```ts
// src/pages/api/search.ts
try {
  if (isRAGEnabled()) {
    // `RAG_ENABLED` feature flag로 경로 전환
    const rag = await runRAGSearch(prompt, {
      apiKey,
      originRequestUrl: request.url,
    });
    sourcesForClient = rag.sources;
    llmPrompt = rag.prompt;
  } else {
    // MiniSearch path
  }
} catch (error) {
  console.warn("RAG search failed; falling back to MiniSearch", error);
  // MiniSearch fallback
}
```

### 6.5 `src/lib/rag/index.ts` 심화 설명 (핵심 런타임 오케스트레이션)

개인적으로 이 파일은 "RAG 엔진의 컨트롤 타워"에 가깝습니다. 설정(`getRAGConfig`)을 읽고, 인덱스 적재 상태를 확인하고, 필요 시 인제스트를 수행하고, semantic 검색 → 프롬프트/소스 변환까지 한 번에 조립합니다.

#### A. 모듈 레벨 상태: `vectorStore`, `isIngested`

```ts
const vectorStore = new InMemoryVectorStore();
let isIngested = false;
```

- `vectorStore`: 서버 런타임 인스턴스 메모리에 벡터를 보관합니다.
- `isIngested`: 같은 인스턴스에서 중복 인제스트를 막는 가드입니다.
  - 첫 요청에서만 인제스트를 수행하고
  - 이후 요청에서는 바로 검색 단계로 넘어갑니다.

#### B. prebuilt 우선 로딩: `loadPrebuiltIndex()`

```ts
const indexUrl = new URL("/rag-index.json", originRequestUrl);
const res = await fetch(indexUrl).catch(() => null);
if (!res?.ok) return null;

const chunks = (await res.json()) as EmbeddedChunk[];
if (chunks.length === 0) return null;
return chunks;
```

이 함수는 **"런타임 임베딩 전에 prebuilt를 먼저 시도"**한다는 전략을 구현합니다. 덕분에 첫 요청 지연/비용을 크게 줄일 수 있으며, fetch 실패나 빈 인덱스면 null을 반환 후 다음 경로로 진행합니다.

#### C. 문서→청크 변환: `toDocumentChunks()`

```ts
return loadRAGDocuments().then(docs =>
  docs.map(doc => ({
    id: doc.id,
    docId: doc.id,
    text: `${doc.title}\n\n${doc.description}\n\n${doc.content}`,
    metadata: { title: doc.title, tags: doc.tags, url: doc.url },
  }))
);
```

현재 MVP에서는 문서를 비교적 큰 단위로 합성해서 임베딩합니다. `title + description + content`를 하나의 텍스트로 결합하는데, 향후 Task8+에서는 chunking 모듈과 연결해 미세 단위 검색으로 고도화 할 예정입니다.

#### D. 인제스트 게이트: `ingestIfNeeded()`

이 함수가 실제로 "한 번만 인덱스 준비"를 보장합니다.

1. `isIngested`가 true면 즉시 return
2. prebuilt 로딩 시도
3. prebuilt 성공 시 upsert + 종료
4. prebuilt 실패 시 런타임 임베딩

```ts
if (isIngested) return;

const prebuilt = await loadPrebuiltIndex(originRequestUrl);
if (prebuilt) {
  await vectorStore.upsert(prebuilt);
  isIngested = true;
  ragLogger.info("RAG prebuilt index loaded", { chunks: prebuilt.length });
  return;
}

const embedded = await embedChunks(chunks, {
  apiKey,
  model: config.embeddingModel,
  batchSize: config.embeddingBatchSize,
});
await vectorStore.upsert(embedded);
isIngested = true;
```

이 구조 덕분에, 운영 중에는 대부분 **"prebuilt 즉시 로드 → 검색"** 경로를 타게 됩니다.

#### E. 최종 실행 함수: `runRAGSearch()`

```ts
const config = getRAGConfig();
await ingestIfNeeded(options.apiKey, options.originRequestUrl);

const hits = await semanticSearch(query, vectorStore, {
  apiKey: options.apiKey,
  model: config.embeddingModel,
  topK: config.topK,
  similarityThreshold: config.similarityThreshold,
});

return {
  hits,
  prompt: buildPromptWithContext(query, hits),
  sources: toSourceRefsFromSemanticHits(hits),
};
```

정리하면 이 함수는 아래 3단계를 고정합니다.

1. 인덱스 준비 보장
2. semantic 검색
3. LLM 입력/출력 포맷 변환

즉, `src/pages/api/search.ts`에서 RAG 경로를 탈 때 "한 번에 호출 가능한 엔드포인트 함수" 역할을 합니다.

### Task 7. Checkpoint - End-to-End 동작 확인

현재 MVP(Task7) 기준으로는 아래 흐름이 완성되어 있습니다.

1. `sync-rag-index`로 사전 임베딩 인덱스 생성
2. 서버 런타임에서 prebuilt index 우선 로드 (`src/lib/rag/index.ts`)
3. `RAG_ENABLED=true` 시 semantic 검색 + 컨텍스트 프롬프트 생성
4. 실패 시 MiniSearch fallback
5. 기존 UI 스트리밍 표시/출처 렌더링 유지

인덱스 로딩 우선순위도 코드로 명시돼 있습니다.

```ts
// src/lib/rag/index.ts
const prebuilt = await loadPrebuiltIndex(originRequestUrl);
if (prebuilt) {
  await vectorStore.upsert(prebuilt);
  isIngested = true;
  return;
}

// prebuilt 없으면 런타임 임베딩
const embedded = await embedChunks(chunks, { apiKey, model, batchSize });
await vectorStore.upsert(embedded);
```

이 단계까지가 "동작하는 첫 번째 RAG"를 만드는 목표였습니다.

## 앞으로 Develop 할 부분 (다음 단계)

Task7 이후에는 아래를 우선 개발하려고 합니다.

1. **Hybrid Search 정식 도입 (Task8)**
   - keyword + semantic 병렬 실행
   - threshold 필터 후 RRF 병합
   - weight 튜닝(0.4 / 0.6)

2. **쿼리 캐시/버전 키 (Task9)**
   - `{query}:{indexVersion}` 키 전략
   - TTL/무효화 정책 고도화

3. **증분 인덱싱 + Manifest (Task11)**
   - `{postId}:{contentHash}:{chunkIndex}` 체계
   - 변경 문서만 재색인

4. **실패 청크 재처리(DLQ) 및 운영 자동화 (Task12~13)**
   - 재시도 파이프라인 구축
   - 장애 복구 시간 단축

5. **프로덕션 하드닝 (Task14~16)**
   - 성능 지표(p50/p95), timeout budget 고정
   - property/integration 테스트 강화
   - 운영 가이드/런북 정리

## 마무리

MiniSearch 기반 프롬프트 주입은 빠르게 시작하기엔 아주 좋은 선택이었습니다. 다만 정확도, 근거성, 재현성, 비용 통제까지 요구되는 순간부터는 구조적 한계가 명확해졌습니다.

이번 RAG 요구사항 + 설계 문서는 **"어떻게 하면 신뢰 가능한 검색-생성 시스템을 오래 운영할 수 있는가"** 에 대한 답입니다.

같은 전환을 고민하는 분들이라면, 기술 선택보다 먼저 "왜 이 요구사항이 필요한지"를 실패 사례 관점에서 적어보시길 추천합니다. 그리고 그 다음 단계로, 설계 문서에서 아키텍처/인터페이스/테스트 기준까지 연결해 두신다면, 미래의 장애 대응 속도와 제품 품질을 향상시킬 수 있을 것 같습니다!
