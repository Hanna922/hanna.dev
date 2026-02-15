// ============================================
// LLM Search - Type Definitions
// For: hanna-dev.co.kr (Astro v5 Blog)
// ============================================

/** 예시 질문 */
export const EXAMPLE_QUESTIONS: string[] = [
  "Stock Condition Analysis 프로젝트에 대해 설명해주세요.",
  "YDS 프로젝트에 대해 설명해주세요",
  "Yrano 프로젝트에 대해 설명해주세요",
  "마이그레이션 경험에서 겪은 에러는?",
  "대표 프로젝트 몇 가지를 설명해주세요",
  "블로그에서 다룬 기술 스택은?",
];

/** 블로그 포스트 데이터 */
export interface BlogPost {
  title: string;
  slug: string;
  description?: string;
  date?: string;
}

/** 채팅 메시지 */
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: BlogPost[];
};

/** 아이콘 공통 Props */
export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/** LLMSearch 컴포넌트 Props */
export interface LLMSearchModalProps {
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
