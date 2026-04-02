import { useEffect } from "react";
import {
  buildLocaleHref,
  buildLocaleUrl,
  DEFAULT_LOCALE,
  getLocaleFromValue,
  LOCALE_CHANGE_EVENT,
  SEARCH_PARAM,
  resolveLocaleFromSources,
  STORAGE_KEY,
  t,
  type I18nParams,
  type LocaleCode,
} from "@utils/locale";

interface WindowWithLocaleContext {
  __BLOG_LOCALE_REVEAL_TIMEOUT__?: ReturnType<typeof setTimeout>;
  __BLOG_INITIAL_LOCALE__?: LocaleCode;
  __BLOG_LOCALE_CONTEXT__?: {
    getLocale: () => LocaleCode;
    setLocale: (locale: LocaleCode) => void;
    buildLocaleHref: (href: string, locale: LocaleCode) => string;
    translate: (key: string, params?: I18nParams) => string;
    subscribe: (callback: (locale: LocaleCode) => void) => () => void;
  };
}

declare global {
  interface Window extends WindowWithLocaleContext {}
}

function collectParams(element: Element) {
  return Object.fromEntries(
    [...element.attributes]
      .filter(attr => attr.name.startsWith("data-i18n-param-"))
      .map(attr => {
        const key = attr.name.replace("data-i18n-param-", "");
        return [key, attr.value];
      })
  );
}

function setTextOrAttribute(
  locale: LocaleCode,
  node: Element,
  key: string,
  params: Record<string, string>
) {
  const translated = t(locale, key, params);
  const tagName = node.tagName.toLowerCase();

  if (tagName === "title") {
    node.textContent = translated;
    return;
  }

  [...node.attributes]
    .map(attr => attr.name)
    .forEach(name => {
      if (!name.startsWith("data-i18n-")) return;
      if (name === "data-i18n" || name.startsWith("data-i18n-param-")) return;

      const attributeKey = name.replace("data-i18n-", "");
      const attributeValue = node.getAttribute(name);
      if (attributeValue) {
        node.setAttribute(attributeKey, t(locale, attributeValue, params));
      }
    });

  const isFormControl =
    tagName === "input" || tagName === "textarea" || tagName === "select";
  if (node.children.length === 0 && !isFormControl) {
    node.textContent = translated;
  }
}

