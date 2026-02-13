import { getCollection, type CollectionEntry } from "astro:content";
import postFilter from "@utils/postFilter";

const getPublishedPosts = async (): Promise<CollectionEntry<"blog">[]> => {
  const posts = await getCollection("blog");
  return posts.filter(postFilter);
};

export default getPublishedPosts;
