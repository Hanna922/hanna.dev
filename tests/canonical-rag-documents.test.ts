import assert from "node:assert/strict";
import { loadCanonicalRagDocuments } from "../src/lib/rag/canonical-documents";

const documents = await loadCanonicalRagDocuments();

assert.ok(documents.length > 0, "canonical document export should not be empty");

const koBlogDoc = documents.find(doc => doc.docId === "big-migration-journey");
assert.ok(koBlogDoc, "should include the Korean blog document");
assert.equal(koBlogDoc?.baseSlug, "big-migration-journey");
assert.equal(koBlogDoc?.locale, "ko");
assert.equal(koBlogDoc?.sourceType, "blog");

const enBlogDoc = documents.find(doc => doc.docId === "big-migration-journey.en");
assert.ok(enBlogDoc, "should include the English blog document");
assert.equal(enBlogDoc?.baseSlug, "big-migration-journey");
assert.equal(enBlogDoc?.locale, "en");
assert.ok(
  enBlogDoc?.fullText.includes("Big Migration Journey"),
  "blog full text should include the post title"
);

const customDoc = documents.find(doc => doc.docId === "profile-overview");
assert.ok(customDoc, "should include the profile overview custom document");
assert.equal(customDoc?.baseSlug, "profile-overview");
assert.equal(customDoc?.locale, "neutral");
assert.equal(customDoc?.sourceType, "custom");

console.log("canonical-rag-documents.test.ts passed");
