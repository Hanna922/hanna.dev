// ============================================
// LLMSearchPage.tsx
// 블로그 AI 검색 전용 페이지
// "내 블로그 콘텐츠 기반 AI" 를 최대한 어필
// ============================================

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { BlogPost } from "./types";
import { SparkleIcon, SendIcon, ExternalLinkIcon, CloseIcon } from "./Icons";
import ReactMarkdown, { type Components } from "react-markdown";
import "./llm-search-page.css";
import { useLLMSearchCompletion } from "./useLLMSearchCompletion";
import { generateId, getDisplayTitle, linkifySources } from "./llmSearchUtils";

// ============================================
// Types
// ============================================

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: BlogPost[];
};

// ============================================
// Constants
// ============================================

const EXAMPLE_QUESTIONS: string[] = [
  "Stock Condition Analysis 프로젝트에 대해 설명해주세요.",
  "YDS 프로젝트에 대해 설명해주세요",
  "Yrano 프로젝트에 대해 설명해주세요",
  "마이그레이션 경험에서 겪은 에러는?",
  "대표 프로젝트 몇 가지를 설명해주세요",
  "블로그에서 다룬 기술 스택은?",
];

const HELP_MODAL_MARKDOWN = `

이 페이지는 단순 채팅 UI가 아니라, **RAG(Retrieval-Augmented Generation)** 파이프라인을 거쳐 답변을 생성합니다.
더 자세한 구현 과정은 [MiniSearch에서 RAG로 - 블로그 검색 고도화의 실패와 설계, MVP 구현기](https://www.hanna-dev.co.kr/posts/from-minisearch-to-rag-mvp/) 에서 확인하실 수 있습니다!

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

// ============================================
// Sub-components
// ============================================

function TypingDots() {
  return (
    <div className="lsp-typing-dots">
      <span className="lsp-dot" style={{ animationDelay: "0s" }} />
      <span className="lsp-dot" style={{ animationDelay: "0.15s" }} />
      <span className="lsp-dot" style={{ animationDelay: "0.3s" }} />
    </div>
  );
}

function SourceCard({
  post,
  index,
  visible,
}: {
  post: BlogPost;
  index: number;
  visible: boolean;
}) {
  return (
    <a
      href={post.slug}
      className="lsp-source-card"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transitionDelay: `${index * 80}ms`,
      }}
    >
      <span className="lsp-source-index">{index + 1}</span>
      <span className="lsp-source-title">{getDisplayTitle(post)}</span>
      <ExternalLinkIcon size={13} />
    </a>
  );
}

function ChatMessageBubble({ message }: { message: ChatMessage }) {
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
    ? linkifySources(message.content, message.sources)
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
            <div className="lsp-sources-label">📎 참고한 글</div>
            <div className="lsp-sources-list">
              {message.sources.map((post, i) => (
                <SourceCard key={i} post={post} index={i} visible={true} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================
export default function LLMSearchPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const helpFabRef = useRef<HTMLButtonElement>(null);
  const helpPopoverRef = useRef<HTMLDivElement>(null);

  // ---- useCompletion ----
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

    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [isHelpOpen]);

  // ---- Handlers ----
  const triggerSubmit = useCallback(() => {
    const form = document.getElementById(
      "lsp-search-form"
    ) as HTMLFormElement | null;
    if (form) form.requestSubmit();
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
          {/* 배경 장식 */}
          <div className="lsp-hero-glow" />
          <div className="lsp-hero-grid" />

          <div className="lsp-hero-inner">
            <a href="/blog" className="lsp-blog-link-btn">
              블로그 메인으로 이동
            </a>

            {/* 뱃지 */}
            <div className="lsp-hero-badge">
              <span>👋🏻 Welcome to Hanna's AI</span>
            </div>

            {/* 메인 타이틀 */}
            <h1 className="lsp-hero-title">
              💬 면접 전에 저와 먼저 만나보세요
            </h1>

            {/* 설명 */}
            <p className="lsp-hero-desc">
              저의 프로젝트 경험, 기술적 고민, 문제 해결 과정이 궁금하신가요?
              <br />이 AI는 제가 직접 작성한{" "}
              <mark className="lsp-highlight">블로그 글과 저를 학습</mark>하여
              답변합니다.
            </p>

            {/* 데이터 소스 시각화 */}
            <div className="lsp-data-flow">
              <div className="lsp-data-node lsp-data-blog">
                <div className="lsp-data-node-icon">📝</div>
                <div className="lsp-data-node-label">블로그 글</div>
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
                <div className="lsp-data-node-label">검색 인덱스</div>
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
                <div className="lsp-data-node-label">AI 답변</div>
              </div>
            </div>

            {/* 입력 영역 */}
            <div className="lsp-hero-input-section">
              <div className="lsp-hero-input-wrapper">
                <SparkleIcon size={18} color="rgb(var(--color-accent))" />
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="예: YDS 프로젝트에 대해 알려주세요"
                  className="lsp-hero-input"
                  autoFocus
                />
                <button
                  type="button"
                  className={`lsp-hero-send-btn ${input.trim() ? "active" : ""}`}
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  aria-label="전송"
                >
                  <SendIcon size={16} />
                </button>
              </div>
              <div className="lsp-hero-disclaimer">
                AI가 블로그 콘텐츠를 기반으로 답변합니다 · 부정확할 수 있습니다
              </div>
            </div>

            {/* 예시 질문 */}
            <div className="lsp-examples">
              <div className="lsp-examples-label">
                이런 것도 물어볼 수 있어요
              </div>
              <div className="lsp-examples-grid">
                {EXAMPLE_QUESTIONS.map((q, i) => (
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
          {/* Chat Header */}
          <div className="lsp-chat-header">
            <div className="lsp-chat-header-left">
              <div className="lsp-chat-header-icon">
                <SparkleIcon size={14} color="#fff" />
              </div>
              <div>
                <div className="lsp-chat-header-title">Hanna.Dev AI</div>
                <div className="lsp-chat-header-sub">
                  블로그 글을 기반으로 답변합니다
                </div>
              </div>
            </div>
            <div className="lsp-chat-header-actions">
              <div className="lsp-chat-header-badge">
                <span className="lsp-badge-dot" />
                블로그 데이터 연동
              </div>
              <button
                type="button"
                className="lsp-chat-reset-btn"
                onClick={handleReset}
                title="새 대화"
              >
                ↻ 새 대화
              </button>
            </div>
          </div>

          {/* 데이터 소스 배너 */}
          <div className="lsp-source-banner">
            <span className="lsp-source-banner-icon">📚</span>
            <span>
              이 AI는 <strong>hanna-dev.co.kr의 블로그 글</strong>만을 참고하여
              답변합니다. 외부 데이터나 일반 지식을 사용하지 않습니다.
            </span>
          </div>

          {/* Chat Messages */}
          <div ref={scrollRef} className="lsp-chat-messages">
            {messages.map(msg => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}

            {/* Thinking */}
            {isThinking && (
              <div className="lsp-assistant-row">
                <div className="lsp-avatar">
                  <SparkleIcon size={14} />
                </div>
                <div className="lsp-assistant-bubble">
                  <div className="lsp-thinking-label">
                    블로그 글을 분석하고 있어요...
                  </div>
                  <TypingDots />
                </div>
              </div>
            )}

            {/* Streaming */}
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

            {/* Error */}
            {error && messages.length > 0 && (
              <div className="lsp-assistant-row">
                <div className="lsp-avatar">
                  <SparkleIcon size={14} />
                </div>
                <div className="lsp-assistant-bubble">
                  <div className="lsp-error-label">
                    오류가 발생했습니다: {error.message}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
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
                placeholder="후속 질문을 입력해 보세요..."
                disabled={isLoading}
                className="lsp-chat-input"
              />
              <button
                type="button"
                className={`lsp-chat-send-btn ${input.trim() && !isLoading ? "active" : ""}`}
                onClick={handleSubmit}
                disabled={!input.trim() || isLoading}
                aria-label="전송"
              >
                <SendIcon size={15} />
              </button>
            </div>
            <div className="lsp-chat-footer-info">
              <span>📚 블로그 콘텐츠 기반 답변</span>
              <span>·</span>
              <span>부정확할 수 있습니다</span>
            </div>
          </div>
        </div>
      )}

      <button
        ref={helpFabRef}
        type="button"
        className="lsp-help-fab"
        onClick={() => setIsHelpOpen(prev => !prev)}
        aria-label="LLM 동작 방식 안내"
        aria-expanded={isHelpOpen}
      >
        ?
      </button>

      {isHelpOpen && (
        <div
          ref={helpPopoverRef}
          className="lsp-help-popover"
          role="dialog"
          aria-label="LLM 동작 방식 안내"
        >
          <div className="lsp-help-header">
            <div className="lsp-help-title-wrap">
              <strong>Hanna's LLM은 어떻게 동작하나요?</strong>
            </div>
            <button
              type="button"
              className="lsp-help-close"
              onClick={() => setIsHelpOpen(false)}
              aria-label="안내 닫기"
            >
              <CloseIcon size={14} />
            </button>
          </div>
          <div className="lsp-help-body">
            <ReactMarkdown components={helpMarkdownComponents}>
              {HELP_MODAL_MARKDOWN}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
