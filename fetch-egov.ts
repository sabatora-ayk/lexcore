/**
 * TASK-002: e-Gov本文取得スクリプト（手動URL指定、Phase 0）
 *
 * 使い方:
 *   npx tsx scripts/fetch-egov.ts "https://laws.e-gov.go.jp/law/{law_id}"
 *   npx tsx scripts/fetch-egov.ts 343AC0000000097   (law_idを直接指定してもよい)
 *
 * 出力:
 *   /data/raw/{law_id}.txt          純粋な条文テキスト（AI解析への入力用）
 *   /data/raw/{law_id}.source.json  SourceDocument形式（TASK-007準拠のメタ情報）
 *
 * Phase 0の範囲:
 *   - 1回の実行で1件のURL/法令IDのみ処理する
 *   - 自動巡回・定期取得は行わない（Phase 1でGitHub Actions化する予定）
 *   - 附則・別表を含む完全な構造抽出は行わない（本則条文のみ、TASK-004のfail-closed
 *     方針と一致: 抽出できない構造はそもそも対象外として扱う）
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://laws.e-gov.go.jp/api/2";

// --- e-Gov API v2 のレスポンス構造（必要な部分のみ最小限に型付け） ---

interface LawNode {
  tag?: string;
  attr?: Record<string, string>;
  children?: (LawNode | string)[];
}

interface LawDataResponse {
  law_info?: {
    law_id?: string;
    promulgation_date?: string;
  };
  revision_info?: {
    law_title?: string;
  };
  law_full_text?: LawNode;
}

// --- URL / law_id 判定 ---

function extractLawId(input: string): string {
  // 「https://laws.e-gov.go.jp/law/{law_id}」形式からlaw_idを抽出。
  // URLでなければ、入力自体をlaw_id(または法令番号)とみなす。
  const match = input.match(/laws\.e-gov\.go\.jp\/law\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : input;
}

// --- API呼び出し ---

async function fetchLawData(lawId: string): Promise<LawDataResponse> {
  const url = `${BASE_URL}/law_data/${encodeURIComponent(lawId)}`;
  const res = await fetch(`${url}?response_format=json&law_full_text_format=json`);

  if (!res.ok) {
    throw new Error(
      `FATAL: e-Gov APIへのリクエストに失敗しました (status: ${res.status}) url=${url}`
    );
  }
  return (await res.json()) as LawDataResponse;
}

// --- JSONツリーからテキスト抽出（再帰） ---

function extractText(node: LawNode | string | (LawNode | string)[]): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && node.children) {
    return extractText(node.children);
  }
  return "";
}

// --- 特定タグを持つ要素を再帰的に全収集 ---

function findAllTags(node: LawNode | string | undefined, targetTag: string): LawNode[] {
  const results: LawNode[] = [];
  if (!node || typeof node === "string") return results;

  if (node.tag === targetTag) results.push(node);
  if (node.children) {
    for (const child of node.children) {
      results.push(...findAllTags(child as LawNode, targetTag));
    }
  }
  return results;
}

// --- Article群をテキストへ変換(prefixで本則/附則を区別する) ---

function articlesToText(articles: LawNode[], prefix: string): string {
  return articles
    .map((article) => {
      const titleNode = article.children?.find(
        (c) => typeof c !== "string" && c.tag === "ArticleTitle"
      ) as LawNode | undefined;
      const title = titleNode ? extractText(titleNode) : "";
      const body = extractText(article);
      const withTitle = body.startsWith(title) ? body : `${title}${body}`;
      // 本則の条文と附則の条文が同じ「第一条」等を持ちうるため、
      // 附則側には明示的に prefix("附則") を前置して文字列として区別する。
      // (TASK-004のextractArticleBlocksが「附則第一条」を「第一条」とは
      //  別の条文ブロックとして扱えるようにするための最小限の対応)
      return prefix ? `${prefix}${withTitle}` : withTitle;
    })
    .join("\n");
}

// --- MainProvision（本則）配下の条文をテキストとして連結 ---

function extractMainProvisionText(lawFullText: LawNode | undefined): string {
  if (!lawFullText) {
    throw new Error("FATAL: law_full_text がレスポンスに存在しません。");
  }

  const [mainProvision] = findAllTags(lawFullText, "MainProvision");
  if (!mainProvision) {
    throw new Error(
      "FATAL: MainProvision(本則)が見つかりません。附則・特殊構造のみの法令の可能性があり、" +
        "Phase 0では未対応のため処理を停止します。"
    );
  }

  const articles = findAllTags(mainProvision, "Article");
  if (articles.length === 0) {
    throw new Error("FATAL: Article(条文)が1件も見つかりませんでした。処理を停止します。");
  }

  return articlesToText(articles, "");
}

// --- SupplProvision（附則）配下のテキストを抽出（施行日取得のための最小対応） ---
//
// 附則には条文番号(第○条)が振られている場合と、番号なしの一段落のみの場合がある。
// Phase 0では高度な構造化は行わず、以下の最小限の方針のみ実装する:
//   - Article要素があれば、本則と同様に抽出し「附則」を前置して条番号衝突を回避する
//   - Article要素が無ければ、SupplProvision全体を「附則」という1ブロックとして扱う
function extractSupplProvisionsText(lawFullText: LawNode | undefined): string {
  if (!lawFullText) return "";

  const supplProvisions = findAllTags(lawFullText, "SupplProvision");
  if (supplProvisions.length === 0) return "";

  const blocks = supplProvisions.map((suppl) => {
    const articles = findAllTags(suppl, "Article");
    if (articles.length > 0) {
      return articlesToText(articles, "附則");
    }
    // 条番号なしの附則（単一段落のみ等）は、まるごと1ブロックとして扱う
    const wholeText = extractText(suppl);
    return `附則${wholeText}`;
  });

  return blocks.join("\n");
}

// --- メイン処理 ---

async function run(input: string): Promise<void> {
  const lawId = extractLawId(input);
  console.log(`取得中: law_id=${lawId}`);

  // fetchLawData/extractMainProvisionTextの失敗はここでthrowさせ、
  // main()側で一箇所にまとめてfail-closed終了する(自動リトライ・部分公開はしない)
  const data = await fetchLawData(lawId);
  const mainText = extractMainProvisionText(data.law_full_text);
  const supplText = extractSupplProvisionsText(data.law_full_text);
  // 附則(施行日等の根拠)を本則に続けて連結する。取得できなくても本則があれば
  // 処理は継続する(施行日のEvidenceが得られないだけで、fail-closedにより
  // effective_date自体が空欄になる。これはADR-001の想定内の挙動)
  const rawText = supplText ? `${mainText}\n${supplText}` : mainText;

  const resolvedLawId = data.law_info?.law_id ?? lawId;
  const title = data.revision_info?.law_title ?? "";
  const sourceUrl = `https://laws.e-gov.go.jp/law/${resolvedLawId}`;

  const outDir = path.resolve("data/raw");
  await mkdir(outDir, { recursive: true });

  const rawTextPath = path.join(outDir, `${resolvedLawId}.txt`);
  await writeFile(rawTextPath, rawText, "utf-8");

  // TASK-007: SourceDocument形式でメタ情報も保存しておく(AI解析はraw_textのみ使うが、
  // 将来Adapterを追加してもTASK-003/004側の入力形式を変えずに済むようにするため)
  const sourceDocument = {
    source: "e-gov",
    source_url: sourceUrl,
    title,
    published_at: data.law_info?.promulgation_date,
    document_type: "law" as const,
    raw_text: rawText,
  };
  const sourceDocPath = path.join(outDir, `${resolvedLawId}.source.json`);
  await writeFile(sourceDocPath, JSON.stringify(sourceDocument, null, 2), "utf-8");

  console.log(`OK: ${rawTextPath}`);
  console.log(`OK: ${sourceDocPath}`);
  console.log(`条文取得完了: "${title}" (${resolvedLawId})`);
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("使い方: npx tsx scripts/fetch-egov.ts <e-Gov URL または law_id>");
    process.exitCode = 1;
    return;
  }

  try {
    await run(input);
  } catch (err) {
    // 自動リトライ・自動修復・部分公開は一切しない。
    // 人間が原因を確認し、修正した上で再実行する(TASK-004以降と同じfail-closed方針)。
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

main();
