// ============================================
// LLM Search - Type Definitions
// For: hanna-dev.co.kr (Astro v5 Blog)
// ============================================

/** 블로그 포스트 데이터 */
export interface BlogPost {
  title: string;
  slug: string;
  description?: string;
  date?: string;
}

/** 채팅 메시지 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: BlogPost[];
}

/** 검색 Phase 상태 */
export type SearchPhase = "idle" | "thinking" | "answering" | "done";

/** 아이콘 공통 Props */
export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/** LLM API 응답 (실제 백엔드 연동 시 사용) */
export interface LLMResponse {
  answer: string;
  sources: BlogPost[];
}

/** LLMSearch 컴포넌트 Props */
export interface LLMSearchModalProps {
  /** 예시 질문 목록 */
  exampleQuestions?: string[];
}

// ============================================
// Custom Event 타입 (Astro 크로스 아일랜드 통신)
// ============================================
declare global {
  interface WindowEventMap {
    "llm-search:open": CustomEvent;
    "llm-search:close": CustomEvent;
  }
}
