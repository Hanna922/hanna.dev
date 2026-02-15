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

  if (hits.length === 0) {
    return `QUERY: ${query}

SOURCES:
관련된 블로그 문서를 찾지 못했습니다.

INSTRUCTIONS:
- 블로그 콘텐츠에서 관련 정보를 찾지 못했음을 명확히 알리세요.
- 외부 지식이나 일반 상식으로 답변을 생성하지 마세요.
- "현재 블로그에서 해당 내용에 대한 정보를 찾을 수 없습니다"라고 안내하세요.

ANSWER:`;
  }

  return `QUERY: ${query}

SOURCES:
${sources}

INSTRUCTIONS:
- 오직 위 SOURCES에 포함된 정보만 사용하여 답변하세요.
- SOURCES에 없는 내용은 추측하거나 만들어내지 마세요.
- 답변 시 참고한 소스는 반드시 (출처 N) 형식으로 표기하세요.
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
