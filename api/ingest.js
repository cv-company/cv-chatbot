// scripts/ingest.mjs
// FAQ を Upstash Vector に投入する一回限り（更新時に再実行）のスクリプト。
//
//   実行: node scripts/ingest.mjs
//
// 前提: Upstash Vector のインデックスを「埋め込みモデル内蔵（Embedding Model）」で作成しておくこと。
//       日本語に強い  BAAI/bge-m3  を推奨（インデックス作成時に選択）。
//       内蔵モデルを使うと、別途 OpenAI / Voyage の埋め込みAPIキーが不要で、コストもほぼゼロになります。

import { Index } from "@upstash/vector";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

const faq = JSON.parse(
  readFileSync(join(__dirname, "..", "cv-company-faq.json"), "utf-8")
);

// 質問と回答を結合して埋め込む（質問の言い回し・回答内のキーワード両方にヒットしやすくなる＝再現率↑）
const records = faq.map((e) => ({
  id: e.id,
  data: `質問: ${e.question}\n回答: ${e.answer}`,
  metadata: {
    category: e.category,
    question: e.question,
    answer: e.answer,
  },
}));

const CHUNK = 20;
for (let i = 0; i < records.length; i += CHUNK) {
  const slice = records.slice(i, i + CHUNK);
  await index.upsert(slice);
  console.log(`upserted ${Math.min(i + CHUNK, records.length)}/${records.length}`);
}

const info = await index.info();
console.log("完了 ✅  登録ベクトル数:", info.vectorCount);
