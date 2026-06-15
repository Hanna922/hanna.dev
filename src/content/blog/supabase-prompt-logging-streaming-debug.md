---
author: Hanna922
pubDatetime: 2026-06-10T09:00:00.000Z
modDatetime:
title: Vercel Streaming 응답 이후 Supabase 로깅이 사라진 문제 디버깅
titleEn: Debugging Missing Supabase Logs After Vercel Streaming Responses
featured: false
draft: false
tags:
  - Supabase
  - Vercel
  - Astro
  - RAG
  - LLM
  - Debugging
description: Vercel 서버리스 환경에서 LLM 스트리밍 응답은 정상인데 Supabase prompt_logs 기록만 멈춘 문제의 원인 분석과 해결 과정
---

이 글은 블로그에 내장된 RAG 기반 AI 검색에서 **AI 응답은 정상적으로 스트리밍되는데 Supabase `prompt_logs` 기록만 어느 순간부터 멈춘 문제**를 디버깅한 기록입니다.

처음에는 Supabase 연결, RLS policy, table schema, env 설정 중 하나가 깨졌다고 생각했습니다. 하지만 실제 원인은 DB보다 앞단에 있었습니다. **Vercel 서버리스 함수에서 응답을 반환한 뒤 실행되길 기대했던 background promise가 안정적으로 실행되지 않은 것**이 핵심이었습니다.

이번 문제는 단순히 "로그가 안 찍힌다"가 아니라, LLM streaming, Supabase insert, Vercel runtime lifecycle, RAG fallback이 겹친 운영 문제였습니다. 그래서 원인을 찾는 데 가장 중요했던 것은 추측이 아니라 **각 경계에서 어떤 로그가 있고 없는지**를 순서대로 확인하는 것이었습니다.

## 문제 상황

블로그 AI 검색은 `/api/search`에서 동작합니다.

사용자가 질문을 입력하면 API route는 대략 이런 일을 합니다.

1. 사용자 질문을 읽는다.
2. RAG가 활성화되어 있으면 semantic search로 관련 문서를 찾는다.
3. 찾은 문맥을 LLM prompt에 주입한다.
4. Gemini 응답을 Vercel AI SDK로 streaming한다.
5. 응답 전문과 metadata를 Supabase `prompt_logs` 테이블에 저장한다.

문제는 5번만 멈췄다는 점이었습니다.

브라우저에서는 AI 응답이 정상적으로 보였습니다. `/api/search` status도 `200`이었습니다. Vercel runtime logs에서도 RAG ingestion 로그는 정상적으로 찍혔습니다.

```json
{"scope":"rag","level":"info","message":"RAG ingestion started","timestamp":"2026-06-10T08:48:15.843Z","context":{"documents":54,"chunks":54}}
{"scope":"rag","level":"info","message":"RAG ingestion completed","timestamp":"2026-06-10T08:48:17.764Z","context":{"documents":54,"chunks":54,"embedded":54}}
```

하지만 기대했던 prompt log는 없었습니다.

```txt
[PromptLog] logged successfully
[PromptLog] failed:
```

둘 다 Vercel logs에 없었고, Supabase에서도 새 row가 생기지 않았습니다.

## 처음 관찰한 이상한 단서

Supabase의 마지막 기록을 보면, 어느 시점에 prompt가 깨진 것처럼 보였습니다.

```txt
??? ??? MiniSearch?? RAG? ??? ??? ????
```

이 단서 때문에 처음에는 인코딩 문제를 의심했습니다. 실제로 Windows PowerShell에서 UTF-8 파일을 기본 인코딩으로 읽으면 한글이 깨져 보일 수 있습니다.

그래서 먼저 코드 파일 자체가 깨졌는지 확인했습니다.

```powershell
Get-Content src\components\llm-search\types.ts -Encoding UTF8
```

UTF-8로 읽으면 예시 질문은 정상 한글이었습니다.

