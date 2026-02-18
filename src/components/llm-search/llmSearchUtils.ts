import type { BlogPost } from "./types";

const SOURCES_START = "<!-- SOURCES_START -->";
const SOURCES_END = "<!-- SOURCES_END -->";

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function titleFromSlug(slug: string) {
  const cleaned = slug
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+|\/+$/g, "");
  const lastSegment = cleaned.split("/").filter(Boolean).pop();
  if (!lastSegment) return "Untitled";

  return lastSegment
    .split("-")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isMeaningfulTitle(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  const compact = normalized.replace(/[^a-z0-9가-힣]/g, "");
  const placeholders = new Set(["untitled", "notitle", "제목없음", "제목미정"]);

  return !placeholders.has(compact);
}

export function getDisplayTitle(post: BlogPost, locale?: "ko" | "en") {
  // locale이 en이고 titleEn이 있으면 영어 제목 사용
  if (locale === "en" && post.titleEn && isMeaningfulTitle(post.titleEn)) {
    return post.titleEn.trim();
  }

  // 기본 제목 사용
  if (isMeaningfulTitle(post.title)) return post.title.trim();

  const fallback = titleFromSlug(post.slug);
  if (isMeaningfulTitle(fallback)) return fallback;

  return post.slug || "Untitled";
}

function normalizeSources(rawSources: unknown): BlogPost[] {
  if (!Array.isArray(rawSources)) return [];

  return rawSources
    .map((raw): BlogPost | null => {
      if (!raw || typeof raw !== "object") return null;

      const candidate = raw as Record<string, unknown>;
      const slug =
        typeof candidate.slug === "string"
          ? candidate.slug
          : typeof candidate.url === "string"
            ? candidate.url
            : typeof candidate.path === "string"
              ? candidate.path
              : "";

      if (!slug) return null;

      const title =
        typeof candidate.title === "string"
          ? candidate.title
          : typeof candidate.name === "string"
            ? candidate.name
            : typeof candidate.postTitle === "string"
              ? candidate.postTitle
              : "";

      const titleEn =
        typeof candidate.titleEn === "string" ? candidate.titleEn : undefined;

      return {
        slug,
        title: isMeaningfulTitle(title) ? title.trim() : titleFromSlug(slug),
        titleEn,
      };
    })
    .filter((source): source is BlogPost => source !== null);
}

export function parseResponse(text: string): {
  content: string;
  sources: BlogPost[];
} {
  if (text.includes(SOURCES_START) && text.includes(SOURCES_END)) {
    const startIdx = text.indexOf(SOURCES_START) + SOURCES_START.length;
    const endIdx = text.indexOf(SOURCES_END);
    const content = text
      .slice(text.indexOf(SOURCES_END) + SOURCES_END.length)
      .trim();

    try {
      const sources = normalizeSources(
        JSON.parse(text.slice(startIdx, endIdx))
      );
      return { content, sources };
    } catch {
      return { content, sources: [] };
    }
  }

  if (text.includes("<!-- SOURCES -->")) {
    const [content, sourcesRaw] = text.split("<!-- SOURCES -->");
    try {
      return {
        content: content.trim(),
        sources: normalizeSources(JSON.parse(sourcesRaw.trim())),
      };
    } catch {
      return { content: content.trim(), sources: [] };
    }
  }

  return { content: text, sources: [] };
}

export function linkifySources(
  content: string,
  sources: BlogPost[],
  locale?: "ko" | "en"
): string {
  if (!sources || sources.length === 0) return content;

  const sourceByNumber = (num: number) => sources[num - 1];
  const sourceLabel = locale === "en" ? "Source" : "출처";

  const pattern =
    /\((?:Source|출처)\s*((?:\d+\s*,\s*)*\d+)\)|\(?(?:\[?(?:Source|출처)\s*\[?(\d+)\]?\]?(?:\s*[""]([^"""]*)[""])?)\)?/gi;

  return content.replace(
    pattern,
    (original, groupedNums, singleNum, quotedText) => {
      if (groupedNums) {
        const links = String(groupedNums)
          .split(",")
          .map(part => parseInt(part.trim(), 10))
          .filter(num => !Number.isNaN(num))
          .map(num => {
            const source = sourceByNumber(num);
            return source ? `[${sourceLabel} ${num}](${source.slug})` : null;
          })
          .filter((link): link is string => Boolean(link));

        return links.length > 0 ? links.join(", ") : original;
      }

      const num = parseInt(String(singleNum), 10);
      const source = sourceByNumber(num);
      if (!source) return original;

      const label = quotedText ? quotedText : `${sourceLabel} ${num}`;
      return `[${label}](${source.slug})`;
    }
  );
}
