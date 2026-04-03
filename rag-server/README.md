# Local Runbook

This server owns document-level retrieval for `hanna.dev`.

## Prerequisites

- Java 17
- Docker Desktop
- `pnpm install` already run in the repo root
- A valid Gemini API key for embeddings

## Local Env File

Use the repo root `.env` file. It is shared by Astro, the sync scripts, and `rag-server`.

1. Copy `../.env.example` to `../.env`
2. Fill `GOOGLE_GENERATIVE_AI_API_KEY`
3. Adjust ports or API keys only if you need to

```powershell
Copy-Item ..\.env.example ..\.env
```

Important variables:

- `GOOGLE_GENERATIVE_AI_API_KEY` is required for Astro answer generation and Spring embeddings.
- `INTERNAL_QUERY_API_KEY` and `INTERNAL_ADMIN_API_KEY` protect the Spring server.
- `RAG_SERVER_QUERY_API_KEY` is optional. If blank, Astro falls back to `INTERNAL_QUERY_API_KEY`.
- `RAG_SERVER_ADMIN_API_KEY` is optional. If blank, `pnpm sync-rag-server` falls back to `INTERNAL_ADMIN_API_KEY`.

## Start Qdrant Only

From `rag-server/`:

```powershell
docker compose up -d qdrant
```

Then start Spring locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\dev-local.ps1
```

Validate `.env` parsing without starting Spring:

```powershell
powershell -ExecutionPolicy Bypass -File .\dev-local.ps1 -ValidateOnly
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

The compose file reads values from the repo root `.env` via `env_file`.

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
  `GOOGLE_GENERATIVE_AI_API_KEY` is blank in the repo root `.env`.
- `Missing RAG_SERVER_ADMIN_API_KEY or INTERNAL_ADMIN_API_KEY`
  The repo root `.env` file is missing the admin key.
- `RAG server query failed (401 Unauthorized)`
  `RAG_SERVER_QUERY_API_KEY` does not match `INTERNAL_QUERY_API_KEY`.
- `Connection refused`
  Qdrant or the Spring server is not running on the expected local port.