```ts
export const EXAMPLE_QUESTIONS: string[] = [
  "Stock Condition Analysis 프로젝트에 대해 설명해주세요.",
  "YDS 프로젝트에 대해 설명해주세요",
  "마이그레이션 경험에서 겪은 에러는?",
  "Yrano 프로젝트에 대해 설명해주세요",
  "대표 프로젝트 몇 가지를 설명해주세요",
  "블로그에서 다룬 기술 스택은?",
];
```

즉, "깨져 보이는 문자열"은 주요 원인이 아닐 가능성이 커졌습니다. 중요한 것은 **그 이후 아예 기록이 멈췄다**는 점이었습니다.

## 첫 번째 가설: Supabase 연결 문제

Supabase 로그에서 이런 기록을 확인했습니다.

```txt
connection authenticated: identity="postgres" method=scram-sha-256
```

처음에는 "DB 연결은 되는 것 같은데 왜 insert가 안 되지?"라고 생각했습니다. 하지만 이 로그는 Postgres 접속 인증이 성공했다는 뜻일 뿐입니다. 앱의 Supabase REST insert가 성공했다는 의미는 아닙니다.

이후 Supabase에서 확인한 statement도 실제 insert가 아니었습니다.

```sql
select
  case
    when estimate > 50000 then estimate
    else (select count(*) from public.prompt_logs)
  end as count,
  estimate > 50000 as is_estimate
from approximation;

-- source: dashboard
```

`source: dashboard`가 붙어 있었습니다. 즉 Supabase Dashboard가 테이블 row count를 조회한 로그였습니다. 앱에서 `prompt_logs`에 insert한 흔적이 아니었습니다.

더 중요한 사실은 **PostgREST 요청 로그가 없었다**는 점입니다. 앱이 Supabase REST API로 insert를 시도했다면 `/rest/v1/prompt_logs` 요청이 보여야 합니다. 그런데 없었습니다.

이 시점에서 가설이 바뀌었습니다.

> Supabase가 insert를 거부한 것이 아니라, 앱에서 Supabase까지 요청 자체가 나가지 않았을 가능성이 크다.

## 두 번째 가설: API route가 실행되지 않는다

다음으로 Vercel에서 `/api/search` runtime logs를 확인했습니다.

결과는 `/api/search` 요청이 있었습니다. status도 `200`이었습니다. 브라우저에서도 AI 응답이 정상적으로 스트리밍되었습니다.

따라서 API route 자체가 죽은 것은 아니었습니다.

확인한 사실을 정리하면 이렇습니다.

| 확인 항목                     | 결과 |
| ----------------------------- | ---- |
| `/api/search` 요청            | 있음 |
| HTTP status                   | 200  |
| AI streaming 응답             | 정상 |
| RAG ingestion log             | 있음 |
| `[PromptLog]` log             | 없음 |
| Supabase PostgREST insert log | 없음 |
| Supabase row 추가             | 없음 |

이 조합은 꽤 강한 신호입니다.

`/api/search`는 실행되고, RAG와 LLM도 동작하지만, **로깅 블록까지 도달하지 않거나 로깅 블록이 완료되기 전에 함수 lifecycle에서 버려지고 있다**는 뜻입니다.

## 문제가 있던 코드

문제의 핵심은 `/api/search`의 로깅 방식이었습니다.

기존 코드는 LLM 응답 전문을 저장하기 위해 `result.text`를 background promise로 읽었습니다.

```ts
const result = streamText({
  model: google("gemini-2.5-flash-lite"),
  system: `${systemPrompt}\n\n${languageInstruction}`,
  messages: [
    ...history.map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user" as const, content: llmPrompt },
  ],
});

Promise.resolve(result.text)
  .then(fullText =>
    logPrompt({
      prompt,
      response: fullText,
      ragEnabled: isRAGEnabled(),
      sourceCount: sourcesForClient.length,
      hitCount,
      topScore,
      latencyMs,
      userAgent: request.headers.get("user-agent") ?? undefined,
      referer: request.headers.get("referer") ?? undefined,
    })
  )
  .then(() => console.log("[PromptLog] ✅ logged successfully"))
  .catch(err => console.error("[PromptLog] ❌ failed:", err));

const stream = mergeSourcesAndStream(result.textStream, sourcesForClient);

return createTextStreamResponse(stream);
```

