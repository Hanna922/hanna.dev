import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LLMSearchModal from "../src/components/llm-search/LLMSearchModal";

type LLMSearchModalLike = (props: { initialLocale?: "en" | "ko" }) => JSX.Element;

function run(name: string, fn: () => void) {
  fn();
  console.log(`PASS ${name}`);
}

run("LLMSearchModal server markup respects the provided English locale", () => {
  const Modal = LLMSearchModal as unknown as LLMSearchModalLike;
  const html = renderToStaticMarkup(createElement(Modal, { initialLocale: "en" }));

  assert.match(html, /Open AI Search/);
  assert.doesNotMatch(html, /AI 검색 열기/);
});
