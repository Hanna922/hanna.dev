import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { slugifyStr } from "@utils/slugify";

function stripMarkdown(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const GET: APIRoute = async () => {
  const posts = await getCollection("blog");

  const docs = posts.map(post => {
    const { title, description, tags, canonicalURL } = post.data;

    // URL 규칙은 프로젝트 라우팅에 맞게 조정하세요.
    // 가장 안전한 우선순위: canonicalURL > /posts/{post.slug} > /posts/{slugifyStr(title)}
    const path = canonicalURL ?? `/posts/${post.slug ?? slugifyStr(title)}`; // slug가 없으면 title 기반으로 생성

    const content = stripMarkdown(post.body ?? "");

    // description, tags, canonicalURL은 optional이므로 기본값 처리
    return {
      id: post.id ?? post ?? slugifyStr(title),
      title,
      description: description ?? "",
      tags: tags ?? [],
      path,
      // MiniSearch 검색용 텍스트
      content,
      // LLM에 넣을 때 과도하게 커지지 않게 일부만 저장(원하면 조절)
      excerpt: content.slice(0, 1200),
    };
  });

  return new Response(JSON.stringify(docs), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // 정적 파일이므로 적극 캐싱도 가능(원하면 조정)
      "cache-control": "public, max-age=3600",
    },
  });
};
