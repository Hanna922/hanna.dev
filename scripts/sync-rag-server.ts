import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCanonicalRagDocuments,
  type CanonicalRagDocument,
} from "../src/lib/rag/canonical-documents";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const DEFAULT_RAG_SERVER_URL = "http://localhost:8080";
const DEFAULT_ADMIN_HEADER = "X-Internal-Api-Key";

async function loadEnvFile(filePath: string) {
  const raw = await readFile(filePath, "utf-8").catch(() => "");
  if (!raw) return;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function loadEnv() {
  await loadEnvFile(path.join(root, ".env.development"));
  await loadEnvFile(path.join(root, ".env"));
}

async function main() {
  await loadEnv();

  const ragServerUrl = process.env.RAG_SERVER_URL ?? DEFAULT_RAG_SERVER_URL;
  const adminApiKey =
    process.env.RAG_SERVER_ADMIN_API_KEY ?? process.env.INTERNAL_ADMIN_API_KEY;
  const adminHeader =
    process.env.RAG_SERVER_ADMIN_HEADER ?? DEFAULT_ADMIN_HEADER;

  if (!adminApiKey) {
    throw new Error(
      "Missing RAG_SERVER_ADMIN_API_KEY or INTERNAL_ADMIN_API_KEY"
    );
  }

  const documents = await loadCanonicalRagDocuments();
  const payload = {
    syncId: new Date().toISOString(),
    replaceMissing: true,
    documents: documents satisfies CanonicalRagDocument[],
  };

  const response = await fetch(`${ragServerUrl}/internal/admin/index/full-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [adminHeader]: adminApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `RAG server sync failed (${response.status} ${response.statusText}): ${errorBody}`
    );
  }

  const result = (await response.json()) as {
    total: number;
    inserted: number;
    updated: number;
    deleted: number;
    skipped: number;
  };

  console.log(`Synced ${documents.length} canonical documents to ${ragServerUrl}`);
  console.log(`Inserted: ${result.inserted}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Deleted: ${result.deleted}`);
  console.log(`Skipped: ${result.skipped}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
