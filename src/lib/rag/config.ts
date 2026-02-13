import type { RAGConfig } from "./types";

function getNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getRAGConfig(): RAGConfig {
  return {
    enabled: import.meta.env.RAG_ENABLED === "true",
    embeddingModel: import.meta.env.RAG_EMBEDDING_MODEL ?? "text-embedding-004",
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
