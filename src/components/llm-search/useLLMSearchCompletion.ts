import { useMemo } from "react";
import { useCompletion } from "@ai-sdk/react";
import type { BlogPost } from "./types";
import { useThrottledValue } from "./hooks";
import { linkifySources, parseResponse } from "./llmSearchUtils";

type SearchHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type UseLLMSearchCompletionOptions = {
  history: SearchHistoryMessage[];
  body?: Record<string, unknown>;
  onAssistantMessage: (message: {
    content: string;
    sources: BlogPost[];
  }) => void;
  throttleMs?: number;
  locale?: "ko" | "en";
};

export function useLLMSearchCompletion({
  body,
  onAssistantMessage,
  throttleMs = 100,
  locale = "ko",
}: UseLLMSearchCompletionOptions) {
  const {
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    completion,
    isLoading,
    error,
    stop,
  } = useCompletion({
    api: "/api/search",
    streamProtocol: "text",
    body,
    onFinish: (_prompt, result) => {
      onAssistantMessage(parseResponse(result));
    },
  });

  const { content: streamContent, sources: streamSources } = useMemo(() => {
    if (!completion) return { content: "", sources: [] };
    return parseResponse(completion);
  }, [completion]);

  const linkedStreamingText = useMemo(() => {
    if (!streamContent) return "";
    if (streamSources.length > 0) {
      return linkifySources(streamContent, streamSources, locale);
    }
    return streamContent;
  }, [streamContent, streamSources, locale]);

  const throttledStreamingText = useThrottledValue(
    linkedStreamingText,
    throttleMs
  );

  return {
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    completion,
    isLoading,
    error,
    stop,
    streamContent,
    throttledStreamingText,
  };
}
