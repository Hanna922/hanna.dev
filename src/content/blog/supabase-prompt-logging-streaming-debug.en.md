---
author: Hanna922
pubDatetime: 2026-06-10T09:00:00.000Z
modDatetime:
title: Debugging Missing Supabase Logs After Vercel Streaming Responses
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
description: A root-cause analysis of why Supabase prompt_logs stopped recording while LLM streaming responses still worked normally in a Vercel serverless environment
---

This post documents a debugging session for an issue in the RAG-based AI search embedded in this blog: **AI responses streamed normally, but Supabase `prompt_logs` suddenly stopped being recorded**.

At first, I suspected one of the usual suspects: Supabase connectivity, an RLS policy, the table schema, or environment variables. The actual cause was earlier in the pipeline. The core issue was that **a background promise expected to run after returning a response from a Vercel serverless function was not executing reliably**.

This was not simply a "logs are not being written" problem. It involved LLM streaming, Supabase inserts, the Vercel runtime lifecycle, and RAG fallback behavior. The most important part of the investigation was not guessing, but checking **which logs existed and which logs were missing at each boundary**.

## Problem Situation

The blog AI search runs through `/api/search`.

When a user submits a question, the API route roughly does the following:

1. Read the user question.
2. If RAG is enabled, find related documents through semantic search.
3. Inject the retrieved context into the LLM prompt.
4. Stream the Gemini response through the Vercel AI SDK.
5. Store the full response and metadata in the Supabase `prompt_logs` table.

Only step 5 stopped working.

In the browser, the AI response looked normal. The `/api/search` status was also `200`. Vercel runtime logs also showed normal RAG ingestion logs.

```json
{"scope":"rag","level":"info","message":"RAG ingestion started","timestamp":"2026-06-10T08:48:15.843Z","context":{"documents":54,"chunks":54}}
{"scope":"rag","level":"info","message":"RAG ingestion completed","timestamp":"2026-06-10T08:48:17.764Z","context":{"documents":54,"chunks":54,"embedded":54}}
```

But the expected prompt logs were missing.

```txt
[PromptLog] logged successfully
[PromptLog] failed:
```

Neither appeared in Vercel logs, and no new row appeared in Supabase.

## The First Strange Clue

The last records in Supabase looked as if the prompt had been corrupted at some point.

```txt
??? ??? MiniSearch?? RAG? ??? ??? ????
```

Because of that clue, I first suspected an encoding issue. In fact, if a UTF-8 file is read with the default encoding in Windows PowerShell, Korean text can appear garbled.

So I first checked whether the source file itself was corrupted.

```powershell
Get-Content src\components\llm-search\types.ts -Encoding UTF8
```

When read as UTF-8, the example questions were normal Korean strings.

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

So the "garbled-looking string" was probably not the main cause. The important fact was that **logging stopped completely after that point**.

## First Hypothesis: Supabase Connection Issue

I found this log in Supabase.

```txt
connection authenticated: identity="postgres" method=scram-sha-256
```

At first, I thought, "The DB connection seems to work, so why is insert failing?" But this log only means that Postgres authentication succeeded. It does not mean that the application's Supabase REST insert succeeded.

The statement I later found in Supabase was not an actual insert either.

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

It had `source: dashboard`. In other words, it was a row count query issued by the Supabase Dashboard. It was not evidence that the application inserted into `prompt_logs`.

The more important fact was that **there were no PostgREST request logs**. If the app had attempted to insert through the Supabase REST API, a `/rest/v1/prompt_logs` request should have appeared. It did not.

At this point, the hypothesis changed.

> Supabase may not have rejected the insert. The app may not have sent a request to Supabase at all.

## Second Hypothesis: The API Route Is Not Running

Next, I checked Vercel runtime logs for `/api/search`.

There were `/api/search` requests. The status was `200`. The browser also received the AI response through streaming normally.

So the API route itself was not dead.

The facts looked like this.

| Check                         | Result  |
| ----------------------------- | ------- |
| `/api/search` request         | Present |
| HTTP status                   | 200     |
| AI streaming response         | Normal  |
| RAG ingestion log             | Present |
| `[PromptLog]` log             | Missing |
| Supabase PostgREST insert log | Missing |
| New Supabase row              | Missing |

This combination was a strong signal.

`/api/search` was running, and RAG and the LLM were working. But **the logging block was either not being reached, or it was being discarded by the function lifecycle before completion**.

## The Problematic Code

