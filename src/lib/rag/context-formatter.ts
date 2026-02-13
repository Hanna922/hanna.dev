import type { SourceRef } from "@utils/llm-search/types";
import type { SemanticHit } from "./types";

interface MergedContext {
  title: string;
  url: string;
  texts: string[];
}

export function buildContextFromHits(hits: SemanticHit[]) {
  const merged = new Map<string, MergedContext>();

  for (const hit of hits) {
    const key = hit.chunk.metadata.url;
    const entry = merged.get(key) ?? {
      title: hit.chunk.metadata.title,
      url: hit.chunk.metadata.url,
      texts: [],
    };

    entry.texts.push(hit.chunk.text);
    merged.set(key, entry);
  }

  return Array.from(merged.values()).map((entry, index) => ({
    index: index + 1,
    title: entry.title,
    url: entry.url,
    text: entry.texts.join("\n\n"),
  }));
}

export function buildPromptWithContext(query: string, hits: SemanticHit[]) {
  const context = buildContextFromHits(hits);

  if (context.length === 0) {
    return `QUERY: ${query}

CONTEXT:
관련된 블로그 문서를 찾지 못했습니다.

INSTRUCTIONS:
- 블로그 컨텍스트가 없음을 명확히 알리세요.
- 일반적인 답변을 제공하되, 단정적 표현은 피하세요.
- 답변 시 참고한 소스는 반드시 (출처 N) 형식으로 표기하세요.

ANSWER:`;
  }

  const contextText = context
    .map(
      item =>
        `[${item.index}] ${item.title}\nURL: ${item.url}\nCONTENT:\n${item.text}`
    )
    .join("\n\n");

  return `QUERY: ${query}

CONTEXT:
${contextText}

INSTRUCTIONS:
- 주어진 CONTEXT 범위 내에서 답변하세요.
- 답변 시 참고한 소스는 반드시 (출처 N) 형식으로 표기하세요.
- 인용 텍스트를 그대로 길게 복사하지 마세요.
- 마크다운 형식으로 답변하세요.

ANSWER:`;
}

export function toSourceRefsFromSemanticHits(hits: SemanticHit[]): SourceRef[] {
  const context = buildContextFromHits(hits);
  return context
    .slice(0, 5)
    .map(item => ({ title: item.title, slug: item.url }));
}
