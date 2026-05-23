# Document-Level RAG Server MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate Spring Boot retrieval server backed by self-hosted Qdrant, keep document-level indexing, and connect Astro `hanna.dev` to it without regressing the current eval baseline.

**Architecture:** Create a sibling project `hanna-rag-server` that owns embeddings, Qdrant collection management, sync APIs, and retrieval/context assembly. Keep `hanna.dev` responsible for canonical document export plus Gemini answer streaming. Use full-sync with content hashes so Astro stays the single source of truth for RAG documents while Spring Boot becomes the runtime owner of retrieval infrastructure.

**Tech Stack:** Spring Boot 3.x, Java 21, Gradle, Qdrant, Docker Compose, Gemini Embeddings API (`gemini-embedding-001`), Astro 5, TypeScript, `pnpm eval`, `./gradlew test`

---

## File Map

- Create: `../hanna-rag-server/settings.gradle`
- Create: `../hanna-rag-server/build.gradle`
- Create: `../hanna-rag-server/compose.yaml`
- Create: `../hanna-rag-server/src/main/resources/application.yml`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/RagServerApplication.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/config/RagProperties.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/config/QdrantProperties.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/config/SecurityProperties.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/security/InternalApiKeyFilter.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/RagQueryController.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/RagAdminController.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/dto/RagQueryRequest.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/dto/RagQueryResponse.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/dto/FullSyncRequest.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/dto/FullSyncResponse.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/dto/RagDocumentDto.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/embedding/EmbeddingService.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/embedding/GeminiEmbeddingClient.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/qdrant/QdrantCollectionInitializer.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/qdrant/QdrantDocumentRepository.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/qdrant/QdrantPayloadMapper.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/qdrant/QdrantFilterFactory.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/service/RagQueryService.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/service/RagIndexSyncService.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/service/ContextAssembler.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/service/LocaleResolver.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/service/ContentHashService.java`
- Create: `../hanna-rag-server/src/test/java/com/hannadev/rag/service/ContentHashServiceTest.java`
- Create: `../hanna-rag-server/src/test/java/com/hannadev/rag/service/LocaleResolverTest.java`
- Create: `../hanna-rag-server/src/test/java/com/hannadev/rag/service/ContextAssemblerTest.java`
- Create: `../hanna-rag-server/src/test/java/com/hannadev/rag/integration/RagIndexSyncIntegrationTest.java`
- Modify: `scripts/sync-rag-index.ts`
- Create: `scripts/sync-rag-server.ts`
- Modify: `package.json`
- Modify: `src/pages/api/search.ts`
- Create: `src/lib/rag/server-client.ts`
- Create: `src/lib/rag/canonical-documents.ts`
- Optional cleanup after cutover: `src/lib/rag/index.ts`

## Phase Notes

- Keep document-level indexing throughout the MVP.
- Do not introduce chunking, reranking, or a model swap in the same rollout.
- The current `hanna.dev` worktree is dirty in unrelated files, so implementation work should avoid touching them unless the feature requires it.

---

### Task 1: Scaffold The Spring Boot Retrieval Server

**Files:**
- Create: `../hanna-rag-server/settings.gradle`
- Create: `../hanna-rag-server/build.gradle`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/RagServerApplication.java`
- Create: `../hanna-rag-server/src/main/resources/application.yml`

- [ ] **Step 1: Create the sibling project skeleton**

Create:

- Gradle project using Java 21
- Spring Boot web starter
- actuator
- validation
- test starter
- Qdrant Java client dependency
- HTTP client dependency for Gemini embeddings

- [ ] **Step 2: Add base application configuration**

Set defaults for:

- `server.port=8080`
- `rag.embedding.model=gemini-embedding-001`
- `rag.embedding.dimension=3072`
- `rag.top-k=5`
- `rag.context-max-chars=12000`
- `qdrant.collection=hanna-dev-documents`

- [ ] **Step 3: Start the app once to verify wiring**

Run: `./gradlew bootRun`
Expected: Spring starts and exposes `/actuator/health`

- [ ] **Step 4: Commit**

```bash
git add ../hanna-rag-server
git commit -m "feat: scaffold rag server"
```

---

