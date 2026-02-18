// ============================================
// LLMSearchPage.tsx
// 블로그 AI 검색 전용 페이지
// "내 블로그 콘텐츠 기반 AI"를 어필
// ============================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getExampleQuestions, type ChatMessage } from "./types";
import { SparkleIcon, SendIcon, ExternalLinkIcon, CloseIcon } from "./Icons";
import ReactMarkdown, { type Components } from "react-markdown";
import "./llm-search-page.css";
import { useLLMSearchCompletion } from "./useLLMSearchCompletion";
import { generateId, getDisplayTitle, linkifySources } from "./llmSearchUtils";
import {
  getLocaleFromValue,
  LOCALES,
  t,
  type I18nParams,
  type LocaleCode,
} from "@utils/locale";

function getInitialLocale(initialLocaleFromServer?: LocaleCode): LocaleCode {
  const parsedInitialLocale = getLocaleFromValue(
    initialLocaleFromServer ?? null
  );
  if (parsedInitialLocale) {
    return parsedInitialLocale;
  }

  if (typeof window === "undefined") {
    return "ko";
  }

  // 1. Check URL query parameter first
  const urlParams = new URLSearchParams(window.location.search);
  const urlLocale = getLocaleFromValue(urlParams.get("lang"));
  if (urlLocale) {
    return urlLocale;
  }

  // 2. Check data-locale attribute
  const htmlLocale = getLocaleFromValue(
    document.documentElement.dataset.locale ?? null
  );
  if (htmlLocale) {
    return htmlLocale;
  }

  // 3. Check window.__BLOG_INITIAL_LOCALE__
  const windowLocale = getLocaleFromValue(
    (window as Window & { __BLOG_INITIAL_LOCALE__?: LocaleCode })
      .__BLOG_INITIAL_LOCALE__ ?? null
  );
  if (windowLocale) {
    return windowLocale;
  }

  // 4. Fallback to default
  return "ko";
}

const HELP_MODAL_MARKDOWN_KR = `

이 페이지는 단순 채팅 UI가 아니라, **RAG(Retrieval-Augmented Generation)** 파이프라인을 거쳐 답변을 생성합니다.
더 자세한 구현 과정은 [MiniSearch에서 RAG로 - 블로그 검색 고도화의 실패와 설계, MVP 구현기](https://www.hanna-dev.co.kr/posts/from-minisearch-to-rag-mvp/?lang=ko) 에서 확인하실 수 있습니다!

### 1) Query 이해 및 검색 준비
- 사용자의 질문을 그대로 LLM에 보내지 않고, 먼저 검색 가능한 형태로 처리합니다.
- 멀티턴인 경우 \`history\`(이전 사용자/어시스턴트 발화)를 함께 전달해 문맥을 유지합니다.

### 2) Retrieval (Vector Search)
- 블로그 문서들을 청크 단위로 분해해 임베딩한 인덱스에서 질문과 의미적으로 가까운 청크를 찾습니다.
- 키워드 일치가 아니라 **의미 유사도 기반 검색**이므로, 표현이 달라도 관련 문서를 찾을 수 있습니다.
- 이 단계 결과는 “답변 후보 문맥(Context)”이며, 이후 생성 단계의 근거 데이터가 됩니다.

### 3) Grounded Generation
- LLM에는 질문 + 검색된 문맥만 주입해 답변을 생성합니다.
- 즉, 일반 상식으로 길게 추론하기보다, 검색된 블로그 근거를 중심으로 설명하도록 제한합니다.
- 환각(hallucination)을 줄이기 위해 출처 기반 응답 포맷을 사용합니다.

### 4) Source Attachment & Rendering
- 서버 응답에는 본문과 함께 출처 메타데이터가 포함됩니다.
- UI는 응답 본문의 '출처' 표기를 실제 포스트 링크로 치환해 렌더링합니다.
- 따라서 답변 검증이 필요할 때 즉시 원문으로 이동할 수 있습니다.

### 5) Streaming UX
- 응답은 스트리밍으로 전달되어 토큰 단위로 점진 렌더링됩니다.
- 최종 완료 시점에 소스/본문을 파싱해 메시지 히스토리에 확정 저장합니다.

---

### 시스템 특성 / 한계
- 데이터 소스는 **hanna-dev.co.kr 블로그 콘텐츠**에 한정됩니다.
- 인덱스에 없는 최신 정보나 외부 지식은 정확도가 낮을 수 있습니다.
- 검색된 문맥 품질이 최종 답변 품질을 결정합니다 (Garbage in, garbage out).

필요하시다면 답변 하단의 참고 글을 열어 근거를 직접 확인해 주세요.
`;