The core of the issue was the logging strategy in `/api/search`.

The previous code used `result.text` as a background promise so it could store the full LLM response.

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

At a glance, this looks reasonable.

- `result.textStream` is used for the client streaming response.
- `result.text` is used to get the full response text and store it in Supabase.
- Logging failures are fire-and-forget so they do not block the user response.

But in a Vercel serverless environment, this structure was not reliable.

After `return createTextStreamResponse(stream)`, there is no strong guarantee that a separate background promise will run to completion. Especially after a streaming response finishes and the function instance is cleaned up, the promise chain waiting on `result.text` may never complete.

The actual evidence matched this hypothesis.

- The AI response was normal. That means the `result.textStream` path was alive.
- There were no `[PromptLog]` success or failure logs. That means the `result.text.then(...)` chain did not complete.
- There were no Supabase PostgREST requests. That means execution did not reach `logPrompt()`.

## Why It Worked Before and Then Stopped

Logging did not start with this structure.

The initial Supabase prompt logging focused on the user prompt and RAG metadata. It did not need to wait for the full LLM response.

Later, I wanted to store the full response as well, so the logging point changed.

```txt
metadata logging around LLM response generation
→ full response logging after result.text completes
```

This made the logs more useful, but it also made them more vulnerable to the Vercel runtime lifecycle.

The issue became visible because several factors overlapped.

1. Logging moved to after `result.text` completion so the full `response` could be stored.
2. Logging was split into a background promise and was not `await`ed.
3. The client response still worked through `result.textStream`, so users did not see a visible failure.
4. In Vercel serverless environments, async work after returning a response is not guaranteed to complete.

In other words, Supabase and RAG were not the direct cause. The cause was **delegating operational logging to a point in time that the runtime does not guarantee**.

## Solution Direction

The requirements were clear.

1. The AI response should keep streaming.
2. The full response should still be stored in Supabase.
3. The current RAG path and deployment structure should remain unchanged.
4. Logging failures should not break the user response.
5. If logging fails, the cause should appear in Vercel logs.

So I removed the background promise and changed the structure so that **the actual response stream accumulates the assistant response while sending chunks to the client, then logs at stream completion**.

The core idea was to add an `onTextComplete` callback to `mergeSourcesAndStream()`.

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

Two things happen at the same time in this structure.

- Each chunk is immediately sent to the client through `controller.enqueue()`.
- The same chunk is also accumulated in the `chunks` array to reconstruct the full response.

When the stream ends, `onTextComplete` is `await`ed.

Now `/api/search` uses it like this.

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

The important difference is that `logPrompt()` is no longer an independent background promise after the response is returned.

Logging now belongs to the stream lifecycle. Because it runs inside the response stream that Vercel is actively processing, it is much more likely to complete reliably.

## Why Handle It in `mergeSourcesAndStream`

There were other options.

### Option 1: Store Only Metadata Right After the LLM Call

This is the simplest approach.

```ts
await logPrompt({
  prompt,
  response: "",
  ...
});
```

But this cannot store the full response. The goal this time was to keep actual answers for operational analysis, so this option was not enough.

### Option 2: Await `result.text` Before Returning the Response

This would make logging stable.

```ts
const fullText = await result.text;
await logPrompt({ response: fullText, ... });
return createTextStreamResponse(...);
```

But it would lose the streaming UX. Users would see nothing until the full LLM response finished. Streaming is a core part of this AI search UX, so this option was excluded.

### Option 3: Stream While Accumulating Text

This is the final approach.

It keeps the streaming UX while still storing the full response. It also ties logging to the actual stream completion point, making it more reliable in the Vercel runtime.

## Making Supabase Errors Visible

The direct cause was the background promise, but the debugging process revealed another weak point.

The previous `logPrompt()` did not inspect the result of the Supabase insert.

```ts
await db.from("prompt_logs").insert({
  prompt: entry.prompt,
  response: entry.response,
  rag_enabled: entry.ragEnabled,
  ...
});
```

Supabase JS does not always express insert failures only by throwing. It can return `{ error }`. That means issues such as RLS policies, column mismatches, or value length problems could be silently missed.

So I separated the insert function and explicitly throw when `error` is returned.

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

Now, if Supabase insert fails, Vercel runtime logs show this:

```txt
[PromptLog] failed:
```

If it succeeds, they show this:

```txt
[PromptLog] logged successfully
```

After deployment, I confirmed this success log and also verified that a row was stored in the Supabase `prompt_logs` table.

