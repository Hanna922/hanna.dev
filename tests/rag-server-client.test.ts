import assert from "node:assert/strict";
import {
  buildRagServerPrompt,
  toClientSourceRefs,
} from "../src/lib/rag/server-client";

const sources = toClientSourceRefs([
  {
    docId: "project-timeline",
    title: "Project Timeline",
    url: "/posts/project-timeline/",
    score: 0.91,
    locale: "ko",
    sourceType: "custom",
  },
]);

assert.deepEqual(sources, [
  {
    title: "Project Timeline",
    slug: "/posts/project-timeline/",
  },
]);

const prompt = buildRagServerPrompt(
  "대표 프로젝트 경험을 소개해주세요",
  "[Source 1]\nTitle: Project Timeline\nURL: /posts/project-timeline/\nContent:\nImportant context",
  "ko"
);

assert.ok(prompt.includes("QUERY: 대표 프로젝트 경험을 소개해주세요"));
assert.ok(prompt.includes("CONTEXT:"));
assert.ok(prompt.includes("Project Timeline"));

console.log("rag-server-client.test.ts passed");
