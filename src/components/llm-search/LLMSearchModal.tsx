// ============================================
// LLMSearchModal.tsx
// 멀티턴 AI 검색 채팅 모달 + FAB 버튼
// Astro Layout에서 client:load 로 사용
// ============================================

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useCompletion } from "@ai-sdk/react";
import type { BlogPost, LLMSearchModalProps } from "./types";
import {
  useKeyboardShortcut,
  useBodyScrollLock,
  useLLMSearchEvent,
} from "./hooks";
import { SparkleIcon, SendIcon, ExternalLinkIcon, CloseIcon } from "./Icons";
import "./llm-search.css";

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

const SOURCES_SEPARATOR = "<!-- SOURCES -->";

const DEFAULT_EXAMPLES: string[] = [
  "YDS 프로젝트에 대해 설명해주세요.",
  "Yrano 프로젝트에 대해 설명해주세요.",
  "마이그레이션 경험에서 겪은 에러는?",
  "대표 프로젝트 몇 가지를 설명해주세요.",
];

// ============================================
// Helpers
// ============================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 응답 텍스트에서 본문과 소스를 분리 */
function parseResponse(text: string): {
  content: string;
  sources: BlogPost[];
} {
  if (!text.includes(SOURCES_SEPARATOR)) {
    return { content: text, sources: [] };
  }
  const [content, sourcesRaw] = text.split(SOURCES_SEPARATOR);
  try {
    return { content: content.trim(), sources: JSON.parse(sourcesRaw.trim()) };
  } catch {
    return { content: content.trim(), sources: [] };
  }
}

// ============================================
// Sub-components
// ============================================

function TypingDots() {
  return (
    <div className="llm-typing-dots">
      <span className="llm-dot" style={{ animationDelay: "0s" }} />
      <span className="llm-dot" style={{ animationDelay: "0.15s" }} />
      <span className="llm-dot" style={{ animationDelay: "0.3s" }} />
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
      className="llm-source-card"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transitionDelay: `${index * 80}ms`,
      }}
    >
      <span className="llm-source-index">{index + 1}</span>
      <span className="llm-source-title">{post.title}</span>
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

