import { getRAGConfig } from "./config";
import {
  buildPromptWithContext,
  toSourceRefsFromSemanticHits,
} from "./context-formatter";
import { loadRAGDocuments } from "./document-loader";
import { embedChunks } from "./embeddings";
import { ragLogger } from "./logger";
import { semanticSearch } from "./semantic-search";
import type { EmbeddedChunk, RAGChunk } from "./types";
import { InMemoryVectorStore } from "./vector-store";

const vectorStore = new InMemoryVectorStore();
let isIngested = false;

export function isRAGEnabled() {
  return getRAGConfig().enabled;
}

async function loadPrebuiltIndex(originRequestUrl: string) {
  const indexUrl = new URL("/rag-index.json", originRequestUrl);
  const res = await fetch(indexUrl).catch(() => null);

  if (!res?.ok) return null;

  const chunks = (await res.json()) as EmbeddedChunk[];
  if (chunks.length === 0) return null;

  return chunks;
}

function toDocumentChunks(): Promise<RAGChunk[]> {
  return loadRAGDocuments().then(docs =>
    docs.map(doc => ({
      id: doc.id,
      docId: doc.id,
      text: `${doc.title}\n\n${doc.description}\n\n${doc.content}`,
      metadata: {
        title: doc.title,
        tags: doc.tags,
        url: doc.url,
      },
    }))
  );
}

async function ingestIfNeeded(apiKey: string, originRequestUrl: string) {
  if (isIngested) return;

  const prebuilt = await loadPrebuiltIndex(originRequestUrl);
  if (prebuilt) {
    await vectorStore.upsert(prebuilt);
    isIngested = true;
    ragLogger.info("RAG prebuilt index loaded", { chunks: prebuilt.length });
    return;
  }

  const config = getRAGConfig();
  const chunks = await toDocumentChunks();

  ragLogger.info("RAG ingestion started", {
    documents: chunks.length,
    chunks: chunks.length,
  });

  const embedded = await embedChunks(chunks, {
    apiKey,
    model: config.embeddingModel,
    batchSize: config.embeddingBatchSize,
  });

  await vectorStore.upsert(embedded);
  isIngested = true;

  ragLogger.info("RAG ingestion completed", {
    documents: chunks.length,
    chunks: chunks.length,
    embedded: embedded.length,
  });
}

export async function runRAGSearch(
  query: string,
  options: { apiKey: string; originRequestUrl: string }
) {
  const config = getRAGConfig();
  await ingestIfNeeded(options.apiKey, options.originRequestUrl);

  const hits = await semanticSearch(query, vectorStore, {
    apiKey: options.apiKey,
    model: config.embeddingModel,
    topK: config.topK,
    similarityThreshold: config.similarityThreshold,
  });

  return {
    hits,
    prompt: buildPromptWithContext(query, hits),
    sources: toSourceRefsFromSemanticHits(hits),
  };
}
