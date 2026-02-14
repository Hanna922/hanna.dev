export interface RAGConfig {
  enabled: boolean;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  similarityThreshold: number;
  embeddingBatchSize: number;
}

export interface RAGDocument {
  id: string;
  title: string;
  description: string;
  tags: string[];
  url: string;
  content: string;
  source?: "blog" | "custom";
}

export interface RAGChunk {
  id: string;
  docId: string;
  text: string;
  metadata: {
    title: string;
    tags: string[];
    url: string;
  };
}

export interface EmbeddedChunk extends RAGChunk {
  embedding: number[];
}

export interface SemanticHit {
  chunk: EmbeddedChunk;
  score: number;
}
