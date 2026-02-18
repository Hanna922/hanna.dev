import { slugifyStr } from "@utils/slugify";
import { getPostBaseId, isEnglishEntryId } from "@utils/localizedPostGroups";
import Datetime from "./Datetime";
import type { CollectionEntry } from "astro:content";

export interface Props {
  href?: string;
  frontmatter: CollectionEntry<"blog">["data"];
  secHeading?: boolean;
  entryId?: string;
}

function resolvePostLocaleMeta(entryId?: string) {
  if (!entryId) {
    return { base: undefined, locale: undefined };
  }

  const normalizedId = entryId.replace(/\\/g, "/");

  if (!normalizedId.endsWith(".md")) {
    return { base: normalizedId, locale: undefined };
  }

  return {
    base: getPostBaseId(entryId),
    locale: isEnglishEntryId(entryId) ? "en" : "ko",
  };
}

export default function Article({
  href,
  frontmatter,
  secHeading = true,
  entryId,
}: Props) {
  const { title, pubDatetime, modDatetime, description } = frontmatter;
  const postMeta = resolvePostLocaleMeta(entryId);

  const headerProps = {
    style: { viewTransitionName: slugifyStr(title) },
    className: "text-lg font-medium decoration-dashed hover:underline",
  };

  return (
    <li
      className="my-6"
      data-post-item={postMeta.base ? "true" : undefined}
      data-post-base={postMeta.base}
      data-post-locale={postMeta.locale}
    >
      <a
        href={href}
        className="inline-block text-lg font-medium text-skin-accent decoration-dashed underline-offset-4 focus-visible:no-underline focus-visible:underline-offset-0"
      >
        {secHeading ? (
          <h2 {...headerProps}>{title}</h2>
        ) : (
          <h3 {...headerProps}>{title}</h3>
        )}
      </a>
      <Datetime pubDatetime={pubDatetime} modDatetime={modDatetime} />
      <p>{description}</p>
    </li>
  );
}
