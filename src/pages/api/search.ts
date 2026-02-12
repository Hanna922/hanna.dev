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

// ---- Mock 설정 ----
const IS_MOCK = import.meta.env.PUBLIC_LLM_MOCK_MODE === "true";

const MOCK_SOURCES = [
  {
    title: "React Fiber in Reconcile Phase",
    slug: "/posts/react-fiber-in-reconcile-phase/",
  },
  {
    title: "Building a Custom React Renderer",
    slug: "/posts/building-a-custom-react-renderer/",
  },
];

const MOCK_ANSWER = `React Fiber는 React 16에서 도입된 새로운 재조정(Reconciliation) 엔진입니다. 기존 Stack Reconciler의 한계를 극복하기 위해 설계되었으며, 작업을 작은 단위(fiber)로 나누어 비동기적으로 처리할 수 있는 것이 핵심입니다.

블로그 글에서 다룬 주요 내용은 다음과 같습니다:

- **Fiber 노드 구조**: 컴포넌트의 인스턴스와 1:1로 매핑되며, type, stateNode, child, sibling, return 등의 속성을 가집니다. (출처 1)

- **Reconcile Phase**: beginWork()와 completeWork() 두 단계를 거쳐 변경사항을 수집하고, Commit Phase에서 실제 DOM에 반영합니다. (출처 2)

- **비동기 처리**: 작업 우선순위 지정과 중단/재개가 가능해져, 사용자 인터랙션에 더 빠르게 반응할 수 있습니다.`;

/** Mock: 버퍼링 방지 + pull 기반 스트리밍 */
function createMockStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const CHUNK_SIZE = 6;
  const CHUNK_DELAY = 40; // ms

  const sourcesPrefix =
    "<!-- SOURCES_START -->" +
    JSON.stringify(MOCK_SOURCES) +
    "<!-- SOURCES_END -->\n";

  let sourcesSent = false;
  let offset = 0;

  return new ReadableStream({
    async pull(controller) {
      // 1) 소스 정보 먼저 전송
      if (!sourcesSent) {
        controller.enqueue(encoder.encode(sourcesPrefix));
        sourcesSent = true;
        await delay(CHUNK_DELAY);
        return;
      }

      // 2) 본문 끝나면 종료
      if (offset >= MOCK_ANSWER.length) {
        controller.close();
        return;
      }

      // 3) 본문 청크 전송
      const chunk = MOCK_ANSWER.slice(offset, offset + CHUNK_SIZE);
      controller.enqueue(encoder.encode(chunk));
      offset += CHUNK_SIZE;

      await delay(CHUNK_DELAY);
    },
  });
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ---- 실제 API ----
const apiKey = import.meta.env.GOOGLE_GENERATIVE_AI_API_KEY;
const google = createGoogleGenerativeAI({ apiKey });

export const POST: APIRoute = async ({ request }) => {
  // ---- Mock 모드: Gemini 호출 없이 동일 형식으로 스트리밍 ----
  if (IS_MOCK) {
    return new Response(createMockStream(), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  }

  // ---- 실제 모드 ----
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

  // 클라이언트에 보낼 소스 정보 준비
  const sourcesForClient = hits.slice(0, 5).map(h => ({
    title: h.title,
    slug: h.path,
  }));

  // MiniSearch 결과를 LLM 컨텍스트로 변환
  const sources = hits
    .map((h, i) => {
      const n = i + 1;
      return `[${n}] ${h.title}\nURL: ${h.path}\n요약: ${h.excerpt ?? ""}`;
    })
    .join("\n\n");

  const llmPrompt = `QUERY: ${prompt}

SOURCES:
${sources}

INSTRUCTIONS:
- 답변 시 참고한 소스는 반드시 (출처 N) 형식으로 표기하세요. 예: (출처 1)
- 인용 텍스트를 포함하지 마세요.
- 마크다운 형식으로 답변하세요.

ANSWER:`;

  // Gemini는 AI SDK의 google() 프로바이더로 호출.
  // apiKey는 기본적으로 GOOGLE_GENERATIVE_AI_API_KEY env를 사용.
  // :contentReference[oaicite:10]{index=10}
  const result = streamText({
    model: google("gemini-2.5-flash-lite"),
    prompt: llmPrompt,
  });

  // LLM 스트림 끝에 소스 구분자 + JSON을 붙여서 반환
  const originalStream = result.textStream;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // ✅ 소스 정보를 스트림 맨 앞에 보냄
      if (sourcesForClient.length > 0) {
        const sourcesPrefix =
          "<!-- SOURCES_START -->" +
          JSON.stringify(sourcesForClient) +
          "<!-- SOURCES_END -->\n";
        controller.enqueue(encoder.encode(sourcesPrefix));
      }

      // LLM 응답 스트리밍
      for await (const chunk of originalStream) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
};
