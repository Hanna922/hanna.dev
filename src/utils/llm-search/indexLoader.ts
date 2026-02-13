import MiniSearch from "minisearch";
import type { SearchDocument } from "./types";

let cachedMini: MiniSearch<SearchDocument> | null = null;
let cachedDocs: SearchDocument[] | null = null;

export async function loadIndex(originRequestUrl: string) {
  if (cachedMini && cachedDocs) return { mini: cachedMini, docs: cachedDocs };

  const indexUrl = new URL("/search-index.json", originRequestUrl);
  const res = await fetch(indexUrl);

  if (!res.ok) throw new Error(`Failed to load index: ${res.status}`);

  const docs = (await res.json()) as SearchDocument[];
  const mini = new MiniSearch<SearchDocument>({
    fields: ["title", "description", "content", "tags"],
    storeFields: ["title", "description", "path", "excerpt", "tags"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { title: 4, tags: 2, description: 1.5 },
    },
  });
  mini.addAll(docs);

  cachedMini = mini;
  cachedDocs = docs;

  return { mini, docs };
}
