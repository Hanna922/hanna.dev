---
author: Hanna922
pubDatetime: 2026-02-14T10:00:00.000Z
modDatetime:
title: From MiniSearch to RAG - Blog Search Enhancement Failures, Design, and MVP Implementation
titleEn: From MiniSearch to RAG - Blog Search Enhancement Failures, Design, and MVP Implementation
featured: false
draft: false
tags:
  - RAG
  - LLM
  - Astro
  - MiniSearch
description: Why RAG requirements emerged from MiniSearch keyword search and how I implemented the MVP (Task 1~7) in code
---

The "requirements document" often looks like a simple feature specification, but in practice it is closer to a record of failures I encountered in production.

In this post, I will share why the RAG requirements became necessary for the current Astro blog, what limitations we faced with the original **MiniSearch + LLM prompt injection** approach, and the full implementation details of **MVP (Task 1~7)** that turned those requirements and design docs into code.

## Starting point: Why MiniSearch + Gemini was initially attractive

The initial setup was intentionally simple:

1. Index static blog posts using MiniSearch.
2. When a user asks a question, find a few documents using keyword search.
3. Append matched snippets to the LLM prompt and generate a response.

This approach is fast to implement and has low infrastructure overhead, so for small blogs it often looks "good enough."  
But once questions become longer, vocabulary varies, or users ask for code context, we started hitting real limits.

### 1) The limit of exact-match keyword retrieval

MiniSearch is fundamentally keyword matching. If a user asks for "fiber comparison phase" instead of "reconcile phase," many relevant docs are missed. It is weak with multilingual or mixed-language queries, abbreviations, and semantic equivalents because the retrieval depends heavily on **surface text**, not **semantic meaning**.

### 2) Unstable quality of prompt injection context

If you directly append MiniSearch results to the prompt, unrelated paragraphs can be included, making LLM judgment noisy.  
On top of that, code-block and link context is often fragmented, reducing citation accuracy. In other words, we did have "search → injection," but there was no guarantee on **density and consistency of injected context**.

### 3) Output source and UI contract mismatches

The existing UI (`LLMSearchModal`) expects streaming results and a `sources` format. At first, search results and answer output were loosely coupled, so some docs appeared in the source list without being used, while used docs were not included in sources.  
From the user perspective, it became hard to trust whether the answer truly came from the intended blog content.

### 4) Poor observability and reproducibility in operation

When incidents happened, root-cause analysis was slow:  
which docs were attached for a query, why semantically similar results were filtered, and why fallback kicked in under failure were all difficult to trace.

## Key implementation decisions finalized in the design doc

If the requirement doc answered "why this is needed," the design doc defined "how to implement it."  
The decisions below were intentionally explicit.

### 1) Architecture: Hybrid Search, not removing MiniSearch

The principle was not replacement, but combination.

MiniSearch is still strong at fast keyword matching. If the user types an exact term, it returns fast and accurately. So we kept it.  
For meaning-based retrieval gaps, we added Upstash Vector, and merged both result sets with RRF (Reciprocal Rank Fusion) after threshold filtering.  
This keeps existing strengths while improving both recall and precision.

### 2) Why we chose each technology explicitly

The design doc recorded not only what was picked, but why alternatives were excluded.

**Vercel AI SDK** was already used in the existing streaming pipeline, so integrating a second stack was low friction.  
**Upstash Vector** fits a serverless workflow and its free tier helps with personal-blog scale. For embeddings, we fixed on **Gemini `gemini-embedding-001` (768-dim)** to balance cost and latency.

LangChain was excluded due to integration complexity and bundle/runtime weight for this scale, while local-vector-only options were also rejected because of serverless memory and startup constraints.

### 3) Core decision: decouple the indexing pipeline

To keep deployment stable, we separated `astro build` from index synchronization.  
An independent `sync-rag-index` script can be run manually, scheduled, or through CI. This prevents an external embedding/API issue from breaking regular site deployment.

### 4) Incremental update strategy

Full re-indexing wastes time and cost, so we needed deterministic identity rules.  
We define `chunk id` as `{postId}:{chunkIndex}` and persist a manifest containing `contentHash`, `chunkIds`, and `lastUpdated` for each document.  
During sync, we compare hashes and perform `delete/upsert` only for changed chunks. This makes re-indexing idempotent: reruns don't cause side effects.

### 5) Splitting code-block treatment by search purpose

In technical blogs, code can be essential evidence. So we split handling:

- MiniSearch index: remove code blocks to keep indexing light.
- RAG chunks: keep code blocks for accurate semantic context.

Both tasks share content but require different representations.

### 6) Score normalization and quality filters

