/**
 * RAG Evaluation Script (Document-Level)
 *
 * Compares two retrieval modes against a shared eval set:
 *   Mode A — Document-level RAG  (rag-index.json)
 *   Mode B — MiniSearch keyword search
 *
 * Usage:
 *   npx tsx scripts/run-eval.ts
 *   npx tsx scripts/run-eval.ts --top-k 3
 *
 * Prerequisites:
 *   1. pnpm sync-rag-index
 *   2. GOOGLE_GENERATIVE_AI_API_KEY in .env
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed } from "ai";

// ============================================================
// Path resolution
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const evalSetFile = path.join(
  root,
  "src",
  "content",
  "rag",
  "eval-set.json"
);

const indexFile = path.join(root, "public", "rag-index.json");
const outputFile = path.join(root, "eval-results.json");

// ============================================================
// Types
// ============================================================

interface EvalItem {
  id: string;
  query: string;
  locale: "ko" | "en";
  expectedDocIds: string[];
  expectedKeywords: string[];
  category: string;
}

interface EmbeddedDocument {
  id: string;
  docId: string;
  text: string;
  metadata: {
    title: string;
    titleEn?: string;
    tags: string[];
    url: string;
  };
  embedding: number[];
}

interface RetrievalResult {
  docId: string;
  score: number;
  text: string;
}

interface ModeResult {
  hit: boolean;
  reciprocalRank: number;
  keywordCoverage: number;
  latencyMs: number;
  topResults: { docId: string; score: number }[];
}

interface EvalItemResult {
  id: string;
  query: string;
  locale: string;
  category: string;
  expectedDocIds: string[];
  modes: {
    rag: ModeResult;
    minisearch: ModeResult;
  };
}

interface AggregatedMetrics {
  hitRate: number;
  mrr: number;
  avgKeywordCoverage: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalDocuments: number;
}

// ============================================================
// Env loading (copied from sync-rag-index.ts)
// ============================================================
async function loadEnvFile(filePath: string) {
  const raw = await readFile(filePath, "utf-8").catch(() => "");
  if (!raw) return;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function loadEnv() {
  await loadEnvFile(path.join(root, ".env.development"));
}

// ============================================================
// Cosine similarity
// ============================================================

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ============================================================
// RAG retrieval (Document-level)
// ============================================================

function retrieveRAG(
  queryEmbedding: number[],
  index: EmbeddedDocument[],
  topK: number
): RetrievalResult[] {
  const scored = index.map(doc => ({
    docId: doc.docId,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
    text: doc.text,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ============================================================
// MiniSearch retrieval (keyword-based)
// ============================================================

function retrieveMiniSearch(
  query: string,
  index: EmbeddedDocument[],
  topK: number
): RetrievalResult[] {
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\sㄱ-힣]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);

  const scored = index.map(doc => {
    const searchable = `${doc.metadata.title} ${doc.text} ${doc.metadata.tags.join(
      " "
    )}`.toLowerCase();

    let score = 0;

    for (const term of queryTerms) {
      if (searchable.includes(term)) {
        score += 1;

        if (doc.metadata.title.toLowerCase().includes(term)) {
          score += 2;
        }

        if (doc.metadata.tags.join(" ").toLowerCase().includes(term)) {
          score += 1.5;
        }
      }
    }

    score = queryTerms.length > 0 ? score / queryTerms.length : 0;

    return {
      docId: doc.docId,
      score,
      text: doc.text,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter(r => r.score > 0).slice(0, topK);
}

// ============================================================
// Metrics computation
// ============================================================

function computeHit(
  results: RetrievalResult[],
  expectedDocIds: string[]
): boolean {
  if (expectedDocIds.length === 0) {
    return results.length === 0 || results[0].score < 0.5;
  }
  return results.some(r => expectedDocIds.includes(r.docId));
}

function computeReciprocalRank(
  results: RetrievalResult[],
  expectedDocIds: string[]
): number {
  if (expectedDocIds.length === 0) return 0;

  for (let i = 0; i < results.length; i++) {
    if (expectedDocIds.includes(results[i].docId)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function computeKeywordCoverage(
  results: RetrievalResult[],
  expectedKeywords: string[]
): number {
  if (expectedKeywords.length === 0) return 1;

  const combinedText = results.map(r => r.text).join(" ").toLowerCase();
  let found = 0;

  for (const kw of expectedKeywords) {
    if (combinedText.includes(kw.toLowerCase())) {
      found++;
    }
  }

  return found / expectedKeywords.length;
}

function aggregateMetrics(
  results: EvalItemResult[],
  mode: "rag" | "minisearch",
  totalDocuments: number
): AggregatedMetrics {
  const positiveResults = results.filter(
    r => r.expectedDocIds.length > 0
  );

  const hits = positiveResults.filter(r => r.modes[mode].hit).length;
  const mrrs = positiveResults.map(r => r.modes[mode].reciprocalRank);
  const coverages = positiveResults.map(
    r => r.modes[mode].keywordCoverage
  );
  const latencies = results.map(r => r.modes[mode].latencyMs);

  latencies.sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);

  return {
    hitRate: hits / positiveResults.length,
    mrr: mrrs.reduce((a, b) => a + b, 0) / mrrs.length,
    avgKeywordCoverage:
      coverages.reduce((a, b) => a + b, 0) / coverages.length,
    avgLatencyMs:
      latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p95LatencyMs: latencies[p95Index] ?? 0,
    totalDocuments,
  };
}

// ============================================================
// Main
// ============================================================

async function main() {
  await loadEnv();

  const topK = (() => {
    const idx = process.argv.indexOf("--top-k");
    if (idx !== -1 && process.argv[idx + 1]) {
      return parseInt(process.argv[idx + 1], 10);
    }
    return 5;
  })();

  // --- Load API key ---
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");

  const google = createGoogleGenerativeAI({ apiKey });
  const embeddingModel = google.embeddingModel("gemini-embedding-001");

  // --- Load eval set ---
  const evalSet: EvalItem[] = JSON.parse(
    await readFile(evalSetFile, "utf-8")
  );

  const index: EmbeddedDocument[] = JSON.parse(
    await readFile(indexFile, "utf-8")
  );

  console.log(`📋 Loaded ${evalSet.length} eval items`);
  console.log(`📚 Indexed documents: ${index.length}`);

  const queryEmbeddings: number[][] = [];

  for (let i = 0; i < evalSet.length; i++) {
    const { embedding } = await embed({
      model: embeddingModel,
      value: evalSet[i].query,
    });
    queryEmbeddings.push(embedding);
  }

  const results: EvalItemResult[] = [];

  for (let i = 0; i < evalSet.length; i++) {
    const item = evalSet[i];
    const queryEmb = queryEmbeddings[i];

    const t0 = performance.now();
    const ragResults = retrieveRAG(queryEmb, index, topK);
    const ragLatency = performance.now() - t0;

    const t1 = performance.now();
    const miniResults = retrieveMiniSearch(item.query, index, topK);
    const miniLatency = performance.now() - t1;

    results.push({
      id: item.id,
      query: item.query,
      locale: item.locale,
      category: item.category,
      expectedDocIds: item.expectedDocIds,
      modes: {
        rag: {
          hit: computeHit(ragResults, item.expectedDocIds),
          reciprocalRank: computeReciprocalRank(
            ragResults,
            item.expectedDocIds
          ),
          keywordCoverage: computeKeywordCoverage(
            ragResults,
            item.expectedKeywords
          ),
          latencyMs: ragLatency,
          topResults: ragResults.map(r => ({
            docId: r.docId,
            score: r.score,
          })),
        },
        minisearch: {
          hit: computeHit(miniResults, item.expectedDocIds),
          reciprocalRank: computeReciprocalRank(
            miniResults,
            item.expectedDocIds
          ),
          keywordCoverage: computeKeywordCoverage(
            miniResults,
            item.expectedKeywords
          ),
          latencyMs: miniLatency,
          topResults: miniResults.map(r => ({
            docId: r.docId,
            score: r.score,
          })),
        },
      },
    });

    console.log(
      `${item.id} [${item.category}] rag=${results.at(-1)!.modes.rag.hit ? "✅" : "❌"
      } mini=${results.at(-1)!.modes.minisearch.hit ? "✅" : "❌"
      }`
    );
  }

  // --- Aggregate metrics ---
  // --- Per-category breakdown ---
  const categories = [...new Set(evalSet.map(e => e.category))];

  const byCategory: Record<
    string,
    {
      rag: { hitRate: number; mrr: number };
      minisearch: { hitRate: number; mrr: number };
    }
  > = {};

  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const positive = catResults.filter(
      r => r.expectedDocIds.length > 0
    );

    if (positive.length === 0) continue;

    const compute = (mode: "rag" | "minisearch") => ({
      hitRate:
        positive.filter(r => r.modes[mode].hit).length /
        positive.length,
      mrr:
        positive.reduce(
          (s, r) => s + r.modes[mode].reciprocalRank,
          0
        ) / positive.length,
    });

    byCategory[cat] = {
      rag: compute("rag"),
      minisearch: compute("minisearch"),
    };
  }

  const summary = {
    config: {
      topK,
      evalItems: evalSet.length,
      positiveItems: evalSet.filter(e => e.expectedDocIds.length > 0).length,
      negativeItems: evalSet.filter(e => e.expectedDocIds.length === 0).length,
    },
    metrics: {
      rag: aggregateMetrics(results, "rag", index.length),
      minisearch: aggregateMetrics(results, "minisearch", index.length),
    },
    byCategory,
    details: results,
  };

  // --- Console Summary Output ---
  console.log("\n" + "=".repeat(72));
  console.log("  DOCUMENT-LEVEL RAG EVALUATION RESULTS");
  console.log("=".repeat(72));

  const fmt = (n: number) => (n * 100).toFixed(1) + "%";
  const fmtMs = (n: number) => n.toFixed(1) + "ms";

  const m = summary.metrics;

  console.log(
    `\n${"Metric".padEnd(24)} ${"RAG".padEnd(16)} ${"MiniSearch".padEnd(16)}`
  );
  console.log("-".repeat(72));

  console.log(
    `${"Hit Rate @" + topK}`.padEnd(24) +
    ` ${fmt(m.rag.hitRate).padEnd(16)} ${fmt(m.minisearch.hitRate).padEnd(16)}`
  );

  console.log(
    `${"MRR"}`.padEnd(24) +
    ` ${fmt(m.rag.mrr).padEnd(16)} ${fmt(m.minisearch.mrr).padEnd(16)}`
  );

  console.log(
    `${"Keyword Coverage"}`.padEnd(24) +
    ` ${fmt(m.rag.avgKeywordCoverage).padEnd(16)} ${fmt(m.minisearch.avgKeywordCoverage).padEnd(16)}`
  );

  console.log(
    `${"Avg Latency"}`.padEnd(24) +
    ` ${fmtMs(m.rag.avgLatencyMs).padEnd(16)} ${fmtMs(m.minisearch.avgLatencyMs).padEnd(16)}`
  );

  console.log(
    `${"P95 Latency"}`.padEnd(24) +
    ` ${fmtMs(m.rag.p95LatencyMs).padEnd(16)} ${fmtMs(m.minisearch.p95LatencyMs).padEnd(16)}`
  );

  // --- Category breakdown ---
  console.log("\n📊 Per-Category Hit Rate:");
  console.log("-".repeat(72));
  console.log(
    `${"Category".padEnd(24)} ${"RAG".padEnd(16)} ${"MiniSearch".padEnd(16)}`
  );
  console.log("-".repeat(72));

  for (const [cat, data] of Object.entries(summary.byCategory)) {
    console.log(
      `${cat.padEnd(24)} ${fmt(data.rag.hitRate).padEnd(16)} ${fmt(data.minisearch.hitRate).padEnd(16)}`
    );
  }

  // --- Improvement summary ---
  const hitImprove = m.rag.hitRate - m.minisearch.hitRate;
  const mrrImprove = m.rag.mrr - m.minisearch.mrr;

  console.log("\n📈 RAG vs MiniSearch Improvement:");
  console.log(
    `  Hit Rate: ${hitImprove >= 0 ? "+" : ""}${fmt(hitImprove)}`
  );
  console.log(
    `  MRR:      ${mrrImprove >= 0 ? "+" : ""}${fmt(mrrImprove)}`
  );

  await writeFile(outputFile, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`\n💾 Full results written to ${outputFile}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});