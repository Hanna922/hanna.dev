import { useState, useEffect, useRef } from "react";

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

export function useThrottledValue<T>(value: T, interval: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdated = useRef(Date.now());
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdated.current;

    if (elapsed >= interval) {
      setThrottled(value);
      lastUpdated.current = now;
    } else {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = setTimeout(() => {
        setThrottled(value);
        lastUpdated.current = Date.now();
        pendingTimer.current = null;
      }, interval - elapsed);
    }

    return () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, [value, interval]);

  // value가 최종값으로 확정되면 즉시 반영 (스트리밍 종료 시)
  useEffect(() => {
    return () => setThrottled(value);
  }, []);

  return throttled;
}
