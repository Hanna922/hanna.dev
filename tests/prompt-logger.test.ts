import assert from "node:assert/strict";
import { insertPromptLog } from "../src/lib/rag/prompt-logger";

const entry = {
  prompt: "질문",
  response: "답변",
  ragEnabled: true,
  sourceCount: 2,
  hitCount: 2,
  topScore: 0.91,
  latencyMs: 1234,
  userAgent: "test-agent",
  referer: "https://example.com",
};

async function run(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`PASS ${name}`);
}

await run("insertPromptLog throws when Supabase returns an insert error", async () => {
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
});
