import type MiniSearch from "minisearch";
import type { SearchDocument, SourceRef } from "./types";

type SearchHit = ReturnType<MiniSearch<SearchDocument>["search"]>[number];

export function toSourceRefs(hits: SearchHit[]): SourceRef[] {
  return hits.slice(0, 5).map(hit => ({
    title: String(hit.title ?? "Untitled"),
    slug: String(hit.path ?? "/"),
  }));
}

export function buildSourcesForPrompt(
  hits: SearchHit[],
  locale: "ko" | "en" = "ko"
) {
  const summaryLabel = locale === "en" ? "Summary" : "요약";

  return hits
    .map((hit, index) => {
      const n = index + 1;
      return `[${n}] ${String(hit.title ?? "Untitled")}\nURL: ${String(
        hit.path ?? "/"
      )}\n${summaryLabel}: ${String(hit.excerpt ?? "")}`;
    })
    .join("\n\n");
}

export function buildLLMPrompt(
  query: string,
  hits: SearchHit[],
  locale: "ko" | "en" = "ko"
) {
  const sources = buildSourcesForPrompt(hits, locale);

  if (hits.length === 0) {
    if (locale === "en") {
      return `QUERY: ${query}

SOURCES:
No relevant sources found.

INSTRUCTIONS:
- Never invent content outside SOURCES.
- If the result is empty, reply with "No relevant information found on the blog."
- For unsupported topics, state clearly the data is not available.

ANSWER:`;
    }

    return `QUERY: ${query}

SOURCES:
관련된 소스를 찾지 못했습니다.

INSTRUCTIONS:
- SOURCES 외부의 내용을 만들어내지 마세요.
- 결과가 없으면 "블로그에서 관련 정보를 찾을 수 없습니다"라고 답변하세요.
- 지원하지 않는 주제는 데이터가 없음을 명확히 알리세요.

ANSWER:`;
  }

  if (locale === "en") {
    return `QUERY: ${query}

SOURCES:
${sources}

INSTRUCTIONS:
- Only use facts that appear in SOURCES.
- Cite every referenced fact with (Source N) format.
- If multiple source items are relevant, cite all relevant indices.
- Keep responses concise and focused for software engineers.
- If unsure, ask a clarifying question instead of guessing.

ANSWER:`;
  }

  return `QUERY: ${query}

SOURCES:
${sources}

INSTRUCTIONS:
- 오직 SOURCES에 나타난 사실만 사용하세요.
- 참조한 모든 사실을 (출처 N) 형식으로 인용하세요.
- 여러 소스 항목이 관련된 경우 모든 관련 인덱스를 인용하세요.
- 소프트웨어 엔지니어를 위해 간결하고 집중된 답변을 유지하세요.
- 확실하지 않으면 추측하지 말고 명확한 질문을 하세요.

ANSWER:`;
}

export function searchDocs(
  query: string,
  mini: MiniSearch<SearchDocument>
): SearchHit[] {
  return mini.search(query);
}
