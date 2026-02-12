// ============================================
// LLMSearchModal.tsx
// 멀티턴 AI 검색 채팅 모달 + FAB 버튼
// Astro Layout에서 client:load 로 사용
// ============================================

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useCompletion } from "@ai-sdk/react";
import type { BlogPost, LLMSearchModalProps } from "./types";
import {
  useStreamingText,
  useKeyboardShortcut,
  useBodyScrollLock,
  useLLMSearchEvent,
  useThrottledValue,
} from "./hooks";
import { SparkleIcon, SendIcon, ExternalLinkIcon, CloseIcon } from "./Icons";
import "./llm-search.css";
import ReactMarkdown, { type Components } from "react-markdown";

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
  "YDS 프로젝트에 대해 설명해주세요",
  "Yrano 프로젝트에 대해 설명해주세요",
  "마이그레이션 경험에서 겪은 에러는?",
  "대표 프로젝트 몇 가지를 설명해주세요",
];

// Mock 모드 체크
const IS_MOCK_MODE = import.meta.env.PUBLIC_LLM_MOCK_MODE === "true";

// Mock 데이터
const MOCK_POSTS: BlogPost[] = [
  {
    title: "React Fiber in Reconcile Phase",
    slug: "/posts/react-fiber-in-reconcile-phase/",
  },
  {
    title: "Building a Custom React Renderer",
    slug: "/posts/building-a-custom-react-renderer/",
  },
];

const MOCK_ANSWER = `React Fiber는 React 16에서 도입된 새로운 재조정(Reconciliation) 엔진입니다. 기존 Stack Reconciler의 한계를 극복하기 위해 설계되었으며, 작업을 작은 단위(fiber)로 나누어 비동기적으로 처리할 수 있는 것이 핵심입니다.

블로그 글에서 다룬 주요 내용은 다음과 같습니다:

• **Fiber 노드 구조**: 컴포넌트의 인스턴스와 1:1로 매핑되며, type, stateNode, child, sibling, return 등의 속성을 가집니다.

• **Reconcile Phase**: beginWork()와 completeWork() 두 단계를 거쳐 변경사항을 수집하고, Commit Phase에서 실제 DOM에 반영합니다.

• **비동기 처리**: 작업 우선순위 지정과 중단/재개가 가능해져, 사용자 인터랙션에 더 빠르게 반응할 수 있습니다.

이러한 구조 덕분에 React는 대규모 애플리케이션에서도 부드러운 사용자 경험을 제공할 수 있게 되었습니다.`;

// ============================================
// Helpers
// ============================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const SOURCES_START = "<!-- SOURCES_START -->";
const SOURCES_END = "<!-- SOURCES_END -->";

/** 응답 텍스트에서 본문과 소스를 분리 (소스가 앞에 옴) */
function parseResponse(text: string): {
  content: string;
  sources: BlogPost[];
} {
  // 새 포맷: 소스가 앞에 오는 경우
  if (text.includes(SOURCES_START) && text.includes(SOURCES_END)) {
    const startIdx = text.indexOf(SOURCES_START) + SOURCES_START.length;
    const endIdx = text.indexOf(SOURCES_END);
    const content = text
      .slice(text.indexOf(SOURCES_END) + SOURCES_END.length)
      .trim();

    try {
      const sources = JSON.parse(text.slice(startIdx, endIdx));
      return { content, sources };
    } catch {
      return { content, sources: [] };
    }
  }

  // 기존 포맷 호환 (소스가 뒤에 오는 경우)
  if (text.includes("<!-- SOURCES -->")) {
    const [content, sourcesRaw] = text.split("<!-- SOURCES -->");
    try {
      return {
        content: content.trim(),
        sources: JSON.parse(sourcesRaw.trim()),
      };
    } catch {
      return { content: content.trim(), sources: [] };
    }
  }

  return { content: text, sources: [] };
}

