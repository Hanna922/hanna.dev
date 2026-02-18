import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import {
  getExampleQuestions,
  type BlogPost,
  type ChatMessage,
  type LLMSearchModalProps,
} from "./types";
import {
  useBodyScrollLock,
  useKeyboardShortcut,
  useLLMSearchEvent,
} from "./hooks";
import { SparkleIcon, SendIcon, ExternalLinkIcon, CloseIcon } from "./Icons";
import { useLLMSearchCompletion } from "./useLLMSearchCompletion";
import { generateId, getDisplayTitle, linkifySources } from "./llmSearchUtils";
import {
  getLocaleFromValue,
  t,
  type I18nParams,
  type LocaleCode,
} from "@utils/locale";
import "./llm-search.css";

function getInitialLocale(): LocaleCode {
  if (typeof window === "undefined") {
    return "ko";
  }

  return (
    getLocaleFromValue(
      (window as Window & { __BLOG_INITIAL_LOCALE__?: LocaleCode })
        .__BLOG_INITIAL_LOCALE__ ?? null
    ) ?? "ko"
  );
}

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
    <div className="llm-typing-dots">
      <span className="llm-dot" style={{ animationDelay: "0s" }} />
      <span className="llm-dot" style={{ animationDelay: "0.15s" }} />
      <span className="llm-dot" style={{ animationDelay: "0.3s" }} />
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
  post: BlogPost;
  index: number;
  visible: boolean;
  locale: LocaleCode;
}) {
  return (
    <a
      href={withLocalePostPath(post.slug, locale)}
      className="llm-source-card"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transitionDelay: `${index * 80}ms`,
      }}
    >
      <span className="llm-source-index">{index + 1}</span>
      <span className="llm-source-title">{getDisplayTitle(post)}</span>
      <ExternalLinkIcon size={13} />
    </a>
  );
}

function ExampleButton({
  question,
  onClick,
}: {
  question: string;
  onClick: (q: string) => void;
}) {
  return (
    <button
      type="button"
      className="llm-example-btn"
      onClick={() => onClick(question)}
    >
      <span className="llm-example-arrow">→</span>
      {question}
    </button>
  );
}

