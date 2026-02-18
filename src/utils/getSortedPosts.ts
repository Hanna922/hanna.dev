import type { CollectionEntry } from "astro:content";
import postFilter from "./postFilter";
import { getLocalizedPosts } from "./localizedPosts";
import type { LocaleCode } from "@utils/locale";

const getSortedPosts = (
  posts: CollectionEntry<"blog">[],
  locale: LocaleCode = "ko"
) => {
  const localizedPosts = getLocalizedPosts(posts, locale);
  const localizedPostSet = new Set(localizedPosts);
  return posts
    .filter(postFilter)
    .filter(post => localizedPostSet.has(post))
    .sort(
      (a, b) =>
        Math.floor(
          new Date(b.data.modDatetime ?? b.data.pubDatetime).getTime() / 1000
        ) -
        Math.floor(
          new Date(a.data.modDatetime ?? a.data.pubDatetime).getTime() / 1000
        )
    );
};

export default getSortedPosts;
