export interface BlogPost {
  title: string;
  titleEn?: string;
  slug: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: BlogPost[];
}

export interface IconProps {
  size?: number;
  color?: string;
}

export interface LLMSearchModalProps {
  exampleQuestions?: string[];
}

export const EXAMPLE_QUESTIONS: string[] = [
  "Stock Condition Analysis 프로젝트에 대해 설명해주세요.",
  "YDS 프로젝트에 대해 설명해주세요",
  "마이그레이션 경험에서 겪은 에러는?",
  "Yrano 프로젝트에 대해 설명해주세요",
  "대표 프로젝트 몇 가지를 설명해주세요",
  "블로그에서 다룬 기술 스택은?",
];

export const EXAMPLE_QUESTIONS_EN: string[] = [
  "Explain the Stock Condition Analysis project.",
  "Explain the YDS project.",
  "What errors did you encounter during the migration experience?",
  "Explain the Yrano project.",
  "Explain a few representative projects",
  "What tech stacks have been covered on the blog?",
];

export function getExampleQuestions(locale: "en" | "ko") {
  return locale === "ko" ? EXAMPLE_QUESTIONS : EXAMPLE_QUESTIONS_EN;
}