function ChatMessageBubble({
  message,
  sourceLabel,
  locale,
}: {
  message: ChatMessage;
  sourceLabel: string;
  locale: LocaleCode;
}) {
  if (message.role === "user") {
    return (
      <div className="llm-user-msg-row">
        <div className="llm-user-bubble">{message.content}</div>
      </div>
    );
  }

  const linkedContent = message.sources?.length
    ? linkifySources(message.content, message.sources)
    : message.content;

  return (
    <div className="llm-assistant-row">
      <div className="llm-avatar">
        <SparkleIcon size={14} />
      </div>
      <div className="llm-assistant-content">
        <div className="llm-assistant-bubble">
          <ReactMarkdown
            components={{
              a(props) {
                const { href, children, ...rest } = props;
                return (
                  <a
                    href={href ?? "#"}
                    className="llm-source-inline"
                    target="_self"
                    {...rest}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {linkedContent}
          </ReactMarkdown>
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="llm-sources">
            <div className="llm-sources-label">{sourceLabel}</div>
            <div className="llm-sources-list">
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

export default function LLMSearchModal({
  exampleQuestions,
}: LLMSearchModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { locale, translate } = useBlogLocale(getInitialLocale());
  const isKorean = locale === "ko";

  const localizedExamples = useMemo(
    () => getExampleQuestions(locale),
    [locale]
  );

  const modalOpenLabel = isKorean
    ? "AI 검색 열기"
    : translate("llm.modalOpenLabel");
  const modalResetAriaLabel = isKorean
    ? "대화 초기화"
    : translate("llm.modalReset");
  const modalCloseLabel = isKorean
    ? "닫기"
    : translate("llm.modalCloseAriaLabel");
  const idleSubtitle = isKorean
    ? "블로그 글에 대해 무엇이든 물어보세요"
    : translate("llm.pageIdleSubtitle");
  const sourceLabel = translate("llm.sourceLabel");
  const thinkingLabel = isKorean
    ? "블로그 글을 분석하고 있어요..."
    : translate("llm.pageThinking");
  const errorPrefix = isKorean
    ? "오류가 발생했습니다: "
    : `${translate("llm.pageErrorPrefix")} `;
  const inputPlaceholder = isKorean
    ? "블로그에 대해 질문해 보세요..."
    : translate("llm.pageSearchPlaceholder");
  const sendLabel = isKorean ? "전송" : translate("llm.searchSendLabel");
  const mockModeLabel = isKorean
    ? "🧪 MOCK 모드 · "
    : translate("llm.mockModeLabel");
  const mockSuffix = isKorean
    ? "AI가 블로그 콘텐츠를 기반으로 답변합니다 · 부정확할 수 있습니다"
    : translate("llm.mockDisclaimerSuffix");

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
            className="llm-source-inline"
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

  const exampleButtons = exampleQuestions ?? localizedExamples;

  const isIdle = messages.length === 0 && !isLoading;
  const isThinking = isLoading && !streamContent;
  const isStreaming = isLoading && !!streamContent;

  const toggleModal = useCallback(() => setIsOpen(p => !p), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  useKeyboardShortcut(toggleModal, closeModal);
  useBodyScrollLock(isOpen);
  useLLMSearchEvent(useCallback(() => setIsOpen(true), []));

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, completion, isLoading, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !isLoading) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isLoading]);

  const triggerSubmit = useCallback(() => {
    const form = document.getElementById(
      "llm-search-form"
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
    stop();
  };

  const handleExampleClick = (q: string) => {
    if (isLoading) return;

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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <form
        id="llm-search-form"
        onSubmit={e => {
          e.preventDefault();
          submitToAPI(e);
        }}
        style={{ display: "none" }}
      />

      {!isOpen && (
        <button
          type="button"
          className="llm-fab"
          onClick={() => setIsOpen(true)}
          aria-label={modalOpenLabel}
          title={modalOpenLabel}
        >
          <SparkleIcon size={22} color="#fff" />
        </button>
      )}

      {isOpen && (
        <div className="llm-backdrop" onClick={handleBackdropClick}>
          <div className="llm-modal" role="dialog" aria-modal="true">
            <div className="llm-modal-header">
              <div className="llm-modal-title-group">
                <div className="llm-modal-icon">
                  <SparkleIcon size={13} color="#fff" />
                </div>
                <span className="llm-modal-title">
                  {translate("llm.modalTitle")}
                </span>
                <span className="llm-badge">BETA</span>
              </div>
              <div className="llm-header-actions">
                <button
                  type="button"
                  className="llm-reset-inline-btn"
                  onClick={handleReset}
                  aria-label={modalResetAriaLabel}
                  title={modalResetAriaLabel}
                >
                  ↻
                </button>
                <button
                  type="button"
                  className="llm-close-btn"
                  onClick={() => setIsOpen(false)}
                  aria-label={modalCloseLabel}
                >
                  <CloseIcon size={18} />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="llm-modal-content">
              {isIdle && (
                <div className="llm-idle-state">
                  <p className="llm-idle-subtitle">{idleSubtitle}</p>
                  <div className="llm-examples-list">
                    {exampleButtons.map((q, i) => (
                      <ExampleButton
                        key={i}
                        question={q}
                        onClick={handleExampleClick}
                      />
                    ))}
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <ChatMessageBubble
                  key={msg.id}
                  message={msg}
                  sourceLabel={sourceLabel}
                  locale={locale}
                />
              ))}

              {isThinking && (
                <div className="llm-assistant-row">
                  <div className="llm-avatar">
                    <SparkleIcon size={14} />
                  </div>
                  <div className="llm-assistant-bubble">
                    <div className="llm-thinking-label">{thinkingLabel}</div>
                    <TypingDots />
                  </div>
                </div>
              )}

              {isStreaming && (
                <div className="llm-assistant-row">
                  <div className="llm-avatar">
                    <SparkleIcon size={14} />
                  </div>
                  <div className="llm-assistant-content">
                    <div className="llm-assistant-bubble">
                      <ReactMarkdown components={markdownComponents}>
                        {throttledStreamingText}
                      </ReactMarkdown>
                      <span className="llm-cursor" />
                    </div>
                  </div>
                </div>
              )}

              {error && messages.length > 0 && (
                <div className="llm-assistant-row">
                  <div className="llm-avatar">
                    <SparkleIcon size={14} />
                  </div>
                  <div className="llm-assistant-bubble">
                    <div className="llm-error-label">
                      {errorPrefix}
                      {error.message}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="llm-modal-footer">
              <div
                className={`llm-input-wrapper ${isLoading ? "llm-input-active" : ""}`}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={inputPlaceholder}
                  disabled={isLoading}
                  className="llm-input"
                />
                <button
                  type="button"
                  className={`llm-send-btn ${input.trim() && !isLoading ? "llm-send-active" : ""}`}
                  onClick={handleSubmit}
                  disabled={!input.trim() || isLoading}
                  aria-label={sendLabel}
                >
                  <SendIcon size={15} />
                </button>
              </div>
              <div className="llm-disclaimer">
                {import.meta.env.PUBLIC_LLM_MOCK_MODE && (
                  <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                    {mockModeLabel}
                  </span>
                )}
                {mockSuffix}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
