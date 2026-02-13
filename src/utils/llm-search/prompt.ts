import type MiniSearch from "minisearch";
import type { SearchDocument, SourceRef } from "./types";

type SearchHit = ReturnType<MiniSearch<SearchDocument>["search"]>[number];

export function toSourceRefs(hits: SearchHit[]): SourceRef[] {
  return hits.slice(0, 5).map(hit => ({
    title: String(hit.title ?? "Untitled"),
    slug: String(hit.path ?? "/"),
  }));
}

export function buildSourcesForPrompt(hits: SearchHit[]) {
  return hits
    .map((hit, index) => {
      const n = index + 1;
      return `[${n}] ${String(hit.title ?? "Untitled")}\nURL: ${String(hit.path ?? "/")}\n요약: ${String(hit.excerpt ?? "")}`;
    })
    .join("\n\n");
}

export function buildLLMPrompt(query: string, hits: SearchHit[]) {
  const sources = buildSourcesForPrompt(hits);

  return `QUERY: ${query}

SOURCES:
${sources}

INSTRUCTIONS:
- 답변 시 참고한 소스는 반드시 (출처 N) 형식으로 표기하세요. 예: (출처 1)
- 인용 텍스트를 포함하지 마세요.
- 마크다운 형식으로 답변하세요.

ANSWER:`;
}

export function searchDocs(
  query: string,
  mini: MiniSearch<SearchDocument>
): SearchHit[] {
  return mini.search(query);
}
