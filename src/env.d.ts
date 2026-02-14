/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_LLM_MOCK_MODE?: string;
  readonly GOOGLE_GENERATIVE_AI_API_KEY?: string;
  readonly RAG_ENABLED?: string;
  readonly RAG_EMBEDDING_MODEL?: string;
  readonly RAG_CHUNK_SIZE?: string;
  readonly RAG_CHUNK_OVERLAP?: string;
  readonly RAG_TOP_K?: string;
  readonly RAG_SIMILARITY_THRESHOLD?: string;
  readonly RAG_EMBEDDING_BATCH_SIZE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
