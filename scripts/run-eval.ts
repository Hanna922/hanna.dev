/**
 * RAG Evaluation Script
 *
 * Compares three retrieval modes against a shared eval set:
 *   Mode A — RAG with heading-based chunking  (rag-index.json)
 *   Mode B — RAG naive (one chunk per doc)     (rag-index-naive.json)
 *   Mode C — MiniSearch keyword search
 *
 * Usage:
 *   npx tsx scripts/run-eval.ts
 *   npx tsx scripts/run-eval.ts --top-k 3
 *
 * Prerequisites:
 *   1. pnpm sync-rag-index                 → generates public/rag-index.json
 *   2. pnpm sync-rag-index -- --naive      → generates public/rag-index-naive.json
 *   3. GOOGLE_GENERATIVE_AI_API_KEY in .env
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
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
const blogDir = path.join(root, "src", "content", "blog");
const evalSetFile = path.join(root, "src", "content", "rag", "eval-set.json");
const chunkedIndexFile = path.join(root, "public", "rag-index.json");
const naiveIndexFile = path.join(root, "public", "rag-index-naive.json");
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

interface EmbeddedChunk {
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
  chunkId: string;
  score: number;
  text: string;
}

interface EvalItemResult {
  id: string;
  query: string;
  locale: string;
  category: string;
  expectedDocIds: string[];
  modes: {
    chunked: ModeResult;
    naive: ModeResult;
    minisearch: ModeResult;
  };
}

interface ModeResult {
  hit: boolean;
  reciprocalRank: number;
  keywordCoverage: number;
  latencyMs: number;
  topResults: { docId: string; score: number }[];
}

interface AggregatedMetrics {
  hitRate: number;
  mrr: number;
  avgKeywordCoverage: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalChunks: number;
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
  await loadEnvFile(path.join(root, ".env"));
  await loadEnvFile(path.join(root, ".env.local"));
  await loadEnvFile(path.join(root, ".env.development"));
  await loadEnvFile(path.join(root, ".env.development.local"));
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
// RAG retrieval (embedding-based)
// ============================================================
function retrieveRAG(
  queryEmbedding: number[],
  index: EmbeddedChunk[],
  topK: number
): RetrievalResult[] {

  // 1️⃣ chunk scoring
  const scored = index.map((chunk) => ({
    docId: chunk.docId,
    chunkId: chunk.id,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
    text: chunk.text,
  }));

  // 2️⃣ 문서별 최고 점수 chunk 선택
  const bestByDoc = new Map<string, RetrievalResult>();

  for (const item of scored) {
    const existing = bestByDoc.get(item.docId);
    if (!existing || item.score > existing.score) {
      bestByDoc.set(item.docId, item);
    }
  }

  // 3️⃣ 문서 단위 정렬
  const docLevelResults = Array.from(bestByDoc.values());
  docLevelResults.sort((a, b) => b.score - a.score);

  // 4️⃣ topK 문서 반환
  return docLevelResults.slice(0, topK);
}

// ============================================================
// MiniSearch retrieval (keyword-based)
// ============================================================
interface MiniSearchDoc {
  id: string;
  docId: string;
  title: string;
  content: string;
  tags: string;
}

function buildMiniSearchIndex(chunks: EmbeddedChunk[]): MiniSearchDoc[] {
  return chunks.map((chunk) => ({
    id: chunk.id,
    docId: chunk.docId,
    title: chunk.metadata.title + (chunk.metadata.titleEn ? ` ${chunk.metadata.titleEn}` : ""),
    content: chunk.text,
    tags: (chunk.metadata.tags || []).join(" "),
  }));
}

function retrieveMiniSearch(
  query: string,
  docs: MiniSearchDoc[],
  topK: number
): RetrievalResult[] {
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\sㄱ-힣]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const scored = docs.map((doc) => {
    const searchable = `${doc.title} ${doc.content} ${doc.tags}`.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      if (searchable.includes(term)) {
        score += 1;
        // Boost title matches
        if (doc.title.toLowerCase().includes(term)) {
          score += 2;
        }
        // Boost tag matches
        if (doc.tags.toLowerCase().includes(term)) {
          score += 1.5;
        }
      }
    }

    // Normalize by query length
    score = queryTerms.length > 0 ? score / queryTerms.length : 0;

    return {
      docId: doc.docId,
      chunkId: doc.id,
      score,
      text: doc.content,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((r) => r.score > 0).slice(0, topK);
}

// ============================================================
// Metrics computation
// ============================================================
function computeHit(
  results: RetrievalResult[],
  expectedDocIds: string[]
): boolean {
  if (expectedDocIds.length === 0) {
    // Negative case: hit = true means no false positives (top score < threshold)
    return results.length === 0 || results[0].score < 0.5;
  }
  return results.some((r) => expectedDocIds.includes(r.docId));
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

  const combinedText = results.map((r) => r.text).join(" ").toLowerCase();
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
  mode: "chunked" | "naive" | "minisearch",
  totalChunks: number
): AggregatedMetrics {
  // Exclude negative cases from hit/mrr/keyword calculations
  const positiveResults = results.filter(
    (r) => r.expectedDocIds.length > 0
  );

  const hits = positiveResults.filter((r) => r.modes[mode].hit).length;
  const mrrs = positiveResults.map((r) => r.modes[mode].reciprocalRank);
  const coverages = positiveResults.map(
    (r) => r.modes[mode].keywordCoverage
  );
  const latencies = results.map((r) => r.modes[mode].latencyMs);

  latencies.sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);

  return {
    hitRate: positiveResults.length > 0 ? hits / positiveResults.length : 0,
    mrr:
      mrrs.length > 0 ? mrrs.reduce((a, b) => a + b, 0) / mrrs.length : 0,
    avgKeywordCoverage:
      coverages.length > 0
        ? coverages.reduce((a, b) => a + b, 0) / coverages.length
        : 0,
    avgLatencyMs:
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0,
    p95LatencyMs: latencies[p95Index] ?? 0,
    totalChunks,
  };
}

// ============================================================
// Markdown file walking (for MiniSearch from raw docs)
// ============================================================
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : Promise.resolve([full]);
    })
  );
  return files
    .flat()
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"));
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
  if (!apiKey) {
    throw new Error(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY. Set it in .env or .env.local"
    );
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const embeddingModel = google.embeddingModel("gemini-embedding-001");

  // --- Load eval set ---
  const evalSet: EvalItem[] = JSON.parse(
    await readFile(evalSetFile, "utf-8")
  );
  console.log(`📋 Loaded ${evalSet.length} eval items`);

  // --- Load RAG indexes ---
  let chunkedIndex: EmbeddedChunk[];
  let naiveIndex: EmbeddedChunk[];

  try {
    chunkedIndex = JSON.parse(await readFile(chunkedIndexFile, "utf-8"));
    console.log(`✅ Chunked index: ${chunkedIndex.length} chunks`);
  } catch {
    console.error(
      "❌ Missing public/rag-index.json. Run: pnpm sync-rag-index"
    );
    process.exit(1);
  }

  try {
    naiveIndex = JSON.parse(await readFile(naiveIndexFile, "utf-8"));
    console.log(`✅ Naive index: ${naiveIndex.length} chunks`);
  } catch {
    console.error(
      "❌ Missing public/rag-index-naive.json. Run: pnpm sync-rag-index -- --naive"
    );
    process.exit(1);
  }

  // --- Build MiniSearch docs from chunked index ---
  const miniSearchDocs = buildMiniSearchIndex(chunkedIndex);
  console.log(`✅ MiniSearch docs built: ${miniSearchDocs.length}`);

  // --- Embed all eval queries ---
  console.log(`\n🔄 Embedding ${evalSet.length} eval queries...`);
  const queryEmbeddings: number[][] = [];

  for (let i = 0; i < evalSet.length; i++) {
    const item = evalSet[i];
    console.log(
      `  [${i + 1}/${evalSet.length}] ${item.id}: ${item.query.slice(0, 50)}...`
    );
    const result = await embed({ model: embeddingModel, value: item.query });
    queryEmbeddings.push(result.embedding);
  }
  console.log(`✅ All queries embedded\n`);

  // --- Run evaluation ---
  const results: EvalItemResult[] = [];

  for (let i = 0; i < evalSet.length; i++) {
    const item = evalSet[i];
    const queryEmb = queryEmbeddings[i];

    // Mode A: Chunked RAG
    const t0 = performance.now();
    const chunkedResults = retrieveRAG(queryEmb, chunkedIndex, topK);
    const chunkedLatency = performance.now() - t0;

    // Mode B: Naive RAG
    const t1 = performance.now();
    const naiveResults = retrieveRAG(queryEmb, naiveIndex, topK);
    const naiveLatency = performance.now() - t1;

    // Mode C: MiniSearch
    const t2 = performance.now();
    const miniResults = retrieveMiniSearch(item.query, miniSearchDocs, topK);
    const miniLatency = performance.now() - t2;

    const evalResult: EvalItemResult = {
      id: item.id,
      query: item.query,
      locale: item.locale,
      category: item.category,
      expectedDocIds: item.expectedDocIds,
      modes: {
        chunked: {
          hit: computeHit(chunkedResults, item.expectedDocIds),
          reciprocalRank: computeReciprocalRank(
            chunkedResults,
            item.expectedDocIds
          ),
          keywordCoverage: computeKeywordCoverage(
            chunkedResults,
            item.expectedKeywords
          ),
          latencyMs: Math.round(chunkedLatency * 100) / 100,
          topResults: chunkedResults.map((r) => ({
            docId: r.docId,
            score: Math.round(r.score * 10000) / 10000,
          })),
        },
        naive: {
          hit: computeHit(naiveResults, item.expectedDocIds),
          reciprocalRank: computeReciprocalRank(
            naiveResults,
            item.expectedDocIds
          ),
          keywordCoverage: computeKeywordCoverage(
            naiveResults,
            item.expectedKeywords
          ),
          latencyMs: Math.round(naiveLatency * 100) / 100,
          topResults: naiveResults.map((r) => ({
            docId: r.docId,
            score: Math.round(r.score * 10000) / 10000,
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
          latencyMs: Math.round(miniLatency * 100) / 100,
          topResults: miniResults.map((r) => ({
            docId: r.docId,
            score: Math.round(r.score * 10000) / 10000,
          })),
        },
      },
    };

    results.push(evalResult);

    // Print progress
    const c = evalResult.modes.chunked.hit ? "✅" : "❌";
    const n = evalResult.modes.naive.hit ? "✅" : "❌";
    const m = evalResult.modes.minisearch.hit ? "✅" : "❌";
    console.log(
      `${item.id} [${item.category}] chunked=${c} naive=${n} mini=${m}`
    );
  }

  // --- Aggregate metrics ---
  const summary = {
    config: {
      topK,
      evalItems: evalSet.length,
      positiveItems: evalSet.filter((e) => e.expectedDocIds.length > 0).length,
      negativeItems: evalSet.filter((e) => e.expectedDocIds.length === 0)
        .length,
    },
    metrics: {
      chunked: aggregateMetrics(results, "chunked", chunkedIndex.length),
      naive: aggregateMetrics(results, "naive", naiveIndex.length),
      minisearch: aggregateMetrics(results, "minisearch", miniSearchDocs.length),
    },
    byCategory: {} as Record<
      string,
      {
        chunked: { hitRate: number; mrr: number };
        naive: { hitRate: number; mrr: number };
        minisearch: { hitRate: number; mrr: number };
      }
    >,
    details: results,
  };

  // --- Per-category breakdown ---
  const categories = [...new Set(evalSet.map((e) => e.category))];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const positive = catResults.filter((r) => r.expectedDocIds.length > 0);
    if (positive.length === 0) continue;

    summary.byCategory[cat] = {
      chunked: {
        hitRate:
          positive.filter((r) => r.modes.chunked.hit).length /
          positive.length,
        mrr:
          positive.reduce((s, r) => s + r.modes.chunked.reciprocalRank, 0) /
          positive.length,
      },
      naive: {
        hitRate:
          positive.filter((r) => r.modes.naive.hit).length / positive.length,
        mrr:
          positive.reduce((s, r) => s + r.modes.naive.reciprocalRank, 0) /
          positive.length,
      },
      minisearch: {
        hitRate:
          positive.filter((r) => r.modes.minisearch.hit).length /
          positive.length,
        mrr:
          positive.reduce(
            (s, r) => s + r.modes.minisearch.reciprocalRank,
            0
          ) / positive.length,
      },
    };
  }

  // --- Print summary table ---
  console.log("\n" + "=".repeat(72));
  console.log("  RAG EVALUATION RESULTS");
  console.log("=".repeat(72));

  const fmt = (n: number) => (n * 100).toFixed(1) + "%";
  const fmtMs = (n: number) => n.toFixed(1) + "ms";

  console.log(
    `\n${"Metric".padEnd(24)} ${"Chunked RAG".padEnd(16)} ${"Naive RAG".padEnd(16)} ${"MiniSearch".padEnd(16)}`
  );
  console.log("-".repeat(72));

  const m = summary.metrics;
  console.log(
    `${"Hit Rate @" + topK}`.padEnd(24) +
    ` ${fmt(m.chunked.hitRate).padEnd(16)} ${fmt(m.naive.hitRate).padEnd(16)} ${fmt(m.minisearch.hitRate).padEnd(16)}`
  );
  console.log(
    `${"MRR"}`.padEnd(24) +
    ` ${fmt(m.chunked.mrr).padEnd(16)} ${fmt(m.naive.mrr).padEnd(16)} ${fmt(m.minisearch.mrr).padEnd(16)}`
  );
  console.log(
    `${"Keyword Coverage"}`.padEnd(24) +
    ` ${fmt(m.chunked.avgKeywordCoverage).padEnd(16)} ${fmt(m.naive.avgKeywordCoverage).padEnd(16)} ${fmt(m.minisearch.avgKeywordCoverage).padEnd(16)}`
  );
  console.log(
    `${"Avg Latency"}`.padEnd(24) +
    ` ${fmtMs(m.chunked.avgLatencyMs).padEnd(16)} ${fmtMs(m.naive.avgLatencyMs).padEnd(16)} ${fmtMs(m.minisearch.avgLatencyMs).padEnd(16)}`
  );
  console.log(
    `${"P95 Latency"}`.padEnd(24) +
    ` ${fmtMs(m.chunked.p95LatencyMs).padEnd(16)} ${fmtMs(m.naive.p95LatencyMs).padEnd(16)} ${fmtMs(m.minisearch.p95LatencyMs).padEnd(16)}`
  );
  console.log(
    `${"Total Chunks"}`.padEnd(24) +
    ` ${String(m.chunked.totalChunks).padEnd(16)} ${String(m.naive.totalChunks).padEnd(16)} ${String(m.minisearch.totalChunks).padEnd(16)}`
  );

  // --- Category breakdown ---
  console.log("\n📊 Per-Category Hit Rate:");
  console.log("-".repeat(72));
  console.log(
    `${"Category".padEnd(24)} ${"Chunked".padEnd(16)} ${"Naive".padEnd(16)} ${"MiniSearch".padEnd(16)}`
  );
  console.log("-".repeat(72));

  for (const [cat, data] of Object.entries(summary.byCategory)) {
    console.log(
      `${cat.padEnd(24)} ${fmt(data.chunked.hitRate).padEnd(16)} ${fmt(data.naive.hitRate).padEnd(16)} ${fmt(data.minisearch.hitRate).padEnd(16)}`
    );
  }

  // --- Improvement summary ---
  console.log("\n📈 Chunked vs Naive Improvement:");
  const hitImprove = m.chunked.hitRate - m.naive.hitRate;
  const mrrImprove = m.chunked.mrr - m.naive.mrr;
  console.log(
    `  Hit Rate: ${hitImprove >= 0 ? "+" : ""}${fmt(hitImprove)} (${fmt(m.naive.hitRate)} → ${fmt(m.chunked.hitRate)})`
  );
  console.log(
    `  MRR:      ${mrrImprove >= 0 ? "+" : ""}${fmt(mrrImprove)} (${fmt(m.naive.mrr)} → ${fmt(m.chunked.mrr)})`
  );

  // --- Write results ---
  await writeFile(outputFile, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`\n💾 Full results written to ${outputFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});