import assert from "node:assert/strict";
import {
  DEFAULT_LOCALE,
  SEARCH_PARAM,
  buildLocaleHref,
  buildLocalePath,
  getLocaleFromSearchParams,
  resolveLocaleFromSearch,
} from "../src/utils/locale";

function run(name: string, fn: () => void) {
  fn();
  console.log(`PASS ${name}`);
}

run("getLocaleFromSearchParams returns only supported locales", () => {
  assert.equal(
    getLocaleFromSearchParams(new URLSearchParams(`${SEARCH_PARAM}=en`)),
    "en"
  );
  assert.equal(
    getLocaleFromSearchParams(new URLSearchParams(`${SEARCH_PARAM}=ko`)),
    "ko"
  );
  assert.equal(
    getLocaleFromSearchParams(new URLSearchParams(`${SEARCH_PARAM}=jp`)),
    null
  );
  assert.equal(getLocaleFromSearchParams(new URLSearchParams()), null);
});

run("resolveLocaleFromSearch falls back to the default locale", () => {
  assert.equal(resolveLocaleFromSearch(`?${SEARCH_PARAM}=en`), "en");
  assert.equal(resolveLocaleFromSearch(""), DEFAULT_LOCALE);
  assert.equal(resolveLocaleFromSearch(`?${SEARCH_PARAM}=unknown`), DEFAULT_LOCALE);
});

run("buildLocalePath keeps Korean as the default path and adds English query", () => {
  assert.equal(buildLocalePath("/posts/", "en"), "/posts/?lang=en");
  assert.equal(buildLocalePath("/posts/?page=2", "en"), "/posts/?page=2&lang=en");
  assert.equal(buildLocalePath("/posts/?lang=en&page=2", "ko"), "/posts/?page=2");
});

run("buildLocaleHref localizes only same-origin links", () => {
  const origin = "https://www.hanna-dev.co.kr";

  assert.equal(
    buildLocaleHref("/tags/react/?page=2", "en", origin),
    "/tags/react/?page=2&lang=en"
  );
  assert.equal(
    buildLocaleHref("/tags/react/?page=2&lang=en", "ko", origin),
    "/tags/react/?page=2"
  );
  assert.equal(
    buildLocaleHref("https://external.example/posts/?lang=en", "ko", origin),
    "https://external.example/posts/?lang=en"
  );
});
