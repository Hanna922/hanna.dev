import { cosineSimilarity } from "ai";
import type { EmbeddedChunk, SemanticHit } from "./types";

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

  async upsert(chunks: EmbeddedChunk[]) {
    for (const chunk of chunks) {
      this.store.set(chunk.id, chunk);
    }
  }

  async query(queryEmbedding: number[], options: { topK: number }) {
    return Array.from(this.store.values())
      .map(chunk => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
  }

  size() {
    return this.store.size;
  }
}