### Task 2: Add Docker Compose And Qdrant Bootstrap

**Files:**
- Create: `../hanna-rag-server/compose.yaml`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/config/QdrantProperties.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/qdrant/QdrantCollectionInitializer.java`

- [ ] **Step 1: Add local Docker Compose for Qdrant and the server**

Include:

- `qdrant` service with persistent volume
- `rag-server` service
- environment variables for host, ports, API keys, collection, and embedding model

- [ ] **Step 2: Implement collection bootstrap**

On app startup:

- connect to Qdrant
- create collection `hanna-dev-documents` when missing
- configure cosine distance and size `3072`
- create payload indexes for `docId`, `baseSlug`, `locale`, `sourceType`, and `publishedAt`

- [ ] **Step 3: Smoke-test the stack**

Run: `docker compose up -d qdrant`
Run: `./gradlew bootRun`
Expected: app starts without collection errors and `/actuator/health` returns `UP`

- [ ] **Step 4: Commit**

```bash
git add ../hanna-rag-server/compose.yaml ../hanna-rag-server/src/main/java/com/hannadev/rag/config/QdrantProperties.java ../hanna-rag-server/src/main/java/com/hannadev/rag/qdrant/QdrantCollectionInitializer.java
git commit -m "feat: bootstrap qdrant collection"
```

---

### Task 3: Implement Security And API DTO Contracts

**Files:**
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/config/SecurityProperties.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/security/InternalApiKeyFilter.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/dto/RagQueryRequest.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/dto/RagQueryResponse.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/dto/FullSyncRequest.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/dto/FullSyncResponse.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/dto/RagDocumentDto.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/RagQueryController.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/RagAdminController.java`

- [ ] **Step 1: Define request and response DTOs exactly once**

Query request fields:

- `query`
- `locale`
- `topK`

Sync request fields:

- `syncId`
- `replaceMissing`
- `documents`

Document DTO fields:

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

- [ ] **Step 2: Add API-key protection**

Require:

- query key for `/v1/rag/**`
- admin key for `/internal/admin/**`

Keep `/actuator/health` open.

- [ ] **Step 3: Add controller stubs**

Return placeholder JSON or `501` until services exist, but lock the HTTP contracts now.

- [ ] **Step 4: Verify controller boot**

Run: `./gradlew test`
Expected: tests pass or controller context loads successfully if tests are still minimal

- [ ] **Step 5: Commit**

```bash
git add ../hanna-rag-server/src/main/java/com/hannadev/rag/config/SecurityProperties.java ../hanna-rag-server/src/main/java/com/hannadev/rag/security/InternalApiKeyFilter.java ../hanna-rag-server/src/main/java/com/hannadev/rag/api
git commit -m "feat: add rag api contracts"
```

---

### Task 4: Implement Embedding And Qdrant Repository Layers

