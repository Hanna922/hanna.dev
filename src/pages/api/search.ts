import type { APIRoute } from "astro";
import MiniSearch from "minisearch";
import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const prerender = false;

// 모듈 스코프 캐시(서버리스 웜 상태에서 재사용)
let cachedMini: MiniSearch | null = null;
let cachedDocs: any[] | null = null;

async function loadIndex(originRequestUrl: string) {
  if (cachedMini && cachedDocs) return { mini: cachedMini, docs: cachedDocs };

  const indexUrl = new URL("/search-index.json", originRequestUrl);
  const res = await fetch(indexUrl);

  if (!res.ok) throw new Error(`Failed to load index: ${res.status}`);

  const docs = await res.json();

  const mini = new MiniSearch({
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

const apiKey = import.meta.env.GOOGLE_GENERATIVE_AI_API_KEY;
const google = createGoogleGenerativeAI({ apiKey });

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? body?.query ?? "").trim();

  if (!apiKey) {
    return new Response(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY in import.meta.env",
      { status: 500 }
    );
  }

  const { mini } = await loadIndex(request.url);

  const hits = mini.search(prompt);

  // MiniSearch 결과를 LLM 컨텍스트로 변환
  const sources = hits
    .map((h, i) => {
      const n = i + 1;
      return `[${n}] ${h.title}\nURL: ${h.path}\n요약: ${h.excerpt ?? ""}`;
    })
    .join("\n\n");

  const llmPrompt = `QUERY: ${prompt}\n\nSOURCES:\n${sources}\n\nANSWER:`;

  // Gemini는 AI SDK의 google() 프로바이더로 호출.
  // apiKey는 기본적으로 GOOGLE_GENERATIVE_AI_API_KEY env를 사용.
  // :contentReference[oaicite:10]{index=10}
  const result = streamText({
    model: google("gemini-2.5-flash-lite"),
    prompt: llmPrompt,
  });

  // useCompletion에서 streamProtocol: 'text'로 받을 것이므로 text stream으로 반환
  return result.toUIMessageStreamResponse();
};