const HELP_MODAL_MARKDOWN_EN = `

This page is not just a simple chat UI, but generates answers through a **RAG (Retrieval-Augmented Generation)** pipeline.
For more details on the implementation process, check out [From MiniSearch to RAG - Blog Search Enhancement Failures, Design, and MVP Implementation](https://www.hanna-dev.co.kr/posts/from-minisearch-to-rag-mvp/?lang=en)!

### 1) Query Understanding and Search Preparation
- User questions are not sent directly to the LLM, but are first processed into a searchable format.
- For multi-turn conversations, \`history\` (previous user/assistant utterances) is passed together to maintain context.

### 2) Retrieval (Vector Search)
- Blog documents are broken down into chunks and embedded in an index to find chunks semantically close to the question.
- It uses **semantic similarity-based search** rather than keyword matching, so related documents can be found even with different expressions.
- The results of this step are "answer candidate context (Context)", which becomes the basis data for the subsequent generation step.

### 3) Grounded Generation
- Only the question + retrieved context is injected into the LLM to generate an answer.
- In other words, rather than reasoning at length with general common sense, it is limited to explaining based on the retrieved blog evidence.
- Source-based response format is used to reduce hallucination.

### 4) Source Attachment & Rendering
- The server response includes source metadata along with the body.
- The UI replaces 'Source' markers in the response body with actual post links for rendering.
- Therefore, when answer verification is needed, you can immediately navigate to the original text.

### 5) Streaming UX
- Responses are delivered via streaming and progressively rendered token by token.
- At the final completion point, sources/body are parsed and stored in message history.

---

### System Characteristics / Limitations
- Data sources are limited to **hanna-dev.co.kr blog content**.
- Latest information or external knowledge not in the index may have low accuracy.
- The quality of the retrieved context determines the final answer quality (Garbage in, garbage out).

If needed, please open the reference articles at the bottom of the answer to directly verify the evidence.
`;

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

function TypingDots() {
  return (
    <div className="lsp-typing-dots">
      <span className="lsp-dot" style={{ animationDelay: "0s" }} />
      <span className="lsp-dot" style={{ animationDelay: "0.15s" }} />
      <span className="lsp-dot" style={{ animationDelay: "0.3s" }} />
    </div>
  );
}

function withLocalePostPath(href: string, locale: LocaleCode) {
  if (!href || !href.startsWith("/posts/") || locale !== "en") {
    return href;
  }

  const [pathWithoutQuery, queryString = ""] = href.split("?", 2);
  const normalizedPath = pathWithoutQuery.endsWith("/")
    ? pathWithoutQuery
    : `${pathWithoutQuery}/`;
  const searchParams = new URLSearchParams(queryString);
  searchParams.set("lang", locale);

  return `${normalizedPath}?${searchParams.toString()}`;
}

function SourceCard({
  post,
  index,
  visible,
  locale,
}: {
  post: { slug: string; title: string };
  index: number;
  visible: boolean;
  locale: LocaleCode;
}) {
  return (
    <a
      href={withLocalePostPath(post.slug, locale)}
      className="lsp-source-card"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transitionDelay: `${index * 80}ms`,
      }}
    >
      <span className="lsp-source-index">{index + 1}</span>
      <span className="lsp-source-title">{getDisplayTitle(post, locale)}</span>
      <ExternalLinkIcon size={13} />
    </a>
  );
}