겉으로 보면 괜찮아 보입니다.

- `result.textStream`은 클라이언트 streaming 응답에 사용한다.
- `result.text`는 전체 응답 text를 얻은 뒤 Supabase에 저장한다.
- logging 실패는 사용자 응답을 막지 않도록 fire-and-forget으로 처리한다.

하지만 Vercel 서버리스 환경에서는 이 구조가 안정적이지 않았습니다.

`return createTextStreamResponse(stream)`으로 응답을 반환한 뒤, 별도의 background promise가 끝까지 실행된다는 보장이 약합니다. 특히 streaming 응답이 끝난 뒤 함수 인스턴스가 정리되면, `result.text`를 기다리던 promise chain이 완료되지 못할 수 있습니다.

실제 증거도 이 가설과 맞았습니다.

- AI 응답은 정상입니다. 즉 `result.textStream` 경로는 살아 있습니다.
- `[PromptLog]` 성공/실패 로그가 없습니다. 즉 `result.text.then(...)` chain이 완료되지 않았습니다.
- Supabase PostgREST 요청도 없습니다. 즉 `logPrompt()`까지 도달하지 않았습니다.

## 왜 처음에는 잘 되다가 멈췄을까

로깅은 처음부터 이런 구조였던 것이 아닙니다.

초기 Supabase prompt logging은 사용자 prompt와 RAG metadata 중심이었습니다. 즉 LLM 응답 전문을 기다리지 않아도 저장할 수 있었습니다.

이후 응답 전문까지 저장하고 싶어지면서 로깅 위치가 바뀌었습니다.

```txt
LLM 응답 생성 전후 metadata logging
→ result.text 완료 이후 response 전문 logging
```

이 변경으로 로깅은 더 유용해졌지만, 동시에 Vercel runtime lifecycle에 더 취약해졌습니다.

문제가 특정 시점 이후 두드러진 이유는 다음 요인들이 겹쳤기 때문으로 판단했습니다.

1. `response` 전문 저장을 위해 `result.text` 완료 이후 로깅하도록 바뀌었다.
2. 로깅이 `await`되지 않고 background promise로 분리되었다.
3. 클라이언트 응답은 `result.textStream`으로 정상 처리되므로 사용자 입장에서는 장애가 보이지 않았다.
4. Vercel 서버리스 환경에서는 응답 반환 이후의 비동기 작업 완료가 보장되지 않았다.

즉, Supabase나 RAG가 직접 원인은 아니었습니다. **운영 환경에서 보장되지 않는 시점에 로깅을 맡긴 구조**가 원인이었습니다.

## 해결 방향

요구사항은 명확했습니다.

1. AI 응답은 계속 streaming해야 한다.
2. response 전문도 Supabase에 저장해야 한다.
3. 현재 RAG 경로와 배포 구조는 유지해야 한다.
4. 로깅 실패가 사용자 응답을 깨뜨리면 안 된다.
5. 실패한다면 Vercel logs에 원인이 남아야 한다.

그래서 background promise를 없애고, **실제로 클라이언트로 나가는 stream 안에서 assistant 응답을 누적한 뒤 stream 종료 시점에 로깅**하도록 바꿨습니다.

핵심 아이디어는 `mergeSourcesAndStream()`에 `onTextComplete` callback을 추가하는 것입니다.

```ts
export function mergeSourcesAndStream(
  textStream: AsyncIterable<string>,
  sources: SourceRef[],
  options?: {
    onTextComplete?: (text: string) => void | Promise<void>;
  }
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const chunks: string[] = [];

      if (sources.length > 0) {
        controller.enqueue(encoder.encode(createSourcesPrefix(sources)));
      }

      for await (const chunk of textStream) {
        chunks.push(chunk);
        controller.enqueue(encoder.encode(chunk));
      }

      await options?.onTextComplete?.(chunks.join(""));
      controller.close();
    },
  });
}
```