/** 저장된 채팅 메시지 렌더링 */
function ChatMessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="llm-user-msg-row">
        <div className="llm-user-bubble">{message.content}</div>
      </div>
    );
  }

  return (
    <div className="llm-assistant-row">
      <div className="llm-avatar">
        <SparkleIcon size={14} />
      </div>
      <div className="llm-assistant-content">
        <div className="llm-assistant-bubble">{message.content}</div>
        {message.sources && message.sources.length > 0 && (
          <div className="llm-sources">
            <div className="llm-sources-label">📎 참고한 글</div>
            <div className="llm-sources-list">
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
// Main Component
// ============================================
export default function LLMSearchModal({
  exampleQuestions = DEFAULT_EXAMPLES,
}: LLMSearchModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  } = useCompletion({
    api: "/api/search",
    onFinish: (_prompt, result) => {
      const { content, sources } = parseResponse(result);
      setMessages(prev => [
        ...prev,
        { id: generateId(), role: "assistant", content, sources },
      ]);
    },
  });

  // ---- 스트리밍 중 표시할 텍스트 (소스 구분자 이전만) ----
  const streamingText = useMemo(() => {
    if (!completion) return "";
    return parseResponse(completion).content;
  }, [completion]);

  // ---- 상태 파생 ----
  const isIdle = messages.length === 0 && !isLoading;
  const isThinking = isLoading && !completion;
  const isStreaming = isLoading && !!completion;

  // ---- Modal ----
  const toggleModal = useCallback(() => setIsOpen(p => !p), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  useKeyboardShortcut(toggleModal, closeModal);
  useBodyScrollLock(isOpen);
  useLLMSearchEvent(useCallback(() => setIsOpen(true), []));

  // ---- Auto-scroll ----
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, completion, isLoading, scrollToBottom]);

  // ---- Focus input when ready ----
  useEffect(() => {
    if (isOpen && !isLoading) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isLoading]);

  // ---- Handlers ----
  const triggerSubmit = useCallback(() => {
    const form = document.getElementById(
      "llm-search-form"
    ) as HTMLFormElement | null;
    if (form) form.requestSubmit();
  }, []);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // user 메시지를 히스토리에 즉시 추가
    setMessages(prev => [
      ...prev,
      { id: generateId(), role: "user", content: trimmed },
    ]);

    setInput("");
    triggerSubmit();
  };

  const handleReset = () => {
    setInput("");
    setMessages([]);
    stop();
  };

  const handleExampleClick = (q: string) => {
    if (isLoading) return;
    setInput(q);
    setMessages(prev => [
      ...prev,
      { id: generateId(), role: "user", content: q },
    ]);

    setTimeout(() => {
      const form = document.getElementById(
        "llm-search-form"
      ) as HTMLFormElement | null;
      if (form) form.requestSubmit();
      setInput("");
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

  // ============================================
  // Render
  // ============================================
  return (
    <>
      {/* Hidden form for useCompletion */}
      <form
        id="llm-search-form"
        onSubmit={e => {
          e.preventDefault();
          submitToAPI(e);
        }}
        style={{ display: "none" }}
      />

      {/* FAB */}
      {!isOpen && (
        <button
          type="button"
          className="llm-fab"
          onClick={() => setIsOpen(true)}
          aria-label="AI 검색 열기"
        >
          <SparkleIcon size={22} color="#fff" />
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="llm-backdrop" onClick={handleBackdropClick}>
          <div className="llm-modal" role="dialog" aria-modal="true">
            {/* ---- Header ---- */}
            <div className="llm-modal-header">
              <div className="llm-modal-title-group">
                <div className="llm-modal-icon">
                  <SparkleIcon size={13} color="#fff" />
                </div>
                <span className="llm-modal-title">Hanna.Dev AI</span>
                <span className="llm-badge">BETA</span>
              </div>
              <div className="llm-header-actions">
                <button
                  type="button"
                  className="llm-reset-inline-btn"
                  onClick={handleReset}
                  aria-label="대화 초기화"
                  title="대화 초기화"
                >
                  ↻
                </button>
                <button
                  type="button"
                  className="llm-close-btn"
                  onClick={() => setIsOpen(false)}
                  aria-label="닫기"
                >
                  <CloseIcon size={18} />
                </button>
              </div>
            </div>

            {/* ---- Chat Content ---- */}
            <div ref={scrollRef} className="llm-modal-content">
              {/* Idle: 예시 질문 */}
              {isIdle && (
                <div className="llm-idle-state">
                  <p className="llm-idle-subtitle">
                    블로그 글에 대해 무엇이든 물어보세요
                  </p>
                  <div className="llm-examples-list">
                    {exampleQuestions.map((q, i) => (
                      <ExampleButton
                        key={i}
                        question={q}
                        onClick={handleExampleClick}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 대화 히스토리 */}
              {messages.map(msg => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}

              {/* Thinking (로딩 시작, 아직 토큰 없음) */}
              {isThinking && (
                <div className="llm-assistant-row">
                  <div className="llm-avatar">
                    <SparkleIcon size={14} />
                  </div>
                  <div className="llm-assistant-bubble">
                    <div className="llm-thinking-label">
                      블로그 글을 분석하고 있어요...
                    </div>
                    <TypingDots />
                  </div>
                </div>
              )}

              {/* Streaming (토큰이 들어오는 중) */}
              {isStreaming && (
                <div className="llm-assistant-row">
                  <div className="llm-avatar">
                    <SparkleIcon size={14} />
                  </div>
                  <div className="llm-assistant-content">
                    <div className="llm-assistant-bubble">
                      {streamingText}
                      <span className="llm-cursor" />
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="llm-assistant-row">
                  <div className="llm-avatar">
                    <SparkleIcon size={14} />
                  </div>
                  <div className="llm-assistant-bubble">
                    <div className="llm-error-label">
                      오류가 발생했습니다: {error.message}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ---- Input (항상 하단에 고정, 항상 활성) ---- */}
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
                  placeholder="블로그에 대해 질문해 보세요..."
                  disabled={isLoading}
                  className="llm-input"
                />
                <button
                  type="button"
                  className={`llm-send-btn ${input.trim() && !isLoading ? "llm-send-active" : ""}`}
                  onClick={handleSubmit}
                  disabled={!input.trim() || isLoading}
                  aria-label="전송"
                >
                  <SendIcon size={15} />
                </button>
              </div>
              <div className="llm-disclaimer">
                AI가 블로그 콘텐츠를 기반으로 답변합니다 · 부정확할 수 있습니다
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
