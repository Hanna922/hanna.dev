export type LocaleCode = "en" | "ko";

export type I18nKey = string;

export interface I18nParams {
  [key: string]: string | number;
}

export const LOCALES: { code: LocaleCode; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ko", label: "KR" },
];

export const DEFAULT_LOCALE: LocaleCode = "ko";
export const STORAGE_KEY = "hanna-locale";
export const SEARCH_PARAM = "lang";
export const LOCALE_CHANGE_EVENT = "blog:locale-change";

export const translations = {
  ko: {
    language: {
      switchAriaLabel: "언어 선택",
    },
    nav: {
      skipToContent: "본문으로 이동",
      menuOpen: "메뉴 열기",
      menuClose: "메뉴 닫기",
      themeToggle: "테마 토글",
    },
    post: {
      goBack: "뒤로가기",
    },
    search: {
      title: "Search",
      description: "블로그 글을 검색해보세요.",
      placeholder: "검색어를 입력하세요...",
      srOnly: "검색",
      foundOne: "검색어 '{query}'에 대한 결과: {count}건",
      foundMany: "검색어 '{query}'에 대한 결과: {count}건",
    },
    tags: {
      title: "Tags",
      description: "Posts에서 사용한 Tag 목록입니다.",
    },
    notFound: {
      title: "요청하신 페이지를 찾을 수 없습니다.",
    },
    llm: {
      modalOpenLabel: "AI 검색 열기",
      modalOpenSuffix: "새 대화",
      modalReset: "대화 초기화",
      modalTitle: "Hanna.Dev AI",
      modalCloseAriaLabel: "닫기",
      pageSearchPlaceholder: "블로그에 대해 질문해 보세요...",
      pageIdleSubtitle: "블로그 글에 대해 무엇이든 물어보세요",
      pageThinking: "블로그 글을 분석하고 있어요...",
      pageErrorPrefix: "오류가 발생했습니다:",
      modalDisclaimer:
        "AI가 블로그 콘텐츠를 기반으로 답변합니다 · 부정확할 수 있습니다",
      searchSendLabel: "전송",
      mockModeLabel: "🧪 MOCK 모드 ·",
      mockDisclaimerSuffix:
        "AI가 블로그 콘텐츠를 기반으로 답변합니다 · 부정확할 수 있습니다",
      sourceLabel: "📎 참고한 글",
      pageHeroBlogLink: "블로그로 이동",
      pageHeroBadge: "👋🏻 Welcome to Hanna's AI",
      pageHeroTitle: "💬 면접 전에 저와 먼저 만나보세요",
      pageHeroDescription1:
        "저의 프로젝트 경험, 기술적 고민, 문제 해결 과정이 궁금하신가요?",
      pageHeroDescription2:
        "이 AI는 제가 직접 작성한 블로그 글과 저를 학습하여 답변합니다.",
      pageHeroDataPostLabel: "블로그 글",
      pageHeroDataIndexLabel: "검색 인덱스",
      pageHeroDataAnswerLabel: "AI 답변",
      pageHeroInputPlaceholder: "예: YDS 프로젝트에 대해 알려주세요",
      pageHeroExamplesLabel: "이런 것도 물어볼 수 있어요",
      pageChatHeaderSub: "블로그 글을 기반으로 답변합니다",
      pageChatHeaderBadge: "블로그 데이터 연동",
      pageChatSourceBannerPrefix:
        "이 AI는 hanna-dev.co.kr의 블로그 글만 참고하여",
      pageChatSourceBannerSuffix:
        "답변합니다. 외부 데이터나 일반 지식을 사용하지 않습니다.",
      pageChatInputPlaceholder: "후속 질문을 입력해 보세요...",
      pageFooterSourceInfo: "블로그 콘텐츠 기반 답변",
      pageFooterInaccuracyInfo: "부정확할 수 있습니다",
      helpDialogAriaLabel: "LLM 동작 방식 안내",
      helpDialogTitle: "Hanna의 LLM은 어떻게 동작하나요?",
      helpDialogCloseAriaLabel: "안내 닫기",
      helpModalOpenHint: "LLM 동작 방식 보기",
    },
    dialog: {
      duration: "Duration",
      team: "Team",
      role: "Role",
      experience: "Experience",
      technology: "Tech Stack",
      result: "Result",
      links: "Links",
    },
    page: {
      aiHomeTitle: "AI Search | Hanna.Dev",
      aiHomeDescription: "Hanna의 AI 검색 페이지",
      notFoundTitle: "페이지를 찾을 수 없습니다.",
      notFoundEmojiLine: "( ˁ ⸍ˀ ) 404",
    },
  },
  en: {
    language: {
      switchAriaLabel: "Language switch",
    },
    nav: {
      skipToContent: "Skip to content",
      menuOpen: "Open menu",
      menuClose: "Close menu",
      themeToggle: "Toggle light & dark",
    },
    post: {
      goBack: "Go back",
    },
    search: {
      title: "Search",
      description: "Search any article.",
      placeholder: "Search for anything...",
      srOnly: "Search",
      foundOne: "Found {count} result for '{query}'",
      foundMany: "Found {count} results for '{query}'",
    },
    tags: {
      title: "Tags",
      description: "All the tags used in posts.",
    },
    notFound: {
      title: "Page Not Found",
    },
    llm: {
      modalOpenLabel: "Open AI Search",
      modalOpenSuffix: "New conversation",
      modalReset: "Reset",
      modalTitle: "Hanna.Dev AI",
      modalCloseAriaLabel: "Close",
      pageSearchPlaceholder: "Type your question...",
      pageIdleSubtitle: "Ask anything about this blog.",
      pageThinking: "AI is thinking...",
      pageErrorPrefix: "An error occurred:",
      modalDisclaimer:
        "AI responses are based on blog content and may be inaccurate.",
      searchSendLabel: "Send",
      mockModeLabel: "🧪 MOCK mode ·",
      mockDisclaimerSuffix:
        "AI answers based on blog content and may be inaccurate.",
      sourceLabel: "📎 Source",
      pageHeroBlogLink: "Go to Hanna's Blog",
      pageHeroBadge: "👋🏻 Welcome to Hanna's AI",
      pageHeroTitle: "💬 Meet me before the interview.",
      pageHeroDescription1:
        "Are you curious about my project experience, technical considerations, and problem-solving process?",
      pageHeroDescription2:
        "This AI answers using only published blog posts and the current context.",
      pageHeroDataPostLabel: "Blog Posts",
      pageHeroDataIndexLabel: "Search Index",
      pageHeroDataAnswerLabel: "AI Answer",
      pageHeroInputPlaceholder: "Example: Tell me about the YDS project",
      pageHeroExamplesLabel: "You can also ask",
      pageChatHeaderSub: "Answers are grounded on Hanna's posts.",
      pageChatHeaderBadge: "Connected",
      pageChatSourceBannerPrefix:
        "This AI uses only hanna-dev.co.kr blog posts as context.",
      pageChatSourceBannerSuffix: "No external data is used.",
      pageChatInputPlaceholder: "Enter follow-up question...",
      pageFooterSourceInfo: "Blog content based response",
      pageFooterInaccuracyInfo: "may be inaccurate",
      helpDialogAriaLabel: "LLM usage guide",
      helpDialogTitle: "How Hanna's LLM works",
      helpDialogCloseAriaLabel: "Close guide",
      helpModalOpenHint: "Open LLM guide",
    },
    dialog: {
      duration: "Duration",
      team: "Team",
      role: "Role",
      experience: "Experience",
      technology: "Tech Stack",
      result: "Result",
      links: "Links",
    },
    page: {
      aiHomeTitle: "AI Search | Hanna.Dev",
      aiHomeDescription: "Hanna's AI search page.",
      notFoundTitle: "Page Not Found",
      notFoundEmojiLine: "( ´• ‿ •` ) 404",
    },
  },
} as const;

function getValueForLocale(locale: LocaleCode, key: string) {
  return key.split(".").reduce<unknown>((acc, currentKey) => {
    if (acc && typeof acc === "object" && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[currentKey];
    }
    return undefined;
  }, translations[locale] as unknown);
}

export function getLocaleFromValue(raw: string | null): LocaleCode | null {
  return raw === "en" || raw === "ko" ? raw : null;
}

export function t(
  locale: LocaleCode,
  key: string,
  params: I18nParams = {}
): string {
  const localeMessage = getValueForLocale(locale, key);
  const fallbackMessage = getValueForLocale("en", key);
  const message =
    typeof localeMessage === "string"
      ? localeMessage
      : typeof fallbackMessage === "string"
        ? fallbackMessage
        : key;

  return String(message).replace(/\{(\w+)\}/g, (_, token) =>
    Object.hasOwn(params, token) ? String(params[token]) : `{{${token}}}`
  );
}
