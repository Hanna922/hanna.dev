import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed } from "ai";
import type { SemanticHit } from "./types";
import type { VectorStore } from "./vector-store";

export async function semanticSearch(
  query: string,
  vectorStore: VectorStore,
  options: {
    apiKey: string;
    model: string;
    topK: number;
    similarityThreshold: number;
  }
): Promise<SemanticHit[]> {
  if (!query.trim() || vectorStore.size() === 0) return [];

  const google = createGoogleGenerativeAI({ apiKey: options.apiKey });
  const { embedding } = await embed({
    model: google.textEmbeddingModel(options.model as "text-embedding-004"),
    value: query,
  });

  const hits = await vectorStore.query(embedding, { topK: options.topK });

  return hits.filter(hit => hit.score >= options.similarityThreshold);
}
