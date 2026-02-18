import MiniSearch from "minisearch";
import type { SearchDocument } from "./types";

const cachedIndexes = new Map<
  string,
  { mini: MiniSearch<SearchDocument>; docs: SearchDocument[] }
>();

export async function loadIndex(
  originRequestUrl: string,
  locale: "ko" | "en" = "ko"
) {
  const cached = cachedIndexes.get(locale);
  if (cached) return cached;

  const indexUrl = new URL("/search-index.json", originRequestUrl);
  indexUrl.searchParams.set("lang", locale);
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

  const result = { mini, docs };
  cachedIndexes.set(locale, result);

  return result;
}
