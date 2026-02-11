// ============================================
// LLMSearchModal.tsx
// 메인 AI 검색 모달 + FAB 버튼
// Astro Layout에서 client:load 로 사용
// ============================================

import { useState, useRef, useEffect, useCallback } from "react";
import type { SearchPhase, BlogPost, LLMSearchModalProps } from "./types";
import {
  useStreamingText,
  useKeyboardShortcut,
  useBodyScrollLock,
  useLLMSearchEvent,
} from "./hooks";
import { SparkleIcon, SendIcon, ExternalLinkIcon, CloseIcon } from "./Icons";
import "./llm-search.css";

// ============================================
// Sub-components
// ============================================

/** 타이핑 인디케이터 */
function TypingDots() {
  return (
    <div className="llm-typing-dots">
      <span className="llm-dot" style={{ animationDelay: "0s" }} />
      <span className="llm-dot" style={{ animationDelay: "0.15s" }} />
      <span className="llm-dot" style={{ animationDelay: "0.3s" }} />
    </div>
  );
}

/** 참고 글 소스 카드 */
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

/** 예시 질문 버튼 */
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

// ============================================
// 기본 예시 질문
// ============================================
const DEFAULT_EXAMPLES: string[] = [
  "React Fiber가 뭔가요?",
  "Yrano 프로젝트에 대해 알려주세요",
  "마이그레이션 경험에서 겪은 에러는?",
  "Custom Renderer는 어떻게 만드나요?",
];

// ============================================
// Mock 데이터 (실제 구현 시 API 호출로 교체)
// ============================================
const MOCK_ANSWER = `React Fiber는 React 16에서 도입된 새로운 재조정(Reconciliation) 엔진입니다. 기존 Stack Reconciler의 한계를 극복하기 위해 설계되었으며, 작업을 작은 단위(fiber)로 나누어 비동기적으로 처리할 수 있는 것이 핵심입니다.

블로그 글에서 다룬 주요 내용은 다음과 같습니다:

• Fiber 노드는 컴포넌트의 인스턴스와 1:1로 매핑되며, type, stateNode, child, sibling, return 등의 속성을 가집니다.

• Reconcile Phase에서 Fiber는 beginWork()와 completeWork() 두 단계를 거쳐 변경사항을 수집하고, Commit Phase에서 실제 DOM에 반영합니다.

• 이 구조 덕분에 작업 우선순위 지정과 중단/재개가 가능해져, 사용자 인터랙션에 더 빠르게 반응할 수 있습니다.`;

const MOCK_SOURCES: BlogPost[] = [
  {
    title: "React Fiber in Reconcile Phase",
    slug: "/posts/react-fiber-in-reconcile-phase/",
    date: "2024.05.25",
  },
  {
    title: "Building a Custom React Renderer",
    slug: "/posts/building-a-custom-react-renderer/",
    date: "2024.05.20",
  },
];

// ============================================
// Main Component
// ============================================
export default function LLMSearchModal({
  exampleQuestions = DEFAULT_EXAMPLES,
}: LLMSearchModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [showSources, setShowSources] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  // ---- Hooks ----
  const { displayed: streamedText, done: streamDone } = useStreamingText(
    MOCK_ANSWER,
    14,
    phase === "answering"
  );

  const toggleModal = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  useKeyboardShortcut(toggleModal, closeModal);
  useBodyScrollLock(isOpen);
  useLLMSearchEvent(useCallback(() => setIsOpen(true), []));

  // ---- Effects ----
  useEffect(() => {
    if (streamDone) setPhase("done");
  }, [streamDone]);

  useEffect(() => {
    if (phase === "done") {
      const timer = setTimeout(() => setShowSources(true), 200);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (answerRef.current) {
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
    }
  }, [streamedText]);

  // ---- Handlers ----
  const handleSubmit = () => {
    if (!query.trim() || phase !== "idle") return;
    setPhase("thinking");
    // TODO: 실제 LLM API 호출로 교체
    setTimeout(() => setPhase("answering"), 1500);
  };

  const handleReset = () => {
    setQuery("");
    setPhase("idle");
    setShowSources(false);
    inputRef.current?.focus();
  };

  const handleExampleClick = (q: string) => {
    setQuery(q);
    setPhase("thinking");
    setTimeout(() => setPhase("answering"), 1500);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setIsOpen(false);
      handleReset();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
  };

  // ============================================
  // Render
  // ============================================
  return (
    <>
      {/* FAB (Floating Action Button) */}
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

      {/* Modal Overlay */}
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
              <button
                type="button"
                className="llm-close-btn"
                onClick={() => {
                  setIsOpen(false);
                  handleReset();
                }}
                aria-label="닫기"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {/* ---- Content ---- */}
            <div ref={answerRef} className="llm-modal-content">
              {/* Idle: 예시 질문 */}
              {phase === "idle" && (
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

              {/* User message bubble */}
              {phase !== "idle" && (
                <div className="llm-user-msg-row">
                  <div className="llm-user-bubble">{query}</div>
                </div>
              )}

              {/* Thinking */}
              {phase === "thinking" && (
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

              {/* Answer */}
              {(phase === "answering" || phase === "done") && (
                <div className="llm-assistant-row">
                  <div className="llm-avatar">
                    <SparkleIcon size={14} />
                  </div>
                  <div className="llm-assistant-content">
                    <div className="llm-assistant-bubble">
                      {streamedText}
                      {phase === "answering" && <span className="llm-cursor" />}
                    </div>

                    {/* Sources */}
                    {(phase === "done" || showSources) && (
                      <div className="llm-sources">
                        <div className="llm-sources-label">📎 참고한 글</div>
                        <div className="llm-sources-list">
                          {MOCK_SOURCES.map((post, i) => (
                            <SourceCard
                              key={i}
                              post={post}
                              index={i}
                              visible={showSources}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ---- Input Area ---- */}
            <div className="llm-modal-footer">
              {phase === "done" ? (
                <button
                  type="button"
                  className="llm-reset-btn"
                  onClick={handleReset}
                >
                  ↻ 새 질문하기
                </button>
              ) : (
                <div
                  className={`llm-input-wrapper ${phase !== "idle" ? "llm-input-active" : ""}`}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="블로그에 대해 질문해 보세요..."
                    disabled={phase !== "idle"}
                    className="llm-input"
                  />
                  <button
                    type="button"
                    className={`llm-send-btn ${query.trim() && phase === "idle" ? "llm-send-active" : ""}`}
                    onClick={handleSubmit}
                    disabled={!query.trim() || phase !== "idle"}
                    aria-label="전송"
                  >
                    <SendIcon size={15} />
                  </button>
                </div>
              )}
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
