import type { CollectionEntry } from "astro:content";
import type { LocaleCode } from "@utils/locale";

const EN_SLUG_SUFFIX = ".en";
const EN_COMPACT_SUFFIX = "en";
const EN_ID_SUFFIX = ".en.md";

function isEnglishById(id: string): boolean {
  return id.replace(/\\/g, "/").endsWith(EN_ID_SUFFIX);
}

function getEnglishBaseSlugFromSlug(
  slug: string,
  allSlugs: Set<string>
): string | null {
  if (slug.endsWith(EN_SLUG_SUFFIX)) {
    return slug.slice(0, -EN_SLUG_SUFFIX.length);
  }

  if (slug.endsWith(EN_COMPACT_SUFFIX)) {
    const baseSlug = slug.slice(0, -EN_COMPACT_SUFFIX.length);
    if (baseSlug && allSlugs.has(baseSlug)) {
      return baseSlug;
    }
  }

  return null;
}

function getPostLocale(
  post: CollectionEntry<"blog">,
  allSlugs: Set<string>
): LocaleCode {
  if (isEnglishById(post.id)) {
    return "en";
  }

  return getEnglishBaseSlugFromSlug(post.slug, allSlugs) ? "en" : "ko";
}

function getBaseSlug(
  post: CollectionEntry<"blog">,
  allSlugs: Set<string>
): string {
  return getEnglishBaseSlugFromSlug(post.slug, allSlugs) ?? post.slug;
}

export function normalizeRequestedSlug(
  slug: string,
  allSlugs: Set<string>
): string {
  return getEnglishBaseSlugFromSlug(slug, allSlugs) ?? slug;
}

function isExplicitEnglishSlug(slug: string, allSlugs: Set<string>): boolean {
  return Boolean(getEnglishBaseSlugFromSlug(slug, allSlugs));
}

export function getLocalizedPosts(
  posts: CollectionEntry<"blog">[],
  locale: LocaleCode = "ko"
): CollectionEntry<"blog">[] {
  const allSlugs = new Set(posts.map(post => post.slug));
  const picked = new Map<string, CollectionEntry<"blog">>();

  for (const post of posts) {
    const baseSlug = getBaseSlug(post, allSlugs);
    const current = picked.get(baseSlug);
    const postLocale = getPostLocale(post, allSlugs);

    if (!current) {
      picked.set(baseSlug, post);
      continue;
    }

    const currentLocale = getPostLocale(current, allSlugs);
    if (currentLocale !== locale && postLocale === locale) {
      picked.set(baseSlug, post);
    }
  }

  return Array.from(picked.values());
}

export function getLocalizedPostBySlug(
  posts: CollectionEntry<"blog">[],
  slug: string,
  locale: LocaleCode = "ko"
): CollectionEntry<"blog"> | undefined {
  const allSlugs = new Set(posts.map(post => post.slug));
  const normalizedSlug = normalizeRequestedSlug(slug, allSlugs);
  const candidates = posts.filter(post => {
    const baseSlug = getBaseSlug(post, allSlugs);
    return (
      post.slug === slug ||
      post.slug === normalizedSlug ||
      baseSlug === normalizedSlug
    );
  });

  if (candidates.length === 0) {
    return (
      posts.find(post => post.slug === normalizedSlug) ??
      posts.find(post => post.slug === slug)
    );
  }

  const localized = candidates.find(
    post => getPostLocale(post, allSlugs) === locale
  );

  if (localized) {
    return localized;
  }

  if (locale === "ko" && isExplicitEnglishSlug(slug, allSlugs)) {
    const hasKoreanPost = candidates.some(
      post => getPostLocale(post, allSlugs) === "ko"
    );
    if (!hasKoreanPost) {
      return undefined;
    }
  }

  return candidates[0];
}
