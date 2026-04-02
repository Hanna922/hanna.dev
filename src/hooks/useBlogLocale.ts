import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LOCALE,
  resolveLocaleFromSources,
  t,
  type I18nParams,
  type LocaleCode,
} from "@utils/locale";

interface WindowWithLocaleContext {
  __BLOG_INITIAL_LOCALE__?: LocaleCode;
  __BLOG_LOCALE_CONTEXT__?: {
    getLocale: () => LocaleCode;
    subscribe: (callback: (locale: LocaleCode) => void) => () => void;
    translate: (key: string, params?: I18nParams) => string;
  };
}

declare global {
  interface Window extends WindowWithLocaleContext {}
}

export function getInitialLocale(
  initialLocaleFromServer?: LocaleCode
): LocaleCode {
  if (typeof window === "undefined") {
    return initialLocaleFromServer ?? DEFAULT_LOCALE;
  }

  return resolveLocaleFromSources({
    search: window.location.search,
    serverLocale: initialLocaleFromServer ?? null,
    htmlLocale: document.documentElement.dataset.locale ?? null,
    windowLocale: window.__BLOG_INITIAL_LOCALE__ ?? null,
    fallback: DEFAULT_LOCALE,
  });
}

export function useBlogLocale(initial: LocaleCode = DEFAULT_LOCALE) {
  const [locale, setLocale] = useState<LocaleCode>(initial);

  const translate = useCallback(
    (key: string, params?: I18nParams) =>
      typeof window === "undefined"
        ? t(locale, key, params)
        : (window.__BLOG_LOCALE_CONTEXT__?.translate(key, params) ??
          t(locale, key, params)),
    [locale]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const context = window.__BLOG_LOCALE_CONTEXT__;
    if (!context) return;

    setLocale(context.getLocale());
    return context.subscribe(next => {
      setLocale(next);
    });
  }, []);

  return { locale, translate };
}
