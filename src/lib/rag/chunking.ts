import type { RAGChunk, RAGDocument } from "./types";

function chunkBySize(
  text: string,
  chunkSize: number,
  chunkOverlap: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  const step = Math.max(1, Math.floor(chunkSize - chunkOverlap));

  for (let i = 0; i < words.length; i += step) {
    const slice = words
      .slice(i, i + chunkSize)
      .join(" ")
      .trim();
    if (slice) chunks.push(slice);
    if (i + chunkSize >= words.length) break;
  }

  return chunks;
}

function splitByHeading(markdown: string): string[] {
  const sections = markdown.split(/\n(?=#{1,6}\s)/g);
  return sections.map(section => section.trim()).filter(Boolean);
}

export function chunkDocuments(
  docs: RAGDocument[],
  options: { chunkSize: number; chunkOverlap: number }
): RAGChunk[] {
  const chunks: RAGChunk[] = [];

  for (const doc of docs) {
    const sections = splitByHeading(doc.content);
    const pieces = sections.length > 0 ? sections : [doc.content];

    let chunkIndex = 0;

    for (const piece of pieces) {
      const textChunks = chunkBySize(
        piece,
        options.chunkSize,
        options.chunkOverlap
      );

      for (const text of textChunks) {
        chunks.push({
          id: `${doc.id}:${chunkIndex}`,
          docId: doc.id,
          text,
          metadata: {
            title: doc.title,
            tags: doc.tags,
            url: doc.url,
          },
        });
        chunkIndex += 1;
      }
    }
  }

  return chunks;
}
