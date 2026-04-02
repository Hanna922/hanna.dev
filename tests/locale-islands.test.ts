import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function run(name: string, fn: () => void) {
  fn();
  console.log(`PASS ${name}`);
}

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

run("locale-sensitive islands on static query routes are client-only", () => {
  const indexPage = read("src/pages/index.astro");
  const searchPage = read("src/pages/search.astro");
  const layout = read("src/layouts/Layout.astro");

  assert.match(
    indexPage,
    /<LLMSearchPage\s+client:only="react"\s+initialLocale=\{locale\}\s*\/>/
  );
  assert.doesNotMatch(indexPage, /<LLMSearchPage client:load/);

  assert.match(
    searchPage,
    /<SearchBar[\s\S]*client:only="react"[\s\S]*searchList=\{searchList\}[\s\S]*initialLocale=\{locale\}[\s\S]*\/>/
  );
  assert.doesNotMatch(searchPage, /<SearchBar client:load/);

  assert.match(
    layout,
    /<LLMSearchModal[\s\S]*client:only="react"[\s\S]*initialLocale=\{locale\}[\s\S]*\/>/
  );
  assert.doesNotMatch(layout, /<LLMSearchModal client:load/);
});
