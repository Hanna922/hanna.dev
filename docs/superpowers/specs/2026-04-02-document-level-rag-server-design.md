# Document-Level RAG Server Design

**Status:** Approved in chat on 2026-04-02

## Goal

Move vector retrieval out of `hanna.dev` into a separate Spring Boot server backed by self-hosted Qdrant, while preserving the current document-level retrieval baseline that already performs well on the project's eval set.

## Problem Summary

The current blog search flow couples three concerns inside the Astro app:

- document loading and embedding
- vector retrieval
- Gemini answer generation and streaming

That coupling is acceptable for an in-process MVP, but it becomes limiting once a real vector database is introduced:

- Qdrant connection and collection lifecycle need a dedicated runtime owner
- indexing and deletion need admin endpoints instead of build-time JSON generation only
- retrieval should be observable and testable independently from the UI and LLM streaming layer

At the same time, the retrieval granularity must not regress. PR #19 established that, for this corpus and query distribution, document-level retrieval outperformed chunked retrieval. The current codebase reflects that decision:

- [index.ts](D:/hanna-dev/hanna.dev/src/lib/rag/index.ts#L37) builds one embedding per document at runtime
- [sync-rag-index.ts](D:/hanna-dev/hanna.dev/scripts/sync-rag-index.ts#L150) builds one precomputed vector per document
- [run-eval.ts](D:/hanna-dev/hanna.dev/scripts/run-eval.ts#L153) evaluates document-level retrieval only

## Constraints

- Preserve the current `hanna.dev` user experience:
  - Astro stays responsible for UI, locale handling, chat history, and Gemini response streaming.
- Preserve the current retrieval baseline:
  - `1 document = 1 vector`
  - `gemini-embedding-001`
- Avoid chunking in the MVP query path.
- Keep the implementation self-hostable with Docker.
- Keep Qdrant hidden behind the Spring Boot server in normal operation.
- Avoid duplicating Astro blog parsing logic inside Java.

## Decision

Use a separate Spring Boot orchestration server with self-hosted Qdrant, but keep document-level indexing.

This means:

- `hanna.dev` remains the user-facing application.
- Spring Boot owns retrieval, indexing, and vector database operations.
- Qdrant stores one point per canonical RAG document.
- `hanna.dev` continues to produce the canonical document list and pushes it into Spring Boot through an admin sync API.

## Recommended Approach

### 1. Keep Astro as the LLM-facing edge

`src/pages/api/search.ts` should keep the current high-level responsibility:

- receive user prompt and locale
- preserve history handling
- call Gemini and stream the final answer back to the browser

The only behavioral change is that retrieval no longer happens through `runRAGSearch()` inside Astro. Instead, Astro calls the Spring Boot query API and receives:

- grounded context text
- ranked sources
- retrieval metadata

### 2. Introduce a dedicated Spring Boot retrieval server

The new server should own:

- query embedding generation
- Qdrant collection initialization
- document upsert/delete/full sync
- locale-aware search and fallback
- context assembly for the downstream Gemini prompt
- health and stats endpoints

This keeps the vector database and retrieval rules in one process instead of splitting them between Astro build scripts and runtime logic.

### 3. Keep indexing document-level

The retrieval unit should remain the canonical document:

- blog post locale variant
- custom resume/about/summary document

Chunking should stay out of the MVP path. The repository already contains direct evidence that chunking was worse for the prior corpus, and current evaluation still shows document-level retrieval holding a strong baseline.

If chunking is explored later, it should be isolated behind a second collection or experimental path, not introduced into the primary collection prematurely.

## Service Boundaries

### `hanna.dev` (Astro)

- owns blog and custom-document parsing
- owns AI answer generation and response streaming
- owns browser-facing `/api/search`
- owns sync trigger scripts that export canonical RAG documents

### `hanna-rag-server` (Spring Boot)

- owns retrieval APIs
- owns sync/admin APIs
- owns Qdrant lifecycle and collection bootstrap
- owns locale-aware retrieval filtering and source ranking
- owns context assembly

### `Qdrant`

- stores vectors and searchable payload
- executes similarity search and metadata filtering

## Data Model

Collection name:

- `hanna-dev-documents`

Vector model:

- `gemini-embedding-001`

Vector size:

- `3072`

Distance:

- `Cosine`

Each Qdrant point represents one canonical document.

### Point payload

- `docId`
- `baseSlug`
- `locale`
- `title`
- `titleEn`
- `description`
- `url`
- `tags`
- `sourceType`
- `publishedAt`
- `contentHash`
- `fullText`

### Payload indexing

Create payload indexes at bootstrap time for:

- `docId`
- `baseSlug`
- `locale`
- `sourceType`
- `publishedAt`

`tags` indexing can be deferred unless tag filtering becomes a real query feature.

## Canonical Document Shape

Astro should export a canonical JSON document list that the Spring server treats as the source of truth.

Each document should include:

- `docId`
- `baseSlug`
- `locale`
- `title`
- `titleEn`
- `description`
- `url`
- `tags`
- `sourceType`
- `publishedAt`
- `fullText`

`fullText` should match the retrieval text baseline used today:

- optional published date prefix
- title
- description
- body/content

## API Design

### Query API

`POST /v1/rag/query`

Request:

```json
{
  "query": "대표 프로젝트 경험을 몇 가지 소개해주세요",
  "locale": "ko",
  "topK": 5
}
```

Response:

```json
{
  "context": "[Source 1]\nTitle: 프로젝트 타임라인\nURL: ...\nContent: ...",
  "sources": [
    {
      "docId": "project-timeline",
      "title": "프로젝트 타임라인",
      "url": "https://www.hanna-dev.co.kr/resume.pdf",
      "score": 0.6954,
      "locale": "ko",
      "sourceType": "custom"
    }
  ],
  "retrieval": {
    "topK": 5,
    "returned": 5,
    "tookMs": 12
  }
}
```

### Admin APIs

- `POST /internal/admin/index/full-sync`
- `DELETE /internal/admin/index/{docId}`
- `GET /internal/admin/index/stats`
- `GET /actuator/health`

`full-sync` should accept the full canonical document list and support `replaceMissing=true` so the server can delete stale points that are no longer present in Astro's source of truth.

## Query Flow

1. Astro receives the browser request at `/api/search`.
2. Astro sends `query`, `locale`, and `topK` to Spring Boot.
3. Spring Boot embeds the query with `gemini-embedding-001`.
4. Spring Boot searches Qdrant using locale-aware filters.
5. Spring Boot assembles ranked source blocks into a prompt-ready context string.
6. Astro calls Gemini with the returned context and streams the answer.

## Locale Rules

Locale handling should stay aligned with the current Astro behavior.

Rules:

- blog posts are locale-specific (`ko` or `en`)
- resume/custom summary documents may be `neutral`
- first pass searches `requested locale + neutral`
- second pass can fall back to the opposite locale when results are insufficient
- if both locale variants of the same base post appear, prefer the requested locale

## Sync Strategy

Use full-sync with content hashing rather than per-file event choreography.

Flow:

1. Astro exports the full canonical document list.
2. Spring Boot calculates a deterministic `contentHash` per document.
3. Spring Boot compares incoming documents against Qdrant payload state.
4. Documents with changed hashes are re-embedded and upserted.
5. Missing documents are deleted when `replaceMissing=true`.

This avoids adding a relational database for MVP bookkeeping.

## Context Assembly

The Spring server should return a prompt-ready `context` string instead of raw payload only.

Recommended limits:

- per document excerpt cap: about `2500` characters
- total assembled context cap: about `12000` characters

The formatter should preserve:

- source numbering
- title
- URL
- compact excerpt text

Do not add query-aware snippet extraction or reranking in the MVP.

## Deployment Shape

Recommended local stack:

- `qdrant`
- `hanna-rag-server`

Qdrant should run in Docker with a persistent volume. Spring Boot connects to Qdrant over the internal Docker network. In production, Qdrant should not be publicly exposed.

## Security

Use shared-secret API keys for MVP:

- one key for Astro -> Spring query requests
- one key for admin/sync requests

Do not expose Qdrant directly to the internet.

## Verification

Primary verification goals:

- document-level retrieval quality should not regress below the current eval baseline
- full sync should produce correct insert/update/delete counts
- Astro search should still stream answers successfully after delegating retrieval

Recommended checks:

- Spring unit tests for hashing, locale resolution, and context assembly
- Spring integration test for `full-sync -> query`
- local Qdrant smoke test through Docker Compose
- `pnpm eval` in `hanna.dev` before and after Astro integration changes

## Non-Goals

- chunked retrieval in the production path
- reranking
- hybrid search
- background workers
- separate operational database
- automatic webhook-driven sync
- moving Gemini answer generation out of Astro

## Risks

- The current eval set contains expectations from an older corpus; new summary-style custom documents can legitimately change which document is the best match.
- Embedding parity matters: changing away from `gemini-embedding-001` during the same migration would make regressions harder to diagnose.
- If Astro and Spring build `fullText` differently, retrieval quality can drift even with the same source content.

## Success Criteria

- `hanna.dev` continues to answer with grounded sources while delegating retrieval to Spring Boot.
- Qdrant stores one point per canonical document.
- Index sync is owned by Spring Boot instead of prebuilt JSON files only.
- The document-level eval baseline remains intact.
- Chunking stays out of the primary retrieval architecture unless a future experiment demonstrates a clear improvement.
