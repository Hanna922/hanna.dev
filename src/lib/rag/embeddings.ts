import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";
import type { EmbeddedChunk, RAGChunk } from "./types";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function embedChunks(
  chunks: RAGChunk[],
  options: {
    apiKey: string;
    model: string;
    batchSize: number;
  }
): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) return [];

  const google = createGoogleGenerativeAI({ apiKey: options.apiKey });
  const model = google.textEmbeddingModel(
    options.model as "text-embedding-004"
  );

  const embedded: EmbeddedChunk[] = [];

  for (let i = 0; i < chunks.length; i += options.batchSize) {
    const batch = chunks.slice(i, i + options.batchSize);

    let lastError: unknown;
    const backoffMs = [2000, 4000, 8000];

    for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
      try {
        const result = await embedMany({
          model,
          values: batch.map(chunk => chunk.text),
        });

        for (const [index, vector] of result.embeddings.entries()) {
          embedded.push({ ...batch[index], embedding: vector });
        }

        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < backoffMs.length) {
          await sleep(backoffMs[attempt]);
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  return embedded;
}