Because RRF is rank-based, low-quality results can pollute ranking.  
To prevent this, filtering happens before fusion: semantic score must be `>= 0.6`, keyword score must be `>= 0.5`, only then merge via RRF, then return top-K.  
If we changed the order, low-quality matches could move up just because of rank effects.

### 7) Gradual source-accuracy rollout

In streaming mode, it is hard to know which source was truly cited before answer completion.  
So source accuracy was handled in two phases:

- Phase 1: return all retrieved sources immediately for fast rollout.
- Phase 2: parse `(Source N)` markers from the final text and retain only truly cited sources.

Trying to get perfect source accuracy in the first release risked schedule delay; phased delivery was the realistic choice.

### 8) Timeout and cache behavior

Stability is also about runtime boundaries.  
We set:

- Vector query timeout: `1000ms`
- Total search budget: `2000ms`
- cache key: `{query}:{indexVersion}` with TTL `5min`

If these limits are exceeded, fallback to MiniSearch automatically.  
This avoids poor UX from slow searches by switching paths predictably.

## Why we defined correctness properties

One of the most practical outcomes was defining **correctness properties** explicitly.

If the requirement is intent, a property becomes a measurable check.  
For example, "loaded document count equals blog document count" verifies no ingestion gaps;  
`graceful fallback on RAG failure` becomes a contract for failure handling.  
We also defined completeness of chunk metadata, top-K enforcement, prompt/query API compatibility, and cache keys including `indexVersion`.

This alignment makes implementation, QA, and operation move with the same success criteria.

## Why we also documented a test strategy

RAG is not a single feature, it is a pipeline. So tests were staged:

- Contract tests for response format and streaming markers
- Fallback tests for MiniSearch failover
- Property-based tests for invariants

The point is not only "works in happy path" but "degrades predictably."

## Main lesson: RAG is not just model substitution

Many people describe RAG as "adding a vector DB."  
The work that mattered more was defining operating rules:

- What document units to ingest
- Which matches are accepted/rejected
- How quality is preserved under failures
- How to preserve existing UI and streaming contracts

Requirements defined these operational rules, and the design doc made them executable.

## Implementation log: MVP Task 1~7

Below is a practical walkthrough of what was implemented, tied to `tasks.md`.

### Task 1. Phase 0 - Safe foundation

#### 1.1 Env + config loader

We started by hardening settings around feature flags and query defaults in `src/lib/rag/config.ts`.  
`RAG_ENABLED`, chunk settings, topK, similarity threshold, and batch size are read with safe fallbacks.  
Bad environment values no longer break immediately; they fall back to defaults.

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

#### 1.2 Vector store abstraction

MVP started with a `VectorStore` interface in `src/lib/rag/vector-store.ts` and an `InMemoryVectorStore` implementation.  
Although Upstash remains the direction, MVP verifies behavior with a local/prod-shared in-memory store first.

> The design selected Upstash Vector first, but for current MVP stability we fixed on an in-memory store + prebuilt index (`public/rag-index.json`) implementation first.

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

#### 1.3 Logging utility

Because the pipeline is long, we added minimal structured logging from day one.

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

### Task 2. Phase 1A - Document pipeline

#### 2.1 Document loader

RAG documents are composed from Astro blog posts and custom docs (`src/content/rag/custom-documents.json`).  
Blog input excludes drafts and extracts title, description, tags, url, and content.

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

#### 2.2 Heading-based chunking

The current chunk helper is already implemented around heading boundaries plus size/overlap settings.

```ts
// src/lib/rag/chunking.ts
function splitByHeading(markdown: string): string[] {
  const sections = markdown.split(/\n(?=#{1,6}\s)/g);
  return sections.map(section => section.trim()).filter(Boolean);
}
```

For MVP ingestion we first keep a near one-chunk-per-document strategy and planned a more fine-grained chunking step later.

### Task 3. Phase 1A - Embedding generation

#### 3.1 Embedding service

Embedding is performed in batches with retries and exponential backoff (`2s/4s/8s`) to absorb API instability.

```ts
// src/lib/rag/embeddings.ts
for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
  try {
    const result = await embedMany({
      // Vercel AI SDK `embedMany()` usage
      model,
      values: batch.map(chunk => chunk.text),
    });
    // ... push embeddings
    break;
  } catch (error) {
    if (attempt < backoffMs.length)
      await sleep(backoffMs[attempt]); // exponential backoff: 2s, 4s, 8s
    else throw error;
  }
}
```

#### 3.3/3.4 Sync script

The `sync-rag-index` script generates prebuilt embeddings for blog and custom documents into `public/rag-index.json`.  
It is wired into `package.json` and can be integrated with `build` or CI without impacting runtime path.

