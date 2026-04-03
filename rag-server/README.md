# Local Runbook

This server owns document-level retrieval for `hanna.dev`.

## Prerequisites

- Java 17
- Docker Desktop
- `pnpm install` already run in the repo root
- A valid Gemini API key for embeddings

## Required Environment Variables

Set these in the shell before starting the stack:

```powershell
$env:GEMINI_API_KEY = "your-gemini-api-key"
$env:INTERNAL_QUERY_API_KEY = "local-query-key"
$env:INTERNAL_ADMIN_API_KEY = "local-admin-key"
$env:RAG_SERVER_URL = "http://localhost:8080"
$env:RAG_SERVER_QUERY_API_KEY = $env:INTERNAL_QUERY_API_KEY
$env:RAG_SERVER_ADMIN_API_KEY = $env:INTERNAL_ADMIN_API_KEY
```

Notes:

- `GEMINI_API_KEY` is required for sync and query requests.
- `INTERNAL_QUERY_API_KEY` and `INTERNAL_ADMIN_API_KEY` protect the Spring server.
- `RAG_SERVER_QUERY_API_KEY` is used by Astro when `/api/search` delegates retrieval.
- `RAG_SERVER_ADMIN_API_KEY` is used by `pnpm sync-rag-server`.

## Start Qdrant Only

From `rag-server/`:

```powershell
docker compose up -d qdrant
```

Then start Spring locally:

```powershell
./gradlew bootRun
```

Health check:

```powershell
Invoke-WebRequest http://localhost:8080/actuator/health | Select-Object -ExpandProperty Content
```

## Start Both Services In Docker

From `rag-server/`:

```powershell
docker compose up --build
```

The compose file reads `GEMINI_API_KEY`, `INTERNAL_QUERY_API_KEY`, and
`INTERNAL_ADMIN_API_KEY` from the current shell.

## Sync Documents

From the repo root:

```powershell
pnpm sync-rag-server
```

## Start Astro Against The RAG Server

From the repo root:

```powershell
pnpm dev
```

Astro will call `http://localhost:8080/v1/rag/query` when RAG is enabled.

## Common Failure Modes

- `Missing GOOGLE_GENERATIVE_AI_API_KEY` or `Missing GEMINI_API_KEY`
  The embedding key is not set for the current shell.
- `Missing RAG_SERVER_ADMIN_API_KEY or INTERNAL_ADMIN_API_KEY`
  The sync script does not have an admin key.
- `RAG server query failed (401 Unauthorized)`
  `RAG_SERVER_QUERY_API_KEY` does not match `INTERNAL_QUERY_API_KEY`.
- `Connection refused`
  Qdrant or the Spring server is not running on the expected port.