function syncLocalizedDatetimes(locale: LocaleCode) {
  const localeTag = locale === "en" ? "en-US" : "ko-KR";

  [...document.querySelectorAll("[data-datetime-root]")].forEach(node => {
    const iso = node.getAttribute("data-datetime-iso");
    if (!iso) return;

    const datetime = new Date(iso);
    if (Number.isNaN(datetime.getTime())) return;

    const dateNode = node.querySelector<HTMLElement>("[data-datetime-date]");
    const timeNode = node.querySelector<HTMLElement>("[data-datetime-time]");

    if (dateNode) {
      dateNode.textContent = datetime.toLocaleDateString(localeTag, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }

    if (timeNode) {
      timeNode.textContent = datetime.toLocaleTimeString(localeTag, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  });
}

export default function LocaleContextProvider() {
  useEffect(() => {
    const initialLocaleFromHtml = getLocaleFromValue(
      document.documentElement.dataset.locale ?? null
    );
    const initialLocaleFromServer = getLocaleFromValue(
      document.documentElement.dataset.localeServer ?? null
    );

    const resolveBrowserLocale = () => {
      return resolveLocaleFromSources({
        search: window.location.search,
        htmlLocale: document.documentElement.dataset.locale ?? null,
        serverLocale: document.documentElement.dataset.localeServer ?? null,
        windowLocale: window.__BLOG_INITIAL_LOCALE__ ?? null,
        fallback: DEFAULT_LOCALE,
      });
    };

    let currentLocale: LocaleCode = resolveBrowserLocale();

    const listeners = new Set<(locale: LocaleCode) => void>();

    const dispatchLocaleChange = (locale: LocaleCode) => {
      window.dispatchEvent(
        new CustomEvent(LOCALE_CHANGE_EVENT, {
          detail: { locale },
        })
      );
    };

    let isFirstApply = true;

    const applyLocale = (locale: LocaleCode, persistInUrl = false) => {
      const isLocaleAlreadyLocalizedOnServer =
        initialLocaleFromServer !== null && locale === initialLocaleFromServer;
      const shouldSyncFromMarkup = !(
        isFirstApply &&
        locale === initialLocaleFromHtml &&
        isLocaleAlreadyLocalizedOnServer
      );
      document.documentElement.lang = locale === "en" ? "en-US" : "ko-KR";
      document.documentElement.dataset.locale = locale;
      window.__BLOG_INITIAL_LOCALE__ = locale;
      localStorage.setItem(STORAGE_KEY, locale);

      const includeDefaultLocale =
        persistInUrl ||
        new URLSearchParams(window.location.search).has(SEARCH_PARAM);
      const nextUrl = buildLocaleUrl({
        pathname: window.location.pathname,
        search: window.location.search,
        locale,
        includeDefaultLocale,
      });
      const currentUrl = `${window.location.pathname}${window.location.search}`;

      if (nextUrl !== currentUrl) {
        window.history.replaceState({}, "", nextUrl);
      }

      if (shouldSyncFromMarkup) {
        [...document.querySelectorAll("[data-i18n]")].forEach(node => {
          const key = node.getAttribute("data-i18n");
          if (!key) return;
          const params = collectParams(node);
          setTextOrAttribute(locale, node, key, params);
        });
      }

      if (shouldSyncFromMarkup) {
        [...document.querySelectorAll("[data-locale-switch]")].forEach(
          button => {
            const buttonLocale = button.getAttribute(
              "data-locale-switch"
            ) as LocaleCode;
            if (!buttonLocale) return;
            const isActive = buttonLocale === locale;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
          }
        );
      }

      syncLocalizedDatetimes(locale);
      listeners.forEach(listener => listener(locale));

      if (window.__BLOG_LOCALE_REVEAL_TIMEOUT__) {
        window.clearTimeout(window.__BLOG_LOCALE_REVEAL_TIMEOUT__);
        window.__BLOG_LOCALE_REVEAL_TIMEOUT__ = undefined;
      }
      isFirstApply = false;
      document.documentElement.dataset.localeReady = "true";
    };

    const setLocale = (locale: LocaleCode) => {
      if (locale === currentLocale) return;

      currentLocale = locale;
      applyLocale(locale, true);
      dispatchLocaleChange(locale);
    };

    const getLocale = () => currentLocale;

    const handleLocaleSwitchClick = (event: Event) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-locale-switch]"
      );
      if (!target) return;

      const buttonLocale = getLocaleFromValue(
        target.getAttribute("data-locale-switch")
      );
      if (!buttonLocale) return;
      setLocale(buttonLocale);
    };

    window.__BLOG_LOCALE_CONTEXT__ = {
      getLocale,
      setLocale,
      buildLocaleHref: (href, locale) => buildLocaleHref(href, locale),
      translate: (key, params) => t(currentLocale, key, params),
      subscribe: callback => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    } as WindowWithLocaleContext["__BLOG_LOCALE_CONTEXT__"];

    document.addEventListener("click", handleLocaleSwitchClick);

    applyLocale(currentLocale);

    const onAfterSwap = () => {
      const nextLocale = resolveBrowserLocale();
      const localeChanged = nextLocale !== currentLocale;
      currentLocale = nextLocale;

      applyLocale(currentLocale);

      if (localeChanged) {
        dispatchLocaleChange(currentLocale);
      }
    };
    document.addEventListener("astro:after-swap", onAfterSwap);

    return () => {
      document.removeEventListener("click", handleLocaleSwitchClick);
      document.removeEventListener("astro:after-swap", onAfterSwap);
    };
  }, []);

  return null;
}