## Locking the Behavior With Tests

I added two regression tests for this fix.

The first test covers streaming behavior.

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

This test guarantees two things.

1. The stream sent to the client keeps the sources prefix.
2. The response text intended for the DB contains only the assistant body.

The second test covers Supabase insert error handling.

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

This test verifies that when Supabase returns `{ error }`, the code does not silently treat it as success.

## Verification Commands

After the fix, I ran these commands.

```bash
pnpm run test:streaming-logging
pnpm run test:prompt-logger
```

Both tests passed.

```txt
PASS mergeSourcesAndStream streams sources and calls onTextComplete with assistant text only
PASS insertPromptLog throws when Supabase returns an insert error
```

Type checking also passed.

```bash
.\node_modules\.bin\tsc.CMD --noEmit
```

Astro diagnostics also passed.

```bash
.\node_modules\.bin\astro-check.CMD
```

The result was:

```txt
Result (105 files):
- 0 errors
- 0 warnings
- 0 hints
```

`pnpm run build` failed locally. However, the failure was not from this logging change. It happened during prerendering because the OG image font fetch failed.

```txt
fetch failed
at async fetchFonts (...)
```

This project depends on an external font fetch during OG image generation, so builds can fail in local environments where network access is restricted. In GitHub Actions or Vercel, the build can pass if network access is available.

## Logs Confirmed After Deployment

After deployment, I searched for `PromptLog` in Vercel Runtime Logs.

The expected log appeared.

```txt
[PromptLog] logged successfully
```

I also confirmed that a new row appeared in the Supabase `prompt_logs` table.

This final check mattered. Tests and type checking can prove the structure, but this issue was about the serverless runtime lifecycle. The final validation had to happen in the actual Vercel deployment environment.

## Lessons Learned

### 1) Do Not Trust Background Promises After a Serverless Response

In a serverless function, you should not assume that asynchronous work will continue after `return`. This becomes even riskier when mixed with streaming responses.

If operational logs must be written reliably, one of these approaches is needed:

1. `await` the work before sending the response.
2. Tie the work to the response stream lifecycle.
3. Use a platform-supported background job mechanism.

In this case, because the streaming UX had to remain, option 2 was the right fit.

### 2) Missing Logs Are Also Strong Evidence

At first, I suspected Supabase RLS or the table schema. But there were no Supabase PostgREST request logs at all.

That means the DB did not reject the request. The request never reached the DB.

When debugging, **missing logs** can be as important as existing logs.

### 3) Success Logs and Error Logs Should Live at the Same Boundary

Previously, `[PromptLog]` logs lived inside a background promise. If that promise never ran, neither success nor failure was visible.

After the fix, both success and failure are recorded inside the `try/catch` at stream completion.

```ts
try {
  await logPrompt(...);
  console.log("[PromptLog] logged successfully");
} catch (err) {
  console.error("[PromptLog] failed:", err);
}
```

Now, if something fails, at least the failing layer becomes visible.

### 4) Always Check Supabase Insert Results

`await db.from(...).insert(...)` is not enough. The returned `{ error }` must be checked.

This was not the direct cause this time, but if I had not fixed it together, the next RLS or schema issue could have been silently swallowed again.

## Final Structure

The final structure looks like this.

```txt
User question
  ↓
/api/search
  ↓
RAG retrieval
  ↓
streamText()
  ↓
mergeSourcesAndStream(result.textStream, sources, { onTextComplete })
  ├─ send chunks to the client immediately
  ├─ accumulate chunks into the full response text
  └─ await logPrompt() when the stream ends
        ↓
      Supabase prompt_logs insert
```

The advantages are clear.

- Users still receive streaming responses.
- The DB stores the full assistant response.
- Logging runs inside the Vercel response stream lifecycle.
- Supabase insert failures become visible in Vercel logs.
- The sources prefix is used only as a client protocol detail and does not pollute the DB response.

## Closing

This issue started as "Supabase logging stopped," but Supabase was not the actual cause. The real problem was expecting a background promise after a Vercel serverless streaming response to complete reliably.

The fix was not simply adding `await logPrompt()`. Because I needed to store the full response while preserving the streaming UX, I had to **accumulate the response at the same point where chunks are streamed and log when the stream completes**.

Now, after deployment, Vercel logs show `[PromptLog] logged successfully`, and Supabase `prompt_logs` receives new rows again. If a similar issue happens again, the first thing to check is not the DB connection itself, but **which boundary the request actually reached**.
