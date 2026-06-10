import assert from "node:assert/strict";
import {
  mergeSourcesAndStream,
  createSourcesPrefix,
} from "../src/utils/llm-search/streaming";

async function collectStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

async function* chunks() {
  yield "Hello";
  yield " ";
  yield "world";
}

async function run(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`PASS ${name}`);
}

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