이 구조에서는 두 가지가 동시에 일어납니다.

- 각 chunk는 즉시 `controller.enqueue()`로 클라이언트에 전달됩니다.
- 같은 chunk를 `chunks` 배열에 누적해 response 전문을 복원합니다.

그리고 stream이 끝나면 `onTextComplete`를 `await`합니다.

이제 `/api/search`에서는 이렇게 사용합니다.

```ts
const stream = mergeSourcesAndStream(result.textStream, sourcesForClient, {
  onTextComplete: async fullText => {
    try {
      await logPrompt({
        prompt,
        response: fullText,
        ragEnabled: isRAGEnabled(),
        sourceCount: sourcesForClient.length,
        hitCount,
        topScore,
        latencyMs,
        userAgent: request.headers.get("user-agent") ?? undefined,
        referer: request.headers.get("referer") ?? undefined,
      });
      console.log("[PromptLog] logged successfully");
    } catch (err) {
      console.error("[PromptLog] failed:", err);
    }
  },
});

return createTextStreamResponse(stream);
```

중요한 차이는 `logPrompt()`가 더 이상 응답 반환 이후의 독립적인 background promise가 아니라는 점입니다.

이제 로깅은 stream lifecycle 내부에 있습니다. Vercel runtime이 실제로 처리 중인 response stream 안에서 실행되므로, 이전보다 훨씬 안정적으로 완료됩니다.

## 왜 `mergeSourcesAndStream`에서 처리했나

다른 선택지도 있었습니다.

### 선택지 1: LLM 호출 직후 metadata만 저장

가장 단순한 방식입니다.

```ts
await logPrompt({
  prompt,
  response: "",
  ...
});
```

하지만 이 방식은 response 전문을 저장할 수 없습니다. 이번 목표는 운영 분석을 위해 실제 답변까지 남기는 것이었기 때문에 제외했습니다.

### 선택지 2: `result.text`를 먼저 await한 뒤 응답 반환

이렇게 하면 로깅은 안정적입니다.

```ts
const fullText = await result.text;
await logPrompt({ response: fullText, ... });
return createTextStreamResponse(...);
```

하지만 streaming UX를 잃습니다. 사용자는 전체 LLM 응답이 끝날 때까지 아무것도 보지 못합니다. AI 검색에서 streaming은 핵심 UX이므로 제외했습니다.

### 선택지 3: stream을 흘려보내면서 동시에 누적

최종 선택한 방식입니다.

이 방식은 streaming UX를 유지하면서 response 전문도 저장할 수 있습니다. 또한 로깅이 실제 stream 종료 시점에 묶이므로 Vercel runtime에서도 실행 가능성이 높습니다.

## Supabase error를 놓치지 않도록 수정

문제의 직접 원인은 background promise였지만, 디버깅 과정에서 또 하나의 약점을 발견했습니다.

기존 `logPrompt()`는 Supabase insert 결과를 검사하지 않았습니다.

```ts
await db.from("prompt_logs").insert({
  prompt: entry.prompt,
  response: entry.response,
  rag_enabled: entry.ragEnabled,
  ...
});
```

Supabase JS는 insert 실패를 항상 throw로만 표현하지 않습니다. `{ error }` 형태로 반환되는 경우가 있습니다. 따라서 RLS policy, column mismatch, value too long 같은 문제가 있어도 코드가 실패를 놓칠 수 있었습니다.

그래서 insert 함수를 분리하고 `error`를 명시적으로 throw하도록 바꿨습니다.

```ts
export async function insertPromptLog(
  db: PromptLogDb,
  entry: PromptLogEntry
): Promise<void> {
  const { error } = await db.from("prompt_logs").insert({
    prompt: entry.prompt,
    response: entry.response,
    rag_enabled: entry.ragEnabled,
    source_count: entry.sourceCount,
    hit_count: entry.hitCount,
    top_score: entry.topScore,
    latency_ms: entry.latencyMs,
    user_agent: entry.userAgent,
    referer: entry.referer,
  });

  if (error) {
    throw error;
  }
}
```

