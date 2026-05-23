import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CanonicalRagDocument {
  docId: string;
  baseSlug: string;
  locale: "ko" | "en" | "neutral";
  title: string;
  titleEn?: string;
  description: string;
  url: string;
  tags: string[];
  sourceType: "blog" | "custom";
  publishedAt?: string;
  fullText: string;
}

interface CustomRagDocumentInput {
  id?: string;
  title: string;
  titleEn?: string;
  description?: string;
  tags?: string[];
  url?: string;
  content: string;
  publishedAt?: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../../..");
const blogDir = path.join(root, "src", "content", "blog");
const customDocsFile = path.join(root, "src", "content", "rag", "custom-documents.json");

export async function loadCanonicalRagDocuments(): Promise<CanonicalRagDocument[]> {
  const [blogDocuments, customDocuments] = await Promise.all([
    loadCanonicalBlogDocuments(),
    loadCanonicalCustomDocuments(),
  ]);

  return [...blogDocuments, ...customDocuments];
}

async function loadCanonicalBlogDocuments(): Promise<CanonicalRagDocument[]> {
  const files = await walkMarkdownFiles(blogDir);

  return Promise.all(
    files.map(async file => {
      const raw = await readFile(file, "utf-8");
      const { title, titleEn, description, tags, canonicalURL, body, publishedAt } =
        parseFrontmatter(raw);
      const slug = path.basename(file).replace(/\.mdx?$/, "");

      return {
        docId: slug,
        baseSlug: baseSlugFromSlug(slug),
        locale: localeFromSlug(slug),
        title,
        ...(titleEn ? { titleEn } : {}),
        description,
        url: normalizePath(canonicalURL ?? `/posts/${slug}`),
        tags,
        sourceType: "blog" as const,
        ...(publishedAt ? { publishedAt } : {}),
        fullText: buildFullText({
          title,
          titleEn,
          description,
          content: body,
          publishedAt,
        }),
      };
    })
  );
}

async function loadCanonicalCustomDocuments(): Promise<CanonicalRagDocument[]> {
  const raw = await readFile(customDocsFile, "utf-8").catch(() => "[]");
  const parsed = JSON.parse(raw) as CustomRagDocumentInput[];

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(doc => doc.title && doc.content)
    .map(doc => {
      const docId = String(doc.id ?? "").trim() || slugify(doc.title);
      const publishedAt = normalizePublishedAt(doc.publishedAt);

      return {
        docId,
        baseSlug: docId,
        locale: "neutral" as const,
        title: doc.title,
        ...(doc.titleEn ? { titleEn: doc.titleEn } : {}),
        description: doc.description ?? "",
        url: doc.url ?? `/rag/custom/${docId}/`,
        tags: doc.tags ?? ["custom"],
        sourceType: "custom" as const,
        ...(publishedAt ? { publishedAt } : {}),
        fullText: buildFullText({
          title: doc.title,
          titleEn: doc.titleEn,
          description: doc.description ?? "",
          content: doc.content,
          publishedAt,
        }),
      };
    });
}

async function walkMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(entry => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory()
        ? walkMarkdownFiles(fullPath)
        : Promise.resolve([fullPath]);
    })
  );

  return files
    .flat()
    .filter(file => file.endsWith(".md") || file.endsWith(".mdx"));
}

function parseFrontmatter(raw: string) {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter = frontmatterMatch?.[1] ?? "";
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();

  const title = parseSingleLine(frontmatter, "title") ?? "Untitled";
  const titleEn = parseSingleLine(frontmatter, "titleEn");
  const description = parseSingleLine(frontmatter, "description") ?? "";
  const canonicalURL = parseSingleLine(frontmatter, "canonicalURL");
  const publishedAt = normalizePublishedAt(parseSingleLine(frontmatter, "pubDatetime"));
  const tags = parseStringList(frontmatter, "tags");

  return {
    title,
    titleEn,
    description,
    canonicalURL,
    body,
    publishedAt,
    tags,
  };
}

function parseSingleLine(frontmatter: string, fieldName: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${fieldName}:\\s*(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) {
    return undefined;
  }
  return value.replace(/^['"]|['"]$/g, "");
}

function parseStringList(frontmatter: string, fieldName: string): string[] {
  const inlineMatch = frontmatter.match(new RegExp(`^${fieldName}:\\s*\\[(.*)\\]\\s*$`, "m"));
  if (inlineMatch?.[1]) {
    return inlineMatch[1]
      .split(",")
      .map(item => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  const blockMatch = frontmatter.match(
    new RegExp(`^${fieldName}:\\s*\\n((?:\\s*-\\s*.*\\n?)*)`, "m")
  );
  if (!blockMatch?.[1]) {
    return [];
  }

  return blockMatch[1]
    .split(/\r?\n/)
    .map(line => line.match(/^\s*-\s*(.*)$/)?.[1]?.trim())
    .map(value => value?.replace(/^['"]|['"]$/g, ""))
    .filter((value): value is string => Boolean(value));
}

function buildFullText(input: {
  title: string;
  titleEn?: string;
  description: string;
  content: string;
  publishedAt?: string;
}) {
  return [
    input.publishedAt ? `Published: ${input.publishedAt}` : "",
    input.title,
    input.titleEn ? `English Title: ${input.titleEn}` : "",
    input.description,
    input.content,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function localeFromSlug(slug: string): "ko" | "en" {
  return slug.endsWith(".en") ? "en" : "ko";
}

function baseSlugFromSlug(slug: string) {
  return slug.endsWith(".en") ? slug.slice(0, -3) : slug;
}

function normalizePath(rawPath: string) {
  if (/^https?:\/\//.test(rawPath)) {
    return rawPath;
  }

  const normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function normalizePublishedAt(rawValue?: string) {
  if (!rawValue) {
    return undefined;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
