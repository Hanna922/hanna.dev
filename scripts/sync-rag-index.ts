import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";
import { chunkDocuments } from "../src/lib/rag/chunking";
import type { RAGDocument } from "../src/lib/rag/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const blogDir = path.join(root, "src", "content", "blog");
const customDocsFile = path.join(root, "src", "content", "rag", "custom-documents.json");
const outFile = path.join(root, "public", "rag-index.json");
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

// ============================================================
// Env loading
// ============================================================

async function loadEnvFile(filePath: string) {
  const raw = await readFile(filePath, "utf-8").catch(() => "");
  if (!raw) return;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^['\"]|['\"]$/g, "");

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
// Utilities
// ============================================================

function normalizeEmbeddingModel(value: string | undefined): string {
  if (!value) return DEFAULT_EMBEDDING_MODEL;
  const normalized = value.trim();
  if (normalized === "gemini-embedding-001") return DEFAULT_EMBEDDING_MODEL;
  return normalized;
}

function slugify(input: string): string {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(entry => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : Promise.resolve([full]);
    })
  );
  return files.flat().filter(file => file.endsWith(".md") || file.endsWith(".mdx"));
}

function parseFrontmatter(raw: string): {
  title: string;
  titleEn?: string;
  description: string;
  body: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter = match?.[1] ?? "";
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "");

  const title =
    frontmatter.match(/^title:\s*(.*)$/m)?.[1]?.replace(/^['\"]|['\"]$/g, "") ??
    "Untitled";

  const description =
    frontmatter.match(/^description:\s*(.*)$/m)?.[1]?.replace(/^['\"]|['\"]$/g, "") ?? "";

  const titleEnRaw =
    frontmatter.match(/^titleEn:\s*(.*)$/m)?.[1]?.replace(/^['\"]|['\"]$/g, "");
  const titleEn = titleEnRaw || undefined;

  return { title, titleEn, description, body };
}

// ============================================================
// Document loaders — returns RAGDocument[] for chunkDocuments()
// ============================================================

async function loadBlogDocuments(): Promise<RAGDocument[]> {
  const files = await walk(blogDir);
  const docs: RAGDocument[] = [];

  for (const file of files) {
    const raw = await readFile(file, "utf-8");
    const { title, titleEn, description, body } = parseFrontmatter(raw);
    const slug = path.basename(file).replace(/\.mdx?$/, "");

    docs.push({
      id: slug,
      title,
      ...(titleEn ? { titleEn } : {}),
      description,
      tags: [],
      url: `/posts/${slug || slugify(title)}/`,
      content: body,
    });
  }

  return docs;
}

async function loadCustomDocuments(): Promise<RAGDocument[]> {
  const raw = await readFile(customDocsFile, "utf-8").catch(() => "[]");
  const parsed = JSON.parse(raw) as unknown[];
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((doc): doc is Record<string, unknown> =>
      typeof doc === "object" && doc !== null &&
      typeof (doc as Record<string, unknown>).title === "string" &&
      typeof (doc as Record<string, unknown>).content === "string"
    )
    .map(doc => ({
      id: String(doc.id || `custom:${slugify(String(doc.title))}`),
      title: String(doc.title),
      ...(doc.titleEn ? { titleEn: String(doc.titleEn) } : {}),
      description: String(doc.description ?? ""),
      tags: Array.isArray(doc.tags) ? (doc.tags as unknown[]).map(String) : ["custom"],
      url: String(doc.url ?? `/rag/custom/${doc.id}/`),
      content: String(doc.content),
    }));
}

// ============================================================
// Main
// ============================================================

async function main() {
  await loadEnv();

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      [
        "Missing GOOGLE_GENERATIVE_AI_API_KEY.",
        "Set it in your shell or in one of: .env, .env.local, .env.development, .env.development.local",
      ].join(" ")
    );
  }

  const chunkSize = parseInt(process.env.RAG_CHUNK_SIZE ?? "700", 10);
  const chunkOverlap = parseInt(process.env.RAG_CHUNK_OVERLAP ?? "120", 10);
  const batchSize = parseInt(process.env.RAG_EMBEDDING_BATCH_SIZE ?? "100", 10);
  const modelName = normalizeEmbeddingModel(process.env.RAG_EMBEDDING_MODEL);

  console.log(`chunkSize=${chunkSize}, chunkOverlap=${chunkOverlap}`);

  const [blogDocs, customDocs] = await Promise.all([
    loadBlogDocuments(),
    loadCustomDocuments(),
  ]);

  const chunks = chunkDocuments([...blogDocs, ...customDocs], { chunkSize, chunkOverlap });

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google.textEmbeddingModel(modelName as "gemini-embedding-001");

  console.log(`embeddingModel=${modelName}`);
  console.log(`total chunks to embed=${chunks.length}, batchSize=${batchSize}`);

  const allEmbeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    console.log(
      `  embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} (${batch.length} chunks)...`
    );
    const result = await embedMany({
      model,
      values: batch.map(chunk => chunk.text),
    });
    allEmbeddings.push(...result.embeddings);
  }

  const embedded = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: allEmbeddings[index],
  }));

  await writeFile(outFile, JSON.stringify(embedded), "utf-8");
  console.log(`RAG index written to ${outFile}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