**Files:**
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/config/RagProperties.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/embedding/EmbeddingService.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/embedding/GeminiEmbeddingClient.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/qdrant/QdrantDocumentRepository.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/qdrant/QdrantPayloadMapper.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/qdrant/QdrantFilterFactory.java`

- [ ] **Step 1: Implement query/document embedding against Gemini**

Keep:

- model fixed to `gemini-embedding-001`
- dimension fixed to `3072`
- one service method for a single query
- one service method for document batches

- [ ] **Step 2: Implement Qdrant point mapping**

Point ID strategy:

- deterministic hash or UUID derived from `docId`

Payload must include:

- all canonical document fields
- `contentHash`

- [ ] **Step 3: Implement repository operations**

Support:

- `upsertDocuments(...)`
- `deleteByDocIds(...)`
- `findAllDocIdsAndHashes()`
- `search(queryVector, locale, topK)`
- `getStats()`

- [ ] **Step 4: Run the Spring test suite**

Run: `./gradlew test`
Expected: compile passes and repository unit tests pass if already added

- [ ] **Step 5: Commit**

```bash
git add ../hanna-rag-server/src/main/java/com/hannadev/rag/config/RagProperties.java ../hanna-rag-server/src/main/java/com/hannadev/rag/embedding ../hanna-rag-server/src/main/java/com/hannadev/rag/qdrant
git commit -m "feat: add embeddings and qdrant repository"
```

---

### Task 5: Implement Sync Services And Tests

**Files:**
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/service/ContentHashService.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/service/RagIndexSyncService.java`
- Create: `../hanna-rag-server/src/test/java/com/hannadev/rag/service/ContentHashServiceTest.java`
- Create: `../hanna-rag-server/src/test/java/com/hannadev/rag/integration/RagIndexSyncIntegrationTest.java`
- Modify: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/RagAdminController.java`

- [ ] **Step 1: Write the hashing unit test first**

Verify:

- same canonical document -> same hash
- content change -> new hash
- metadata-only fields used by retrieval affect the hash when intended

- [ ] **Step 2: Implement `ContentHashService`**

Hash input should include:

- `docId`
- `locale`
- `title`
- `titleEn`
- `description`
- `url`
- `tags`
- `sourceType`
- `publishedAt`
- `fullText`

- [ ] **Step 3: Implement full-sync**

Flow:

- read existing Qdrant hashes
- partition incoming docs into insert/update/skip
- embed only changed docs
- delete missing docs when `replaceMissing=true`
- return counts

- [ ] **Step 4: Add an integration test**

Use Testcontainers or a local Qdrant test fixture to verify:

- first sync inserts all docs
- second identical sync skips all docs
- changed doc triggers one update
- removed doc deletes one point

- [ ] **Step 5: Run tests**

Run: `./gradlew test`
Expected: all sync tests pass

- [ ] **Step 6: Commit**

```bash
git add ../hanna-rag-server/src/main/java/com/hannadev/rag/service/ContentHashService.java ../hanna-rag-server/src/main/java/com/hannadev/rag/service/RagIndexSyncService.java ../hanna-rag-server/src/main/java/com/hannadev/rag/api/RagAdminController.java ../hanna-rag-server/src/test/java/com/hannadev/rag/service/ContentHashServiceTest.java ../hanna-rag-server/src/test/java/com/hannadev/rag/integration/RagIndexSyncIntegrationTest.java
git commit -m "feat: add full sync indexing flow"
```

---

### Task 6: Implement Query, Locale Fallback, And Context Assembly

**Files:**
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/service/LocaleResolver.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/service/ContextAssembler.java`
- Create: `../hanna-rag-server/src/main/java/com/hannadev/rag/service/RagQueryService.java`
- Create: `../hanna-rag-server/src/test/java/com/hannadev/rag/service/LocaleResolverTest.java`
- Create: `../hanna-rag-server/src/test/java/com/hannadev/rag/service/ContextAssemblerTest.java`
- Modify: `../hanna-rag-server/src/main/java/com/hannadev/rag/api/RagQueryController.java`

- [ ] **Step 1: Write locale and context tests first**

Verify:

- requested locale prefers same-locale hits
- neutral custom docs remain eligible
- opposite locale can be used as fallback
- same `baseSlug` does not surface duplicate locale variants when one preferred version exists
- context output respects per-source and total character caps

- [ ] **Step 2: Implement `LocaleResolver`**

Rules:

- `ko` request -> search `ko + neutral`, then fallback `en`
- `en` request -> search `en + neutral`, then fallback `ko`
- collapse duplicate `baseSlug` results in favor of requested locale

- [ ] **Step 3: Implement `ContextAssembler`**

Output source blocks containing:

- source number
- title
- URL
- compact excerpt text
- optional score only in metadata response, not inside the prompt block

- [ ] **Step 4: Implement `RagQueryService`**

Flow:

- embed query
- search primary locale set
- fallback if needed
- assemble `context`, `sources`, and retrieval metadata

- [ ] **Step 5: Run tests**

Run: `./gradlew test`
Expected: query-related tests pass

- [ ] **Step 6: Commit**

```bash
git add ../hanna-rag-server/src/main/java/com/hannadev/rag/service/LocaleResolver.java ../hanna-rag-server/src/main/java/com/hannadev/rag/service/ContextAssembler.java ../hanna-rag-server/src/main/java/com/hannadev/rag/service/RagQueryService.java ../hanna-rag-server/src/main/java/com/hannadev/rag/api/RagQueryController.java ../hanna-rag-server/src/test/java/com/hannadev/rag/service/LocaleResolverTest.java ../hanna-rag-server/src/test/java/com/hannadev/rag/service/ContextAssemblerTest.java
git commit -m "feat: add rag query orchestration"
```

