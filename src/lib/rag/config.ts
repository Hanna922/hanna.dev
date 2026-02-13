import type { RAGConfig } from "./types";

const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

function normalizeEmbeddingModel(value: string | undefined) {
  if (!value) return DEFAULT_EMBEDDING_MODEL;

  const normalized = value.trim();

  // Backward-compatible aliases that are not available on many Free Tier accounts.
  if (
    normalized === "text-embedding-001" ||
    normalized === "text-embedding-004"
  ) {
    return DEFAULT_EMBEDDING_MODEL;
  }

  return normalized;
}

function getNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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
