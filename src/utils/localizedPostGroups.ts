import type { CollectionEntry } from "astro:content";
import postFilter from "./postFilter";

const EN_ENTRY_SUFFIX = ".en.md";
const MD_ENTRY_SUFFIX = ".md";

function getSortTimestamp(post: CollectionEntry<"blog">): number {
  const datetime = post.data.modDatetime ?? post.data.pubDatetime;
  return Math.floor(new Date(datetime).getTime() / 1000);
}

export function isEnglishEntryId(id: string): boolean {
  return id.replace(/\\/g, "/").endsWith(EN_ENTRY_SUFFIX);
}

export function getPostBaseId(id: string): string {
  const normalizedId = id.replace(/\\/g, "/");

  if (normalizedId.endsWith(EN_ENTRY_SUFFIX)) {
    return normalizedId.slice(0, -EN_ENTRY_SUFFIX.length);
  }

  if (normalizedId.endsWith(MD_ENTRY_SUFFIX)) {
    return normalizedId.slice(0, -MD_ENTRY_SUFFIX.length);
  }

  return normalizedId;
}

export interface LocalizedPostGroup {
  baseId: string;
  posts: CollectionEntry<"blog">[];
}

export function getLocalizedPostGroups(
  posts: CollectionEntry<"blog">[]
): LocalizedPostGroup[] {
  const sortedPosts = posts
    .filter(postFilter)
    .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));

  const groupedPosts = new Map<string, LocalizedPostGroup>();

  for (const post of sortedPosts) {
    const baseId = getPostBaseId(post.id);
    const existing = groupedPosts.get(baseId);

    if (!existing) {
      groupedPosts.set(baseId, { baseId, posts: [post] });
      continue;
    }

    existing.posts.push(post);
  }

  return Array.from(groupedPosts.values()).map(group => ({
    ...group,
    posts: [...group.posts].sort((a, b) => {
      const aIsEnglish = isEnglishEntryId(a.id);
      const bIsEnglish = isEnglishEntryId(b.id);

      if (aIsEnglish === bIsEnglish) return 0;
      return aIsEnglish ? 1 : -1;
    }),
  }));
}
