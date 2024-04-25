import { type RefObject, useEffect } from "react";

interface UseIntersectionObserverOptions {
  threshold: number;
  rootMargin?: string;
}

export const useIntersectionObserver = (
  ref: RefObject<HTMLDivElement>,
  options: UseIntersectionObserverOptions
) => {
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-fade-in");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: options.rootMargin || "0px",
        threshold: options.threshold,
      }
    );

    const elements = ref.current?.querySelectorAll(".timeline-block");
    elements?.forEach(element => observer.observe(element));

    return () => observer?.disconnect();
  }, [ref, options]);
};