이제 Supabase insert가 실패하면 Vercel runtime logs에 아래 형태로 남습니다.

```txt
[PromptLog] failed:
```

성공하면 아래 로그가 남습니다.

```txt
[PromptLog] logged successfully
```

실제 배포 후 이 성공 로그를 확인했고, Supabase `prompt_logs` 테이블에서도 row가 저장되는 것을 확인했습니다.

## 테스트로 고정한 동작

이번 수정은 두 가지 회귀 테스트로 고정했습니다.

첫 번째 테스트는 streaming 동작입니다.

```ts
await run(
  "mergeSourcesAndStream streams sources and calls onTextComplete with assistant text only",
  async () => {
    const sources = [{ title: "Post", slug: "/posts/post/" }];
    let loggedText: string | null = null;

    const output = await collectStream(
      mergeSourcesAndStream(chunks(), sources, {
        onTextComplete: async text => {
          loggedText = text;
        },
      })
    );

    assert.equal(output, `${createSourcesPrefix(sources)}Hello world`);
    assert.equal(loggedText, "Hello world");
  }
);
```

이 테스트가 보장하는 것은 두 가지입니다.

1. 클라이언트로 나가는 stream에는 sources prefix가 유지된다.
2. DB에 저장할 response text에는 assistant 본문만 들어간다.

두 번째 테스트는 Supabase insert error 처리입니다.

```ts
await run(
  "insertPromptLog throws when Supabase returns an insert error",
  async () => {
    const error = new Error("violates row-level security policy");
    const db = {
      from(table: string) {
        assert.equal(table, "prompt_logs");
        return {
          async insert(row: Record<string, unknown>) {
            assert.equal(row.prompt, entry.prompt);
            assert.equal(row.response, entry.response);
            assert.equal(row.rag_enabled, true);
            return { error };
          },
        };
      },
    };

    await assert.rejects(() => insertPromptLog(db, entry), error);
  }
);
```

이 테스트는 Supabase가 `{ error }`를 반환할 때 코드가 조용히 성공 처리하지 않고 실패를 드러내는지 확인합니다.

## 검증한 명령어

수정 후 아래 명령어를 실행했습니다.

```bash
pnpm run test:streaming-logging
pnpm run test:prompt-logger
```

두 테스트 모두 통과했습니다.

```txt
PASS mergeSourcesAndStream streams sources and calls onTextComplete with assistant text only
PASS insertPromptLog throws when Supabase returns an insert error
```

타입체크도 통과했습니다.

```bash
.\node_modules\.bin\tsc.CMD --noEmit
```

Astro diagnostics도 통과했습니다.

```bash
.\node_modules\.bin\astro-check.CMD
```

결과는 다음과 같았습니다.

```txt
Result (105 files):
- 0 errors
- 0 warnings
- 0 hints
```

`pnpm run build`는 로컬에서 실패했습니다. 다만 실패 지점은 이번 로깅 코드가 아니라 prerender 중 OG 이미지 폰트 fetch였습니다.

```txt
fetch failed
at async fetchFonts (...)
```

이 프로젝트는 OG 이미지 생성 과정에서 외부 font fetch에 의존하고 있어, 네트워크가 제한된 로컬 환경에서는 build가 실패할 수 있습니다. GitHub Actions/Vercel 환경에서는 네트워크 접근이 가능하면 통과할 수 있습니다.

## 배포 후 확인한 로그

배포 후 Vercel Runtime Logs에서 `PromptLog`를 검색했습니다.

기대했던 로그가 찍혔습니다.

```txt
[PromptLog] logged successfully
```

그리고 Supabase `prompt_logs` 테이블에서도 새 row를 확인했습니다.

이 확인이 중요합니다. 테스트와 타입체크는 구조가 맞는지 보여주지만, 이번 문제는 서버리스 runtime lifecycle과 관련된 운영 이슈였습니다. 따라서 최종 검증은 실제 Vercel 배포 환경에서 해야 했습니다.

