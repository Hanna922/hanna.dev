import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface PromptLogEntry {
  prompt: string;
  response: string;
  ragEnabled: boolean;
  sourceCount: number;
  hitCount: number;
  topScore: number | null;
  latencyMs: number;
  userAgent?: string;
  referer?: string;
}

let client: SupabaseClient | null = null;

interface PromptLogDb {
  from(table: "prompt_logs"): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
}

function getClient(): SupabaseClient | null {
  if (client) return client;

  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  client = createClient(url, key);
  return client;
}

export async function logPrompt(entry: PromptLogEntry): Promise<void> {
  const db = getClient();
  if (!db) return; // 설정 없으면 조용히 스킵

  await insertPromptLog(db, entry);
}

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
