import type { APIRoute } from "astro";
import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
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
import type { SearchRequestBody } from "@utils/llm-search/types";

export const prerender = false;

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

  const { mini } = await loadIndex(request.url);
  const hits = searchDocs(prompt, mini);

  const sourcesForClient = toSourceRefs(hits);
  const llmPrompt = buildLLMPrompt(prompt, hits);

  const result = streamText({
    model: google("gemini-2.5-flash-lite"),
    prompt: llmPrompt,
  });

  const stream = mergeSourcesAndStream(result.textStream, sourcesForClient);

  return createTextStreamResponse(stream);
};
