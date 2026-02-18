import type { CollectionEntry } from "astro:content";
import getSortedPosts from "./getSortedPosts";
import { slugifyAll } from "./slugify";
import type { LocaleCode } from "@utils/locale";

const getPostsByTag = (
  posts: CollectionEntry<"blog">[],
  tag: string,
  locale: LocaleCode = "ko"
) =>
  getSortedPosts(
    posts.filter(post => slugifyAll(post.data.tags).includes(tag)),
    locale
  );

export default getPostsByTag;