```js
// scripts/sync-rag-index.mjs
const result = await embedMany({
  model,
  values: chunks.map(chunk => chunk.text),
});

await writeFile(outFile, JSON.stringify(embedded), "utf-8");
```

### Task 5. Phase 1B - Semantic search and context assembly

#### 5.1 Semantic search

After embedding a query, we perform vector search and then filter by similarity threshold.

```ts
// src/lib/rag/semantic-search.ts
const hits = await vectorStore.query(embedding, { topK: options.topK });
return hits.filter(hit => hit.score >= options.similarityThreshold);
```

#### 5.3 Context formatter

Results sharing the same URL are merged, and source markers are added as `(Source N)`.

```ts
// src/lib/rag/context-formatter.ts
const key = hit.chunk.metadata.url;
const entry = merged.get(key) ?? { title, url, texts: [] };
entry.texts.push(hit.chunk.text);
```

### Task 6. Phase 1C - `/api/search` integration

The main goal was to keep `RAG ON/OFF + fast fallback + UI contract` unchanged:

- internal implementation may switch
- response/marker format expected by `LLMSearchModal` remains stable

```ts
// src/pages/api/search.ts
try {
  if (isRAGEnabled()) {
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

### 6.5 Deep dive: `src/lib/rag/index.ts`

This file acts as the RAG control tower: read settings, prepare index and caches, run semantic search, and map results into prompt + sources.

#### A) Module state: `vectorStore`, `isIngested`

```ts
const vectorStore = new InMemoryVectorStore();
let isIngested = false;
```

- `vectorStore` stores vectors in runtime memory.
- `isIngested` guards duplicate ingestion in the same instance.

#### B) Prefer prebuilt index: `loadPrebuiltIndex()`

```ts
const indexUrl = new URL("/rag-index.json", originRequestUrl);
const res = await fetch(indexUrl).catch(() => null);
if (!res?.ok) return null;

const chunks = (await res.json()) as EmbeddedChunk[];
if (chunks.length === 0) return null;
return chunks;
```

We first try prebuilt index and only compute embeddings at runtime on failure.

#### C) Document-to-chunk conversion: `toDocumentChunks()`

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

MVP currently merges large units (`title + description + content`) first, with finer chunking planned for later tasks.

#### D) Ingestion gate: `ingestIfNeeded()`

1. If `isIngested` is true, return immediately.
2. Try prebuilt index.
3. If prebuilt exists, upsert and return.
4. Else fallback to runtime embedding.

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

This means normal execution should usually follow:
`prebuilt load -> query`.

#### E) Main function: `runRAGSearch()`

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

The flow is fixed to:

1. Ensure index readiness
2. Semantic retrieval
3. Prompt + source mapping

### Task 7. Checkpoint - End-to-End validation

As of MVP (Task 7), these flows are complete:

1. Generate prebuilt index with `sync-rag-index`
2. Runtime loads prebuilt index first (`src/lib/rag/index.ts`)
3. Enable RAG with `RAG_ENABLED=true` for semantic search + context prompt generation
4. Fallback to MiniSearch on failure
5. Keep streaming source rendering contract in UI

Load preference is explicit in code:

```ts
// src/lib/rag/index.ts
const prebuilt = await loadPrebuiltIndex(originRequestUrl);
if (prebuilt) {
  await vectorStore.upsert(prebuilt);
  isIngested = true;
  return;
}

const embedded = await embedChunks(chunks, { apiKey, model, batchSize });
await vectorStore.upsert(embedded);
```

That is the first operationally usable RAG.

## Work planned next

After Task 7, priorities are:

1. **Task 8: Formalize hybrid search**
   - Run keyword and semantic searches in parallel
   - Filter by threshold first, then merge with RRF
   - Tune weights (0.4 / 0.6)

2. **Task 9: Query cache and versioning**
   - key strategy `{query}:{indexVersion}`
   - TTL and invalidation improvement

3. **Task 11: Incremental indexing + manifest**
   - `{postId}:{contentHash}:{chunkIndex}`
   - Reindex only changed documents

4. **Task 12~13: Failed-chunk reprocessing and operations**
   - Retry pipelines and DLQ
   - Faster recovery

5. **Task 14~16: Production hardening**
   - Stable performance metrics (p50/p95), timeout budget
   - stronger property/integration testing
   - ops runbook and playbook updates

## Closing

MiniSearch + prompt injection was a practical starting point.  
But once you need accuracy, citation reliability, operability, and observability, its structural limits become clear quickly.

This requirement + design set is, in my view, an answer to:
_how to run a reliable search-generation system over time, not just how to switch models._

If you are considering a similar migration, I recommend writing down the design constraints from a failure perspective before selecting the architecture itself, and then carrying those constraints into tests and implementation.
