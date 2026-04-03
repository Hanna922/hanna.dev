import { buildLLMPrompt } from "@utils/llm-search/prompt";
import type { SourceRef } from "@utils/llm-search/types";

const DEFAULT_RAG_SERVER_URL = "http://localhost:8080";
const INTERNAL_API_KEY_HEADER = "X-Internal-Api-Key";

interface RagServerSource {
  docId: string;
  title: string;
  url: string;
  score: number;
  locale: string;
  sourceType: string;
}

interface RagServerResponse {
  context: string;
  sources: RagServerSource[];
  retrieval: {
    topK: number;
    returned: number;
    tookMs: number;
  };
}

export async function queryRagServer(input: {
  query: string;
  locale: "ko" | "en";
  topK: number;
}) {
  const apiKey =
    import.meta.env.RAG_SERVER_QUERY_API_KEY ??
    import.meta.env.INTERNAL_QUERY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RAG_SERVER_QUERY_API_KEY or INTERNAL_QUERY_API_KEY");
  }

  const baseUrl = normalizeBaseUrl(
    import.meta.env.RAG_SERVER_URL ?? DEFAULT_RAG_SERVER_URL
  );
  const response = await fetch(`${baseUrl}/v1/rag/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [INTERNAL_API_KEY_HEADER]: apiKey,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `RAG server query failed (${response.status} ${response.statusText}): ${errorBody}`
    );
  }

  const payload = (await response.json()) as RagServerResponse;

  return {
    context: payload.context ?? "",
    sources: toClientSourceRefs(payload.sources ?? []),
    retrieval: payload.retrieval ?? {
      topK: input.topK,
      returned: 0,
      tookMs: 0,
    },
  };
}

export function toClientSourceRefs(sources: RagServerSource[]): SourceRef[] {
  return sources.map(source => ({
    title: source.title || "Untitled",
    slug: source.url || "/",
  }));
}

export function buildRagServerPrompt(
  query: string,
  context: string,
  locale: "ko" | "en"
) {
  if (!context.trim()) {
    return buildLLMPrompt(query, [], locale);
  }

  if (locale === "en") {
    return `QUERY: ${query}

CONTEXT:
${context}

INSTRUCTIONS:
- Only use facts that appear in CONTEXT.
- Cite every referenced fact with (Source N) format.
- If CONTEXT is insufficient, reply with "No relevant information found on the blog."

ANSWER:`;
  }

  return `QUERY: ${query}

CONTEXT:
${context}

INSTRUCTIONS:
- CONTEXT에 포함된 사실만 사용하세요.
- 인용한 사실은 반드시 (출처 N) 형식으로 표기하세요.
- CONTEXT가 부족하면 "블로그에서 관련 정보를 찾을 수 없습니다"라고 답하세요.

ANSWER:`;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}
