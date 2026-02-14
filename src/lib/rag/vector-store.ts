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

/*
  Vector Store는 Map 기반 InMemory이므로 프로세스 생명주기 동안 유지됩니다.
  여기서 얘기하는 '프로세스 생명주기'는 브라우저 탭 수명이 아닌,
  /api/search를 실행하는 서버 런타임 인스턴스(서버리스 함수 프로세스) 수명을 뜻합니다.
*/
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
