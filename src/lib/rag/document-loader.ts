import { getCollection } from "astro:content";
import { slugifyStr } from "@utils/slugify";
import type { RAGDocument } from "./types";

interface CustomRAGDocumentInput {
  id?: string;
  title: string;
  description?: string;
  tags?: string[];
  url?: string;
  content: string;
}

function normalizePostPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export async function loadBlogDocuments(): Promise<RAGDocument[]> {
  const posts = await getCollection("blog", ({ data }) => !data.draft);

  return posts.map(post => {
    const { title, description, tags, canonicalURL } = post.data;
    const rawPath = canonicalURL ?? `/posts/${post.slug ?? slugifyStr(title)}`;

    return {
      id: post.id ?? slugifyStr(title),
      title,
      description: description ?? "",
      tags: tags ?? [],
      url: normalizePostPath(rawPath),
      content: post.body ?? "",
      source: "blog",
    };
  });
}

export async function loadCustomDocuments(): Promise<RAGDocument[]> {
  const module = (await import("../../content/rag/custom-documents.json").catch(
    () => null
  )) as { default?: CustomRAGDocumentInput[] } | null;

  const entries = module?.default ?? [];

  return entries
    .filter(entry => entry.title && entry.content)
    .map(entry => {
      const id = entry.id?.trim() || `custom:${slugifyStr(entry.title)}`;

      return {
        id,
        title: entry.title,
        description: entry.description ?? "",
        tags: entry.tags ?? ["custom"],
        url: entry.url ?? `/rag/custom/${id}/`,
        content: entry.content,
        source: "custom" as const,
      };
    });
}

export async function loadRAGDocuments(): Promise<RAGDocument[]> {
  const [blogDocs, customDocs] = await Promise.all([
    loadBlogDocuments(),
    loadCustomDocuments(),
  ]);

  return [...blogDocs, ...customDocs];
}
