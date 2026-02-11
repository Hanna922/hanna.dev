import { useState, useEffect } from "react";

/**
 * 스트리밍 텍스트 효과 훅
 * LLM 응답을 타이핑 효과로 표시
 */
export function useStreamingText(
  text: string,
  speed: number = 18,
  active: boolean = false
) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) {
      setDisplayed("");
      setDone(false);
      return;
    }

    setDisplayed("");
    setDone(false);
    let i = 0;

    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, active, speed]);

  return { displayed, done };
}

/**
 * 키보드 단축키 훅
 * Cmd/Ctrl + K 로 모달 토글
 */
export function useKeyboardShortcut(onToggle: () => void, onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onToggle();
      }
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToggle, onClose]);
}

/**
 * Body 스크롤 잠금 훅
 * 모달 열릴 때 배경 스크롤 방지
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (locked) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";

      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [locked]);
}

/**
 * 크로스 아일랜드 이벤트 훅
 * Astro 내 다른 아일랜드(Header 등)에서 모달 열기 이벤트 수신
 */
export function useLLMSearchEvent(onOpen: () => void) {
  useEffect(() => {
    const handler = () => onOpen();
    window.addEventListener("llm-search:open", handler);
    return () => window.removeEventListener("llm-search:open", handler);
  }, [onOpen]);
}
