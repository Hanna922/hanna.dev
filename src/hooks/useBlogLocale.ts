import { useCallback, useEffect, useState } from "react";
import {
  getLocaleFromValue,
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
    return getLocaleFromValue(initialLocaleFromServer ?? null) ?? "ko";
  }

  const urlLocale = getLocaleFromValue(
    new URLSearchParams(window.location.search).get("lang")
  );
  if (urlLocale) return urlLocale;

  const serverLocale = getLocaleFromValue(initialLocaleFromServer ?? null);
  if (serverLocale) return serverLocale;

  const htmlLocale = getLocaleFromValue(
    document.documentElement.dataset.locale ?? null
  );
  if (htmlLocale) return htmlLocale;

  const windowLocale = getLocaleFromValue(
    (window as Window & { __BLOG_INITIAL_LOCALE__?: LocaleCode })
      .__BLOG_INITIAL_LOCALE__ ?? null
  );
  if (windowLocale) return windowLocale;

  return "ko";
}

export function useBlogLocale(initial: LocaleCode = "ko") {
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