---

### Task 7: Export Canonical Documents From Astro And Add Sync Script

**Files:**
- Create: `src/lib/rag/canonical-documents.ts`
- Create: `scripts/sync-rag-server.ts`
- Modify: `package.json`
- Optional reuse reference: `scripts/sync-rag-index.ts`

- [ ] **Step 1: Extract canonical Astro-side document export**

Create a shared helper that loads blog docs and custom docs and returns canonical documents containing:

- slug-derived `docId`
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

- [ ] **Step 2: Add the Spring sync script**

The script should:

- read canonical documents
- call `POST /internal/admin/index/full-sync`
- pass the admin API key
- print insert/update/delete/skip counts

- [ ] **Step 3: Add npm script entries**

Add:

- `sync-rag-server`

Keep the old `sync-rag-index` script until cutover is complete.

- [ ] **Step 4: Dry-run the sync**

Run: `pnpm sync-rag-server`
Expected: Spring responds with sync counts and no schema errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/canonical-documents.ts scripts/sync-rag-server.ts package.json
git commit -m "feat: add rag server sync script"
```

---

### Task 8: Rewire Astro Search To Use The Spring Query API

**Files:**
- Create: `src/lib/rag/server-client.ts`
- Modify: `src/pages/api/search.ts`
- Optional later cleanup: `src/lib/rag/index.ts`

- [ ] **Step 1: Add a typed Spring query client**

The client should:

- send `query`, `locale`, `topK`
- include the internal query API key
- return `context`, `sources`, and retrieval metadata
- throw a clear error on non-200 responses

- [ ] **Step 2: Update `/api/search` to delegate retrieval**

Replace the `runRAGSearch()` path with:

- Spring query request first
- MiniSearch fallback only if Spring retrieval fails
- preserve existing Gemini answer streaming behavior

- [ ] **Step 3: Keep client-visible source formatting stable**

Ensure the merged stream still exposes the same source shape expected by the existing frontend code.

- [ ] **Step 4: Run Astro checks**

Run: `pnpm lint`
Run: `pnpm test:locale`
Expected: both commands succeed

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/server-client.ts src/pages/api/search.ts
git commit -m "feat: delegate rag retrieval to spring server"
```

---

### Task 9: End-To-End Verification And Baseline Check

**Files:**
- Review: `../hanna-rag-server/**`
- Review: `src/pages/api/search.ts`
- Review: `src/lib/rag/server-client.ts`
- Review: `src/lib/rag/canonical-documents.ts`
- Review: `scripts/sync-rag-server.ts`

- [ ] **Step 1: Start the full local stack**

Run: `docker compose up -d`
Run: `pnpm sync-rag-server`
Expected: Qdrant and Spring are healthy, sync succeeds

- [ ] **Step 2: Run Spring tests**

Run: `./gradlew test`
Expected: all tests pass

- [ ] **Step 3: Run Astro verification**

Run: `pnpm lint`
Run: `pnpm test:locale`
Run: `pnpm eval`
Expected:

- lint passes
- locale test passes
- eval remains at or near the current document-level baseline

- [ ] **Step 4: Manually test broad queries**

From the UI or direct API call, verify:

- `대표 프로젝트 경험을 몇 가지 소개해주세요`
- `What technical challenges were overcome across different projects?`
- `블로그에서 다루고 있는 기술 스택은 어떤 것들이 있나요?`

Confirm results are sensible for the current corpus, even if exact expected doc IDs differ from the older eval set.

- [ ] **Step 5: Review final diff and cutover notes**

Confirm:

- Astro no longer depends on in-process vector retrieval for the main path
- Spring owns sync and retrieval
- Qdrant stores document-level vectors only
- chunking was not reintroduced accidentally

- [ ] **Step 6: Commit**

```bash
git add ../hanna-rag-server src/pages/api/search.ts src/lib/rag/server-client.ts src/lib/rag/canonical-documents.ts scripts/sync-rag-server.ts package.json
git commit -m "feat: connect hanna.dev to document-level rag server"
```