function ChatMessageBubble({
  message,
  sourceLabel,
  locale,
}: {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources?: { slug: string; title: string }[];
  };
  sourceLabel: string;
  locale: LocaleCode;
}) {
  const markdownComponents: Components = useMemo(
    () => ({
      a(props) {
        const { href, children, ...rest } = props;
        return (
          <a
            href={href ?? "#"}
            className="lsp-source-inline"
            target="_self"
            {...rest}
          >
            {children}
          </a>
        );
      },
    }),
    []
  );

  if (message.role === "user") {
    return (
      <div className="lsp-user-msg-row">
        <div className="lsp-user-bubble">{message.content}</div>
      </div>
    );
  }

  const linkedContent = message.sources?.length
    ? linkifySources(message.content, message.sources, locale)
    : message.content;

  return (
    <div className="lsp-assistant-row">
      <div className="lsp-avatar">
        <SparkleIcon size={14} />
      </div>
      <div className="lsp-assistant-content">
        <div className="lsp-assistant-bubble">
          <ReactMarkdown components={markdownComponents}>
            {linkedContent}
          </ReactMarkdown>
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="lsp-sources">
            <div className="lsp-sources-label">{sourceLabel}</div>
            <div className="lsp-sources-list">
              {message.sources.map((post, i) => (
                <SourceCard
                  key={i}
                  post={post}
                  index={i}
                  visible={true}
                  locale={locale}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function useBlogLocale(initial: LocaleCode = "ko") {
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

interface LLMSearchPageProps {
  initialLocale?: LocaleCode;
}

// ============================================
// Main Page Component
// ============================================
export default function LLMSearchPage({ initialLocale }: LLMSearchPageProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const { locale, translate } = useBlogLocale(getInitialLocale(initialLocale));
  const isKorean = locale === "ko";

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const helpFabRef = useRef<HTMLButtonElement>(null);
  const helpPopoverRef = useRef<HTMLDivElement>(null);

  const exampleQuestions = useMemo(() => getExampleQuestions(locale), [locale]);
  const helpMarkdown = isKorean
    ? HELP_MODAL_MARKDOWN_KR
    : HELP_MODAL_MARKDOWN_EN;

  const {
    input,
    setInput,
    handleInputChange,
    handleSubmit: submitToAPI,
    completion,
    isLoading,
    error,
    stop,
    streamContent,
    throttledStreamingText,
  } = useLLMSearchCompletion({
    history: messages.map(({ role, content }) => ({ role, content })),
    body: {
      history: messages.map(({ role, content }) => ({ role, content })),
      locale,
    },
    locale,
    onAssistantMessage: ({ content, sources }) => {
      setMessages(prev => [
        ...prev,
        { id: generateId(), role: "assistant", content, sources },
      ]);
    },
  });

  const markdownComponents: Components = useMemo(
    () => ({
      a(props) {
        const { href, children, ...rest } = props;
        return (
          <a
            href={href ?? "#"}
            className="lsp-source-inline"
            target="_self"
            {...rest}
          >
            {children}
          </a>
        );
      },
    }),
    []
  );

  const helpMarkdownComponents: Components = useMemo(
    () => ({
      a(props) {
        const { href, children, ...rest } = props;
        return (
          <a
            href={href ?? "#"}
            className="lsp-help-link"
            target="_blank"
            rel="noopener noreferrer"
            {...rest}
          >
            {children}
          </a>
        );
      },
    }),
    []
  );

  // ---- 상태 파생 ----
  const isThinking = isLoading && !streamContent;
  const isStreaming = isLoading && !!streamContent;

  const sourceLabel = translate("llm.sourceLabel");
  const chatSubtitle = isKorean
    ? "블로그 글을 기반으로 답변합니다"
    : translate("llm.pageChatHeaderSub");
  const chatBadge = isKorean
    ? "블로그 데이터 연동"
    : translate("llm.pageChatHeaderBadge");
  const footerSource = isKorean
    ? "블로그 콘텐츠 기반 답변"
    : translate("llm.pageFooterSourceInfo");
  const footerAccuracy = isKorean
    ? "부정확할 수 있습니다"
    : translate("llm.pageFooterInaccuracyInfo");
  const heroDescription = isKorean ? (
    <>
      저의 프로젝트 경험, 기술적 고민, 문제 해결 과정이 궁금하신가요?
      <br />이 AI는 제가 직접 작성한{" "}
      <mark className="lsp-highlight">블로그 글과 저를 학습</mark>하여
      답변합니다.
    </>
  ) : (
    <>
      Are you curious about my project experience, technical considerations, and
      problem-solving process?
      <br />
      This AI has been trained on my personally written{" "}
      <mark className="lsp-highlight">blog posts and profile</mark>
      <br />
      and provides answers based on them.
    </>
  );

  const resetLabel = isKorean ? "새 대화" : translate("llm.modalOpenSuffix");

  // ---- Auto-scroll ----
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, completion, isLoading, scrollToBottom]);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!isHelpOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsidePopover = helpPopoverRef.current?.contains(target);
      const isOnFab = helpFabRef.current?.contains(target);

      if (!isInsidePopover && !isOnFab) {
        setIsHelpOpen(false);
      }
    };

    window.addEventListener("pointerdown", handleOutsideClick);
    return () => window.removeEventListener("pointerdown", handleOutsideClick);
  }, [isHelpOpen]);

  // ---- Handlers ----
  const triggerSubmit = useCallback(() => {
    const form = document.getElementById(
      "lsp-search-form"
    ) as HTMLFormElement | null;
    if (!form) return;

    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return;
    }

    form.dispatchEvent(
      new Event("submit", {
        bubbles: true,
        cancelable: true,
      })
    );
  }, []);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    if (!hasStarted) setHasStarted(true);

    setMessages(prev => [
      ...prev,
      { id: generateId(), role: "user", content: trimmed },
    ]);
    triggerSubmit();
    requestAnimationFrame(() => setInput(""));
  };

  const handleReset = () => {
    setInput("");
    setMessages([]);
    setHasStarted(false);
    stop();
  };

  const handleExampleClick = (q: string) => {
    if (isLoading) return;
    if (!hasStarted) setHasStarted(true);

    setMessages(prev => [
      ...prev,
      { id: generateId(), role: "user", content: q },
    ]);
    setInput(q);
    setTimeout(() => {
      triggerSubmit();
      requestAnimationFrame(() => setInput(""));
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ============================================
  // Render
  // ============================================
  return (
    <div className="lsp-page">
      {/* Hidden form */}
      <form
        id="lsp-search-form"
        onSubmit={e => {
          e.preventDefault();
          submitToAPI(e);
        }}
        style={{ display: "none" }}
      />

      {/* ---- Hero Section (대화 시작 전) ---- */}
      {!hasStarted && (
        <div className="lsp-hero">
          <div className="lsp-hero-glow" />
          <div className="lsp-hero-grid" />

          <div className="lsp-hero-inner">
            <div className="lsp-hero-top-row">
              <div
                className="lsp-hero-locale-switcher"
                role="group"
                aria-label={translate("language.switchAriaLabel")}
              >
                {LOCALES.map(l => (
                  <button
                    key={l.code}
                    type="button"
                    className={`lsp-hero-locale-btn${locale === l.code ? " active" : ""}`}
                    data-locale-switch={l.code}
                    aria-pressed={locale === l.code}
                  >
                    {l.code === "en" ? "EN" : "KR"}
                  </button>
                ))}
              </div>

              <a href="/blog" className="lsp-blog-link-btn">
                {isKorean
                  ? "블로그 메인으로 이동"
                  : translate("llm.pageHeroBlogLink")}
              </a>
            </div>

            <div className="lsp-hero-badge">
              <span>
                {isKorean
                  ? "👋🏻 Welcome to Hanna's AI"
                  : translate("llm.pageHeroBadge")}
              </span>
            </div>

            <h1 className="lsp-hero-title">
              {isKorean
                ? "💬 면접 전에 저와 먼저 만나보세요"
                : translate("llm.pageHeroTitle")}
            </h1>

            <p className="lsp-hero-desc">{heroDescription}</p>

            <div className="lsp-data-flow">
              <div className="lsp-data-node lsp-data-blog">
                <div className="lsp-data-node-icon">📝</div>
                <div className="lsp-data-node-label">
                  {isKorean
                    ? "블로그 글"
                    : translate("llm.pageHeroDataPostLabel")}
                </div>
              </div>
              <div className="lsp-data-arrow">
                <svg width="40" height="24" viewBox="0 0 40 24" fill="none">
                  <path
                    d="M0 12H32M32 12L24 4M32 12L24 20"
                    stroke="rgb(var(--color-accent))"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="4 3"
                  />
                </svg>
              </div>
              <div className="lsp-data-node lsp-data-index">
                <div className="lsp-data-node-icon">🧠</div>
                <div className="lsp-data-node-label">
                  {isKorean
                    ? "검색 인덱스"
                    : translate("llm.pageHeroDataIndexLabel")}
                </div>
              </div>
              <div className="lsp-data-arrow">
                <svg width="40" height="24" viewBox="0 0 40 24" fill="none">
                  <path
                    d="M0 12H32M32 12L24 4M32 12L24 20"
                    stroke="rgb(var(--color-accent))"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="4 3"
                  />
                </svg>
              </div>
              <div className="lsp-data-node lsp-data-ai">
                <div className="lsp-data-node-icon">✨</div>
                <div className="lsp-data-node-label">
                  {isKorean
                    ? "AI 답변"
                    : translate("llm.pageHeroDataAnswerLabel")}
                </div>
              </div>
            </div>

            <div className="lsp-hero-input-section">
              <div className="lsp-hero-input-wrapper">
                <SparkleIcon size={18} color="rgb(var(--color-accent))" />
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isKorean
                      ? "예: YDS 프로젝트에 대해 알려주세요"
                      : translate("llm.pageHeroInputPlaceholder")
                  }
                  className="lsp-hero-input"
                  autoFocus
                />
                <button
                  type="button"
                  className={`lsp-hero-send-btn ${input.trim() ? "active" : ""}`}
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  aria-label={
                    isKorean ? "전송" : translate("llm.searchSendLabel")
                  }
                >
                  <SendIcon size={16} />
                </button>
              </div>
              <div className="lsp-hero-disclaimer">
                {isKorean
                  ? "AI가 블로그 콘텐츠를 기반으로 답변합니다 · 부정확할 수 있습니다"
                  : translate("llm.modalDisclaimer")}
              </div>
            </div>

            <div className="lsp-examples">
              <div className="lsp-examples-label">
                {isKorean
                  ? "이런 것도 물어볼 수 있어요"
                  : translate("llm.pageHeroExamplesLabel")}
              </div>
              <div className="lsp-examples-grid">
                {exampleQuestions.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    className="lsp-example-chip"
                    onClick={() => handleExampleClick(q)}
                    style={{ animationDelay: `${0.3 + i * 0.05}s` }}
                  >
                    <span className="lsp-example-chip-arrow">→</span>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Chat Section (대화 시작 후) ---- */}
      {hasStarted && (
        <div className="lsp-chat-page">
          <div className="lsp-chat-header">
            <div className="lsp-chat-header-left">
              <div className="lsp-chat-header-icon">
                <SparkleIcon size={14} color="#fff" />
              </div>
              <div>
                <div className="lsp-chat-header-title">Hanna.Dev AI</div>
                <div className="lsp-chat-header-sub">{chatSubtitle}</div>
              </div>
            </div>
            <div className="lsp-chat-header-actions">
              <div className="lsp-chat-header-badge">
                <span className="lsp-badge-dot" />
                {chatBadge}
              </div>
              <button
                type="button"
                className="lsp-chat-reset-btn"
                onClick={handleReset}
                title={resetLabel}
              >
                ↻ {resetLabel}
              </button>
            </div>
          </div>

          <div className="lsp-source-banner">
            <span className="lsp-source-banner-icon">📚</span>
            {isKorean ? (
              <span>
                이 AI는 <strong>hanna-dev.co.kr의 블로그 글</strong>만을
                참고하여 답변합니다. 외부 데이터나 일반 지식을 사용하지
                않습니다.
              </span>
            ) : (
              <span>
                {translate("llm.pageChatSourceBannerPrefix")}
                <br />
                {translate("llm.pageChatSourceBannerSuffix")}
              </span>
            )}
          </div>

          <div ref={scrollRef} className="lsp-chat-messages">
            {messages.map(msg => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                sourceLabel={sourceLabel}
                locale={locale}
              />
            ))}

            {isThinking && (
              <div className="lsp-assistant-row">
                <div className="lsp-avatar">
                  <SparkleIcon size={14} />
                </div>
                <div className="lsp-assistant-bubble">
                  <div className="lsp-thinking-label">
                    {isKorean
                      ? "블로그 글을 분석하고 있어요..."
                      : translate("llm.pageThinking")}
                  </div>
                  <TypingDots />
                </div>
              </div>
            )}

            {isStreaming && (
              <div className="lsp-assistant-row">
                <div className="lsp-avatar">
                  <SparkleIcon size={14} />
                </div>
                <div className="lsp-assistant-content">
                  <div className="lsp-assistant-bubble">
                    <ReactMarkdown components={markdownComponents}>
                      {throttledStreamingText}
                    </ReactMarkdown>
                    <span className="lsp-cursor" />
                  </div>
                </div>
              </div>
            )}

            {error && messages.length > 0 && (
              <div className="lsp-assistant-row">
                <div className="lsp-avatar">
                  <SparkleIcon size={14} />
                </div>
                <div className="lsp-assistant-bubble">
                  <div className="lsp-error-label">
                    {isKorean
                      ? "오류가 발생했습니다: "
                      : `${translate("llm.pageErrorPrefix")} `}
                    {error.message}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lsp-chat-footer">
            <div
              className={`lsp-chat-input-wrapper ${isLoading ? "active" : ""}`}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  isKorean
                    ? "후속 질문을 입력해 보세요..."
                    : translate("llm.pageChatInputPlaceholder")
                }
                disabled={isLoading}
                className="lsp-chat-input"
              />
              <button
                type="button"
                className={`lsp-chat-send-btn ${input.trim() && !isLoading ? "active" : ""}`}
                onClick={handleSubmit}
                disabled={!input.trim() || isLoading}
                aria-label={
                  isKorean ? "전송" : translate("llm.searchSendLabel")
                }
              >
                <SendIcon size={15} />
              </button>
            </div>
            <div className="lsp-chat-footer-info">
              <span>📚 {footerSource}</span>
              <span>·</span>
              <span>{footerAccuracy}</span>
            </div>
          </div>
        </div>
      )}

      <button
        ref={helpFabRef}
        type="button"
        className="lsp-help-fab"
        onClick={() => setIsHelpOpen(prev => !prev)}
        aria-label={
          isKorean ? "LLM 동작 방식 안내" : translate("llm.helpModalOpenHint")
        }
        aria-expanded={isHelpOpen}
      >
        ?
      </button>

      {isHelpOpen && (
        <div
          ref={helpPopoverRef}
          className="lsp-help-popover"
          role="dialog"
          aria-label={
            isKorean
              ? "LLM 동작 방식 안내"
              : translate("llm.helpDialogAriaLabel")
          }
        >
          <div className="lsp-help-header">
            <div className="lsp-help-title-wrap">
              <strong>
                {isKorean
                  ? "Hanna's LLM은 어떻게 동작하나요?"
                  : translate("llm.helpDialogTitle")}
              </strong>
            </div>
            <button
              type="button"
              className="lsp-help-close"
              onClick={() => setIsHelpOpen(false)}
              aria-label={
                isKorean
                  ? "안내 닫기"
                  : translate("llm.helpDialogCloseAriaLabel")
              }
            >
              <CloseIcon size={14} />
            </button>
          </div>
          <div className="lsp-help-body">
            <ReactMarkdown components={helpMarkdownComponents}>
              {helpMarkdown}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