## 이번 문제에서 배운 것

### 1) 서버리스에서 response 이후 background promise를 믿으면 안 된다

서버리스 함수에서 `return` 이후에도 비동기 작업이 계속 실행될 것이라고 기대하면 안 됩니다. 특히 streaming response와 섞이면 더 위험합니다.

운영상 반드시 남아야 하는 로그라면 다음 중 하나를 선택해야 합니다.

1. 응답 전에 `await`한다.
2. response stream lifecycle 안에 묶는다.
3. 플랫폼이 보장하는 background job mechanism을 사용한다.

이번 경우에는 streaming UX를 유지해야 했기 때문에 2번이 맞았습니다.

### 2) "로그가 없다"는 것도 강한 증거다

처음에는 Supabase RLS나 table schema를 의심했습니다. 하지만 Supabase PostgREST 요청 로그 자체가 없었습니다.

이 말은 DB가 거부한 것이 아니라, DB까지 요청이 가지 않았다는 뜻입니다.

디버깅할 때는 있는 로그만큼이나 **없는 로그**도 중요합니다.

### 3) success log와 error log는 같은 경계에 있어야 한다

기존 코드는 `[PromptLog]` 로그가 background promise 안에 있었습니다. 그래서 promise가 실행되지 않으면 성공도 실패도 보이지 않았습니다.

수정 후에는 stream 종료 시점의 `try/catch` 안에서 성공/실패를 모두 기록합니다.

```ts
try {
  await logPrompt(...);
  console.log("[PromptLog] logged successfully");
} catch (err) {
  console.error("[PromptLog] failed:", err);
}
```

이제 문제가 생기면 적어도 어느 층에서 실패했는지 볼 수 있습니다.

### 4) Supabase insert 결과는 반드시 확인해야 한다

`await db.from(...).insert(...)`만으로는 충분하지 않습니다. `{ error }`를 확인해야 합니다.

이번에는 직접 원인이 아니었지만, 이 부분을 같이 고치지 않았다면 다음 장애에서는 RLS나 schema 문제가 다시 조용히 묻혔을 수 있습니다.

## 최종 구조

최종 구조는 다음과 같습니다.

```txt
사용자 질문
  ↓
/api/search
  ↓
RAG retrieval
  ↓
streamText()
  ↓
mergeSourcesAndStream(result.textStream, sources, { onTextComplete })
  ├─ chunk를 클라이언트로 즉시 전송
  ├─ chunk를 response 전문으로 누적
  └─ stream 종료 시 await logPrompt()
        ↓
      Supabase prompt_logs insert
```

이 구조의 장점은 명확합니다.

- 사용자는 기존처럼 streaming 응답을 받는다.
- DB에는 assistant response 전문이 저장된다.
- 로깅은 Vercel response stream lifecycle 안에서 실행된다.
- Supabase insert 실패는 Vercel logs에 드러난다.
- sources prefix는 클라이언트 protocol로만 사용되고, DB response에는 섞이지 않는다.

## 마무리

이번 문제는 "Supabase 로깅이 멈췄다"로 시작했지만, 실제 원인은 Supabase가 아니었습니다. Vercel 서버리스 환경에서 streaming response 이후 background promise가 실행될 것이라고 기대한 구조가 문제였습니다.

해결은 단순히 `await logPrompt()`를 추가하는 것이 아니었습니다. response 전문을 저장하면서 streaming UX도 유지해야 했기 때문에, **stream을 흘려보내는 지점에서 동시에 response를 누적하고 stream 종료 시점에 로깅하는 구조**로 바꿔야 했습니다.

이제 배포 후 Vercel logs에는 `[PromptLog] logged successfully`가 남고, Supabase `prompt_logs`에도 row가 다시 쌓입니다. 다음에 비슷한 문제가 생긴다면 먼저 확인할 것은 DB 연결이 아니라, **요청이 어느 경계까지 도달했는지**입니다.
