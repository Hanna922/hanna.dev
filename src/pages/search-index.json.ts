import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { slugifyStr } from "@utils/slugify";
import { getLocaleFromValue } from "@utils/locale";
import { getLocalizedPosts } from "@utils/localizedPosts";

function stripMarkdown(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePostPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export const GET: APIRoute = async ({ request }) => {
  const posts = await getCollection("blog");
  const locale =
    getLocaleFromValue(new URL(request.url).searchParams.get("lang")) ?? "ko";
  const localizedPosts = getLocalizedPosts(posts, locale);

  const docs = localizedPosts.map(post => {
    const { title, description, tags, canonicalURL } = post.data;

    const rawPath = canonicalURL ?? `/posts/${post.slug ?? slugifyStr(title)}`;
    const path = normalizePostPath(rawPath);

    const content = stripMarkdown(post.body ?? "");

    return {
      id: post.id ?? slugifyStr(title),
      title,
      description: description ?? "",
      tags: tags ?? [],
      path,
      content,
      excerpt: content.slice(0, 1200),
    };
  });

  return new Response(JSON.stringify(docs), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
