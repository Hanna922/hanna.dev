import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const blogDir = path.join(root, "src", "content", "blog");
const customDocsFile = path.join(root, "src", "content", "rag", "custom-documents.json");
const outFile = path.join(root, "public", "rag-index.json");
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

async function loadEnvFile(filePath) {
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

function normalizeEmbeddingModel(value) {
  if (!value) return DEFAULT_EMBEDDING_MODEL;
  const normalized = String(value).trim();

  if (normalized === "gemini-embedding-001") {
    return DEFAULT_EMBEDDING_MODEL;
  }

  return normalized;
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(entry => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    })
  );

  return files.flat().filter(file => file.endsWith(".md") || file.endsWith(".mdx"));
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter = match?.[1] ?? "";
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "");

  const title =
    frontmatter.match(/^title:\s*(.*)$/m)?.[1]?.replace(/^['\"]|['\"]$/g, "") ??
    "Untitled";

  const titleEnRaw =
    frontmatter.match(/^titleEn:\s*(.*)$/m)?.[1]?.replace(/^['\"]|['\"]$/g, "");
  const titleEn = titleEnRaw || undefined;

  return { title, titleEn, body };
}

async function loadCustomDocuments() {
  const raw = await readFile(customDocsFile, "utf-8").catch(() => "[]");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(doc => doc?.title && doc?.content)
    .map(doc => {
      const id = String(doc.id || `custom:${slugify(doc.title)}`);
      const title = String(doc.title);
      const titleEn = doc.titleEn ? String(doc.titleEn) : undefined;
      const description = String(doc.description || "");
      const content = String(doc.content);
      const tags = Array.isArray(doc.tags) ? doc.tags.map(String) : ["custom"];
      const url = String(doc.url || `/rag/custom/${id}/`);

      return {
        id,
        docId: id,
        text: `${title}\n\n${description}\n\n${content}`,
        metadata: {
          title,
          ...(titleEn ? { titleEn } : {}),
          tags,
          url,
        },
      };
    });
}

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

  const modelName = normalizeEmbeddingModel(process.env.RAG_EMBEDDING_MODEL);
  const files = await walk(blogDir);
  const chunks = [];

  for (const file of files) {
    const raw = await readFile(file, "utf-8");
    const { title, titleEn, body } = parseFrontmatter(raw);
    const slug = path.basename(file).replace(/\.mdx?$/, "");

    chunks.push({
      id: slug,
      docId: slug,
      text: `${title}\n\n${body}`,
      metadata: {
        title,
        ...(titleEn ? { titleEn } : {}),
        tags: [],
        url: `/posts/${slugify(slug || title)}/`,
      },
    });
  }

  const customChunks = await loadCustomDocuments();
  chunks.push(...customChunks);

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google.textEmbeddingModel(modelName);
  console.log(`embeddingModel=${modelName}`);
  const result = await embedMany({
    model,
    values: chunks.map(chunk => chunk.text),
  });

  const embedded = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: result.embeddings[index],
  }));

  await writeFile(outFile, JSON.stringify(embedded), "utf-8");
  console.log(`RAG index written to ${outFile}`);
  console.log(`chunks=${chunks.length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
