import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";
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
      .replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function loadEnv() {
  await loadEnvFile(path.join(root, ".env.development"));
}

// ============================================================
// Utilities
// ============================================================

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

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter = match?.[1] ?? "";
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "");

  const title =
    frontmatter.match(/^title:\s*(.*)$/m)?.[1]?.replace(/^['"]|['"]$/g, "") ??
    "Untitled";

  const description =
    frontmatter.match(/^description:\s*(.*)$/m)?.[1]?.replace(/^['"]|['"]$/g, "") ?? "";

  const titleEnRaw =
    frontmatter.match(/^titleEn:\s*(.*)$/m)?.[1]?.replace(/^['"]|['"]$/g, "");
  const titleEn = titleEnRaw || undefined;

  return { title, titleEn, description, body };
}

// ============================================================
// Document loaders
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
      url: `/posts/${slug}/`,
      content: body,
    });
  }

  return docs;
}

async function loadCustomDocuments(): Promise<RAGDocument[]> {
  const raw = await readFile(customDocsFile, "utf-8").catch(() => "[]");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) return [];

  return parsed.map((doc: any) => ({
    id: String(doc.id),
    title: String(doc.title),
    ...(doc.titleEn ? { titleEn: String(doc.titleEn) } : {}),
    description: String(doc.description ?? ""),
    tags: Array.isArray(doc.tags) ? doc.tags : ["custom"],
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
  if (!apiKey) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");

  const batchSize = parseInt(process.env.RAG_EMBEDDING_BATCH_SIZE ?? "100", 10);

  const [blogDocs, customDocs] = await Promise.all([
    loadBlogDocuments(),
    loadCustomDocuments(),
  ]);

  const allDocs = [...blogDocs, ...customDocs];

  const documents = allDocs.map(doc => ({
    id: doc.id,
    docId: doc.id,
    text: [doc.title, doc.description, doc.content]
      .filter(Boolean)
      .join("\n\n"),
    metadata: {
      title: doc.title,
      ...(doc.titleEn ? { titleEn: doc.titleEn } : {}),
      tags: doc.tags ?? [],
      url: doc.url,
    },
  }));

  console.log(`Total documents: ${documents.length}`);

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google.embeddingModel(DEFAULT_EMBEDDING_MODEL);

  const allEmbeddings: number[][] = [];
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    console.log(`Embedding batch ${i / batchSize + 1}`);
    const result = await embedMany({
      model,
      values: batch.map(d => d.text),
    });
    allEmbeddings.push(...result.embeddings);
  }

  const embedded = documents.map((doc, i) => ({
    ...doc,
    embedding: allEmbeddings[i],
  }));

  await writeFile(outFile, JSON.stringify(embedded), "utf-8");
  console.log(`RAG index written to ${outFile}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});