/** 본문 내 Source/출처 참조를 클릭 가능한 링크로 변환 */
function linkifySources(content: string, sources: BlogPost[]): string {
  if (!sources || sources.length === 0) return content;

  // 매칭할 패턴들:
  // (Source [1])           → 기본 영문
  // (출처 1)               → 한글, 대괄호 없음
  // (출처 [1])             → 한글, 대괄호 있음
  // ([Source 1] "설명")    → 대괄호 + 인용 텍스트
  // [Source 1]             → 소괄호 없이 대괄호만
  // (Source 1, 2)          → 복수 참조 (개별 처리는 아래서)
  const pattern =
    /\(?(?:\[?(?:Source|출처)\s*\[?(\d+)\]?\]?(?:\s*[""]([^"""]*)[""])?)\)?/gi;

  // 1. 등장하는 번호를 순서대로 수집
  const usedNumbers: number[] = [];
  let match;
  const patternForScan = new RegExp(pattern.source, pattern.flags);
  while ((match = patternForScan.exec(content)) !== null) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && !usedNumbers.includes(num)) {
      usedNumbers.push(num);
    }
  }

  // 2. 등장 순서대로 sources 배열에 매핑
  const numberToSource = new Map<number, BlogPost>();
  usedNumbers.forEach((num, idx) => {
    if (idx < sources.length) {
      numberToSource.set(num, sources[idx]);
    }
  });

  // 3. 변환
  return content.replace(pattern, (original, numStr, quotedText) => {
    const num = parseInt(numStr, 10);
    const source = numberToSource.get(num);
    if (!source) return original;

    // 인용 텍스트가 있으면 그걸 링크 텍스트로, 없으면 "출처 N"
    const label = quotedText ? quotedText : `출처 ${numStr}`;
    return `[↗ ${label}](${source.slug})`;
  });
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

  // Source 참조를 클릭 가능한 링크로 변환
  const linkedContent = message.sources?.length
    ? linkifySources(message.content, message.sources)
    : message.content;

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

  return (
    <div className="llm-assistant-row">
      <div className="llm-avatar">
        <SparkleIcon size={14} />
      </div>
      <div className="llm-assistant-content">
        <div className="llm-assistant-bubble">
          <ReactMarkdown components={markdownComponents}>
            {linkedContent}
          </ReactMarkdown>
        </div>
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
  const [mockLoading, setMockLoading] = useState(false);
  const [mockCompletion, setMockCompletion] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---- useCompletion (실제 API 모드) ----
  const {
    input,
    setInput,
    handleInputChange,
    handleSubmit: submitToAPI,
    completion,
    isLoading: apiIsLoading,
    error,
    stop,
  } = useCompletion({
    api: "/api/search",
    streamProtocol: "text",
    body: {
      // 서버에 이전 대화 히스토리 전달
      history: messages.map(({ role, content }) => ({ role, content })),
    },
    onFinish: (_prompt, result) => {
      const { content, sources } = parseResponse(result);
      console.log("parsed sources:", sources);
      setMessages(prev => [
        ...prev,
        { id: generateId(), role: "assistant", content, sources },
      ]);
    },
  });

  // ---- Mock 모드 처리 ----
  const simulateMockResponse = useCallback((query: string) => {
    setMockLoading(true);
    setMockCompletion("");

    // 1. Thinking 단계 (1초)
    setTimeout(() => {
      // 2. 전체 응답을 즉시 설정 (useStreamingText가 타이핑 효과 처리)
      const fullResponse =
        MOCK_ANSWER + SOURCES_SEPARATOR + JSON.stringify(MOCK_POSTS);
      setMockCompletion(fullResponse);

      // 3. 타이핑 효과가 끝날 시간을 계산하여 완료 처리
      const typingDuration = MOCK_ANSWER.length * 12; // 12ms per character
      setTimeout(() => {
        const { content, sources } = parseResponse(fullResponse);
        setMessages(prev => [
          ...prev,
          { id: generateId(), role: "assistant", content, sources },
        ]);
        setMockLoading(false);
        setMockCompletion("");
      }, typingDuration + 500); // 타이핑 완료 후 0.5초 여유
    }, 1000);
  }, []);

  // ---- 모드에 따른 상태 선택 ----
  const isLoading = IS_MOCK_MODE ? mockLoading : apiIsLoading;
  const currentCompletion = IS_MOCK_MODE ? mockCompletion : completion;

  // ---- 스트리밍 중 표시할 텍스트 (소스 구분자 이전만) ----
  const rawStreamingText = useMemo(() => {
    if (!currentCompletion) return "";
    return parseResponse(currentCompletion).content;
  }, [currentCompletion]);

  // ---- 타이핑 효과 적용 (Mock 모드에서만) ----
  const { displayed: typedText } = useStreamingText(
    rawStreamingText,
    12, // 속도 (ms) - 낮을수록 빠름
    IS_MOCK_MODE && isLoading && !!currentCompletion
  );

  // Mock 모드: 타이핑 효과 적용, 실제 API: 스트리밍 그대로 사용
  const streamingText = IS_MOCK_MODE ? typedText : rawStreamingText;

  // ---- 스트리밍 중 소스와 본문을 실시간으로 분리 ----
  const { streamContent, streamSources } = useMemo(() => {
    if (!currentCompletion) return { streamContent: "", streamSources: [] };
    const parsed = parseResponse(currentCompletion);
    return { streamContent: parsed.content, streamSources: parsed.sources };
  }, [currentCompletion]);

  // ---- 스트리밍 중 텍스트에 소스 링크 적용 ----
  const linkedStreamingText = useMemo(() => {
    if (!streamContent) return "";
    if (streamSources.length > 0) {
      return linkifySources(streamContent, streamSources);
    }
    return streamContent;
  }, [streamContent, streamSources]);

  const throttledStreamingText = useThrottledValue(linkedStreamingText, 100);

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

  // ---- 상태 파생 ----
  const isIdle = messages.length === 0 && !isLoading;
  const isThinking = isLoading && !streamContent;
  const isStreaming = isLoading && !!streamContent;

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

    if (IS_MOCK_MODE) {
      // Mock 모드: 시뮬레이션 실행
      simulateMockResponse(trimmed);
      setInput("");
    } else {
      // 실제 API: submit 먼저, input 클리어는 나중에
      triggerSubmit();
      // requestSubmit()이 동기적으로 form의 현재 input 값을 캡처한 후 비움
      requestAnimationFrame(() => setInput(""));
    }
  };

  const handleReset = () => {
    setInput("");
    setMessages([]);
    if (IS_MOCK_MODE) {
      setMockLoading(false);
      setMockCompletion("");
    } else {
      stop();
    }
  };

  const handleExampleClick = (q: string) => {
    if (isLoading) return;

    setMessages(prev => [
      ...prev,
      { id: generateId(), role: "user", content: q },
    ]);

    if (IS_MOCK_MODE) {
      simulateMockResponse(q);
    } else {
      setInput(q);
      setTimeout(() => {
        triggerSubmit();
        requestAnimationFrame(() => setInput(""));
      }, 0);
    }
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
                      <ReactMarkdown components={markdownComponents}>
                        {throttledStreamingText}
                      </ReactMarkdown>
                      <span className="llm-cursor" />
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {!IS_MOCK_MODE && error && messages.length > 0 && (
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
                {IS_MOCK_MODE && (
                  <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                    🧪 MOCK 모드 ·{" "}
                  </span>
                )}
                AI가 블로그 콘텐츠를 기반으로 답변합니다 · 부정확할 수 있습니다
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
