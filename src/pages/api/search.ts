import type { APIRoute } from "astro";
import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { isRAGEnabled, runRAGSearch } from "lib/rag/index";
import { loadIndex } from "@utils/llm-search/indexLoader";
import { createMockStream } from "@utils/llm-search/mock";
import {
  buildLLMPrompt,
  searchDocs,
  toSourceRefs,
} from "@utils/llm-search/prompt";
import {
  createTextStreamResponse,
  mergeSourcesAndStream,
} from "@utils/llm-search/streaming";
import type { SearchRequestBody, SourceRef } from "@utils/llm-search/types";

export const prerender = false;

const SYSTEM_PROMPT = `당신은 소프트웨어 엔지니어 김나영(Hanna)의 개인 기술 블로그(hanna-dev.co.kr)에 내장된 AI 어시스턴트입니다.

## 핵심 규칙
1. 반드시 제공된 CONTEXT에 포함된 정보만을 근거로 답변하세요.
2. CONTEXT에 없는 내용은 절대 추측하거나 외부 지식으로 답변하지 마세요.
3. "김나영"은 이 블로그의 주인인 소프트웨어 엔지니어 김나영만을 의미합니다. 동명이인(방송인, 연예인 등)의 정보는 절대 포함하지 마세요.
4. 블로그 콘텐츠 범위를 벗어나는 질문에는 "블로그에서 관련 정보를 찾을 수 없습니다"라고 안내하세요.
5. 답변 시 참고한 소스는 반드시 (출처 N) 형식으로 표기하세요.
6. 마크다운 형식으로 답변하세요.`;

const isMockMode = import.meta.env.PUBLIC_LLM_MOCK_MODE === "true";
const apiKey = import.meta.env.GOOGLE_GENERATIVE_AI_API_KEY;
const google = createGoogleGenerativeAI({ apiKey });

function getPromptFromBody(body: SearchRequestBody) {
  return String(body?.prompt ?? body?.query ?? "").trim();
}

export const POST: APIRoute = async ({ request }) => {
  if (isMockMode) {
    return createTextStreamResponse(createMockStream());
  }

  const body = (await request.json().catch(() => ({}))) as SearchRequestBody;
  const prompt = getPromptFromBody(body);

  if (!apiKey) {
    return new Response(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY in import.meta.env",
      { status: 500 }
    );
  }

  let sourcesForClient: SourceRef[];
  let llmPrompt: string;

  try {
    if (isRAGEnabled()) {
      const rag = await runRAGSearch(prompt, {
        apiKey,
        originRequestUrl: request.url,
      });
      sourcesForClient = rag.sources;
      llmPrompt = rag.prompt;
    } else {
      const { mini } = await loadIndex(request.url);
      const hits = searchDocs(prompt, mini);
      sourcesForClient = toSourceRefs(hits);
      llmPrompt = buildLLMPrompt(prompt, hits);
    }
  } catch (error) {
    console.warn("RAG search failed; falling back to MiniSearch", error);
    const { mini } = await loadIndex(request.url);
    const hits = searchDocs(prompt, mini);
    sourcesForClient = toSourceRefs(hits);
    llmPrompt = buildLLMPrompt(prompt, hits);
  }

  const history = body.history ?? [];

  const result = streamText({
    model: google("gemini-2.5-flash-lite"),
    system: SYSTEM_PROMPT,
    messages: [
      ...history.map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user" as const, content: llmPrompt },
    ],
  });

  const stream = mergeSourcesAndStream(result.textStream, sourcesForClient);

  return createTextStreamResponse(stream);
};
