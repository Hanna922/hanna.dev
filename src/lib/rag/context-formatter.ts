import type { SourceRef } from "@utils/llm-search/types";
import type { SemanticHit } from "./types";

interface MergedContext {
  title: string;
  titleEn?: string;
  url: string;
  texts: string[];
}

export function buildContextFromHits(hits: SemanticHit[]) {
  const merged = new Map<string, MergedContext>();

  for (const hit of hits) {
    const key = hit.chunk.metadata.url;
    const entry = merged.get(key) ?? {
      title: hit.chunk.metadata.title,
      titleEn: hit.chunk.metadata.titleEn,
      url: hit.chunk.metadata.url,
      texts: [],
    };

    entry.texts.push(hit.chunk.text);
    merged.set(key, entry);
  }

  return Array.from(merged.values()).map((entry, index) => ({
    index: index + 1,
    title: entry.title,
    titleEn: entry.titleEn,
    url: entry.url,
    text: entry.texts.join("\n\n"),
  }));
}

export function buildPromptWithContext(
  query: string,
  hits: SemanticHit[],
  locale: "ko" | "en" = "ko"
) {
  const context = buildContextFromHits(hits);

  // 컨텍스트가 없을 때 — 외부 지식 사용 차단
  if (context.length === 0) {
    if (locale === "en") {
      return `QUERY: ${query}

CONTEXT:
No relevant blog documents found.

INSTRUCTIONS:
- Clearly inform that no relevant information was found in the blog content.
- Do not generate answers from external knowledge or general common sense.
- Reply with "No relevant information found on the blog for this topic."
- Suggest other related questions that might be helpful.

ANSWER:`;
    }

    return `QUERY: ${query}

CONTEXT:
관련된 블로그 문서를 찾지 못했습니다.

INSTRUCTIONS:
- 블로그 콘텐츠에서 관련 정보를 찾지 못했음을 명확히 알리세요.
- 외부 지식이나 일반 상식으로 답변을 생성하지 마세요.
- "현재 블로그에서 해당 내용에 대한 정보를 찾을 수 없습니다"라고 안내하세요.
- 관련될 수 있는 다른 질문을 제안해주세요.

ANSWER:`;
  }

  // 컨텍스트가 있을 때 — 더 엄격한 grounding
  const contextText = context
    .map(
      item =>
        `[${item.index}] ${item.title}\nURL: ${item.url}\nCONTENT:\n${item.text}`
    )
    .join("\n\n");

  if (locale === "en") {
    return `QUERY: ${query}

CONTEXT:
${contextText}

INSTRUCTIONS:
- Answer using only the information contained in the CONTEXT above.
- Do not guess or invent content not in CONTEXT.
- Always cite sources using (Source N) format when referencing information.
- Do not copy long quoted text verbatim.
- Format your answer in markdown.

ANSWER:`;
  }

  return `QUERY: ${query}

CONTEXT:
${contextText}

INSTRUCTIONS:
- 오직 위 CONTEXT에 포함된 정보만 사용하여 답변하세요.
- CONTEXT에 없는 내용은 추측하거나 만들어내지 마세요.
- 답변 시 참고한 소스는 반드시 (출처 N) 형식으로 표기하세요.
- 인용 텍스트를 그대로 길게 복사하지 마세요.
- 마크다운 형식으로 답변하세요.

ANSWER:`;
}

export function toSourceRefsFromSemanticHits(hits: SemanticHit[]): SourceRef[] {
  const context = buildContextFromHits(hits);
  return context.slice(0, 5).map(item => ({
    title: item.title,
    ...(item.titleEn ? { titleEn: item.titleEn } : {}),
    slug: item.url,
  }));
}
