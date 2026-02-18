import Fuse from "fuse.js";
import { useEffect, useMemo, useRef, type ChangeEvent, useState } from "react";
import Article from "@components/Article";
import type { CollectionEntry } from "astro:content";
import {
  getLocaleFromValue,
  t,
  type I18nParams,
  type LocaleCode,
} from "@utils/locale";

interface WindowWithLocaleContext {
  __BLOG_LOCALE_CONTEXT__?: {
    getLocale: () => LocaleCode;
    subscribe: (callback: (locale: LocaleCode) => void) => () => void;
    translate: (key: string, params?: I18nParams) => string;
  };
  __BLOG_INITIAL_LOCALE__?: LocaleCode;
}

declare global {
  interface Window extends WindowWithLocaleContext {}
}

function getInitialLocale(serverLocale: LocaleCode): LocaleCode {
  if (typeof window === "undefined") return serverLocale;
  return (
    getLocaleFromValue(
      (window as Window & { __BLOG_INITIAL_LOCALE__?: LocaleCode })
        .__BLOG_INITIAL_LOCALE__ ?? null
    ) ?? serverLocale
  );
}

export type SearchItem = {
  title: string;
  description: string;
  data: CollectionEntry<"blog">["data"];
  slug: string;
  baseId: string;
  locale: LocaleCode;
  entryId: string;
};

interface Props {
  searchList: SearchItem[];
  initialLocale?: LocaleCode;
}

interface SearchResult {
  item: SearchItem;
  refIndex: number;
}

export default function SearchBar({ searchList, initialLocale = "ko" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputVal, setInputVal] = useState("");
  const [locale, setLocale] = useState<LocaleCode>(
    getInitialLocale(initialLocale)
  );

  const isBrowser = typeof window !== "undefined";

  const getPostUrl = (slug: string) => {
    if (typeof window === "undefined") return `/posts/${slug}/`;
    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang");
    const suffix = lang ? `?lang=${lang}` : "";
    return `/posts/${slug}/${suffix}`;
  };

  const translate = (key: string, params?: I18nParams) =>
    isBrowser
      ? (window.__BLOG_LOCALE_CONTEXT__?.translate(key, params) ??
        t(locale, key, params))
      : t(locale, key, params);

  useEffect(() => {
    if (!isBrowser) return;

    const context = window.__BLOG_LOCALE_CONTEXT__;
    if (!context) {
      return;
    }

    setLocale(context.getLocale());
    return context.subscribe(nextLocale => {
      setLocale(nextLocale);
    });
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputVal(e.currentTarget.value);
  };

  const fuse = useMemo(
    () =>
      new Fuse(searchList, {
        keys: ["title", "description"],
        includeMatches: true,
        includeScore: true,
        minMatchCharLength: 2,
        threshold: 0.5,
      }),
    [searchList]
  );

  const entriesByBase = useMemo(() => {
    const grouped = new Map<
      string,
      Partial<Record<LocaleCode, SearchItem>> & { fallback?: SearchItem }
    >();

    for (const item of searchList) {
      const existing = grouped.get(item.baseId) ?? {};
      existing[item.locale] = item;
      if (!existing.fallback) existing.fallback = item;
      grouped.set(item.baseId, existing);
    }

    return grouped;
  }, [searchList]);

  const searchResults = useMemo<SearchResult[] | null>(() => {
    if (inputVal.length <= 1) return [];

    const rawResults = fuse.search(inputVal);
    const seenBaseIds = new Set<string>();
    const localizedResults: SearchResult[] = [];

    for (const result of rawResults) {
      const { baseId } = result.item;
      if (seenBaseIds.has(baseId)) continue;
      seenBaseIds.add(baseId);

      const variants = entriesByBase.get(baseId);
      const localizedItem =
        variants?.[locale] ?? variants?.fallback ?? result.item;

      localizedResults.push({
        item: localizedItem,
        refIndex: result.refIndex,
      });
    }

    return localizedResults;
  }, [entriesByBase, fuse, inputVal, locale]);

  useEffect(() => {
    const searchUrl = new URLSearchParams(window.location.search);
    const searchStr = searchUrl.get("q");
    if (searchStr) setInputVal(searchStr);

    setTimeout(function () {
      inputRef.current!.selectionStart = inputRef.current!.selectionEnd =
        searchStr?.length || 0;
    }, 50);
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);

    if (inputVal.length > 0) {
      searchParams.set("q", inputVal);
    } else {
      searchParams.delete("q");
    }

    const query = searchParams.toString();
    const newRelativePathQuery = query
      ? `${window.location.pathname}?${query}`
      : window.location.pathname;
    history.replaceState(history.state, "", newRelativePathQuery);
  }, [inputVal]);

  return (
    <>
      <label className="relative block">
        <span className="absolute inset-y-0 left-0 flex items-center pl-2 opacity-75">
          <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M19.023 16.977a35.13 35.13 0 0 1-1.367-1.384c-.372-.378-.596-.653-.596-.653l-2.8-1.337A6.962 6.962 0 0 0 16 9c0-3.859-3.14-7-7-7S2 5.141 2 9s3.14 7 7 7c1.763 0 3.37-.66 4.603-1.739l1.337 2.8s.275.224.653.596c.387.363.896.854 1.384 1.367l1.358 1.392.604.646 2.121-2.121-.646-.604c-.379-.372-.885-.866-1.391-1.36zM9 14c-2.757 0-5-2.243-5-5s2.243-5 5-5 5 2.243 5 5-2.243 5-5 5z"></path>
          </svg>
          <span className="sr-only" data-i18n="search.srOnly">
            Search
          </span>
        </span>
        <input
          className="block w-full rounded border border-skin-fill 
        border-opacity-40 bg-skin-fill py-3 pl-10
        pr-3 placeholder:italic placeholder:text-opacity-75 
        focus:border-skin-accent focus:outline-none"
          data-i18n="search.placeholder"
          data-i18n-placeholder="search.placeholder"
          placeholder={translate("search.placeholder")}
          type="text"
          name="search"
          value={inputVal}
          onChange={handleChange}
          autoComplete="off"
          ref={inputRef}
        />
      </label>

      {inputVal.length > 1 && (
        <div className="mt-8">
          {translate(
            searchResults?.length === 1
              ? "search.foundOne"
              : "search.foundMany",
            { count: searchResults?.length ?? 0, query: inputVal }
          )}
        </div>
      )}

      <ul>
        {searchResults &&
          searchResults.map(({ item, refIndex }) => (
            <Article
              href={getPostUrl(item.slug)}
              frontmatter={item.data}
              entryId={item.entryId}
              key={`${refIndex}-${item.slug}`}
            />
          ))}
      </ul>
    </>
  );
}
