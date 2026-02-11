// ============================================
// LLMSearchCTA.tsx
// 홈페이지에 배치할 AI 검색 유도 카드
// Astro index 페이지에서 client:visible 로 사용
// ============================================

import type { LLMSearchCTAProps } from "./types";
import { SparkleIcon } from "./Icons";
import "./llm-search-cta.css";

export default function LLMSearchCTA({
  title = "블로그에 궁금한 점이 있으신가요?",
  description = "AI가 블로그 글을 분석하여 질문에 답변해 드립니다.",
}: LLMSearchCTAProps) {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("llm-search:open"));
  };

  return (
    <button
      type="button"
      className="llm-cta-card"
      onClick={handleClick}
      aria-label="AI 검색 열기"
    >
      <div className="llm-cta-top">
        <div className="llm-cta-icon">
          <SparkleIcon size={16} color="#fff" />
        </div>
        <span className="llm-cta-title">{title}</span>
      </div>
      <p className="llm-cta-desc">
        {description} 클릭하거나 <kbd className="llm-cta-kbd">⌘K</kbd>를
        눌러보세요.
      </p>
    </button>
  );
}
