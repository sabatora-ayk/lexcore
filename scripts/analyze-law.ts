/**
 * TASK-004（修正版）: AI解析ワークフロー + Evidenceバリデーション（Phase 0）
 *
 * Phase 0はClaude APIへ依存しない。人がAIへ手動でプロンプトを貼り付け、
 * 出力を手動で保存し、それをこのスクリプトが検証する2段階ワークフローとする。
 * ANTHROPIC_API_KEYは不要。
 *
 * 使い方:
 *   1) プロンプト生成:
 *      npx tsx scripts/analyze-law.ts prompt <law_id>
 *      → /data/prompts/{law_id}.prompt.md が生成される。
 *      → その内容をClaude(Haiku系を標準とする。Phase 0では手動でモデルを選択する)へ
 *        貼り付け、出力されたJSONを /data/responses/{law_id}.response.json として保存する。
 *
 *   2) 検証と公開データ生成:
 *      npx tsx scripts/analyze-law.ts validate <law_id>
 *      → /data/responses/{law_id}.response.json を読み込み、Evidence/Confidence検証を行う。
 *      → 検証を通過した場合のみ /data/laws/{law_id}.json を生成する。
 *
 * fail-closed方針（ADR-001準拠）:
 *   - 検証エラー時、自動修復・自動再生成は行わない（人が手動でやり直す）
 *   - 部分公開は行わない（1項目でも違反があればファイルを一切生成しない）
 *
 * Phase 2以降のバックログ（今回は実装しない）:
 *   - types/ai-provider.ts の AIProvider を実装した自動API呼び出し（ClaudeProvider等）
 *   - promptコマンドとvalidateコマンドの自動連結（人手レビューを挟まない完全自動化）
 *   - law_id引数の省略: 現状は `prompt <law_id>` のように毎回law_idを手入力する必要が
 *     あるが、直前に fetch-egov.ts が生成した data/raw/*.source.json のうち
 *     最新の更新日時を持つファイルから law_id を自動推測できるようにする
 *     （複数法令を並行して扱う場合は誤爆のリスクがあるため、Phase 0では明示指定を維持する）
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { LawSummary, LawEvidence, Confidence } from "../types/law";
import type { SourceDocument } from "../types/source-document";

const PROMPT_TEMPLATE_PATH = path.resolve("prompts/law-summary-v1.md");

interface ValidationError {
  field: string;
  reason: string;
}

// --- Source Document読み込み ---

async function loadSourceDocument(lawId: string): Promise<SourceDocument> {
  const filePath = path.resolve("data/raw", `${lawId}.source.json`);
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as SourceDocument;
}

// --- プロンプト生成コマンド ---

async function runPromptCommand(lawId: string): Promise<void> {
  const doc = await loadSourceDocument(lawId);

  if (!doc.source_url || doc.source_url.trim().length === 0) {
    throw new Error("FATAL: SourceDocument.source_urlが存在しません。処理を停止します。");
  }

  const template = await readFile(PROMPT_TEMPLATE_PATH, "utf-8");
  if (!template.includes("{{raw_text}}")) {
    throw new Error(
      "FATAL: プロンプトテンプレートに {{raw_text}} プレースホルダーが見つかりません。"
    );
  }
  const prompt = template.replace("{{raw_text}}", doc.raw_text);

  const outDir = path.resolve("data/prompts");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${lawId}.prompt.md`);
  await writeFile(outPath, prompt, "utf-8");

  console.log(`OK: ${outPath} を生成しました。`);
  console.log("");
  console.log("次の手順:");
  console.log("  1. 上記ファイルの内容をClaude(Haiku系モデルを標準とする)へ貼り付ける");
  console.log(
    `  2. 出力されたJSONを data/responses/${lawId}.response.json として保存する`
  );
  console.log(`  3. npx tsx scripts/analyze-law.ts validate ${lawId} を実行する`);
}

// --- AI出力のJSONパース（防御的にコードフェンスを除去） ---

function parseModelOutput(raw: string): LawSummary {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as LawSummary;
  } catch {
    throw new Error(
      "FATAL: 貼り付けられたレスポンスがJSONとしてparseできません。" +
        "自動修復・再生成は行わず処理を停止します。Claudeの出力を確認し、" +
        "data/responses/{law_id}.response.json を修正・再保存してから再実行してください。"
    );
  }
}

// --- UUID形式チェック（Evidence.id） ---

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

// --- 条文ブロック抽出（第○条 〜 次条直前） ---

interface ArticleBlock {
  article: string;
  text: string;
}

function extractArticleBlocks(rawText: string): ArticleBlock[] {
  // fetch-egov.tsが本則条文には接頭辞なし、附則条文には「附則」を前置して出力する
  // (例: 本則の"第一条" / 附則の"附則第一条")ため、両方をそれぞれ独立したマーカーとして
  // マッチさせる。条番号のない附則(単一段落のみ)は「附則」単体をマーカーとして扱う。
  const pattern =
    /附則第[0-9〇一二三四五六七八九十百千]+条(の[0-9]+)?|第[0-9〇一二三四五六七八九十百千]+条(の[0-9]+)?|附則(?!第)/g;
  const markers: { article: string; index: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rawText)) !== null) {
    markers.push({ article: match[0], index: match.index });
  }

  return markers.map((marker, i) => {
    const start = marker.index;
    const end = i + 1 < markers.length ? markers[i + 1].index : rawText.length;
    return { article: marker.article, text: rawText.slice(start, end) };
  });
}

function findArticleBlock(article: string, blocks: ArticleBlock[]): ArticleBlock | null {
  return blocks.find((b) => b.article === article) ?? null;
}

// --- source_text照合（正規化 + n-gram一致率） ---

function normalize(text: string): string {
  return text
    .replace(/[\s　、。「」『』()（）]/g, "")
    .replace(/しなければならない|してはならない|するものとする/g, "する");
}

function ngramMatchRatio(source: string, target: string, n = 4): number {
  if (source.length < n) return source.length > 0 && target.includes(source) ? 1 : 0;
  const grams = new Set<string>();
  for (let i = 0; i <= source.length - n; i++) grams.add(source.slice(i, i + n));
  let hit = 0;
  for (const g of grams) if (target.includes(g)) hit++;
  return hit / grams.size;
}

// --- Confidence構造検証 ---

function validateConfidenceShape(conf: Confidence | undefined, field: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!conf) {
    errors.push({ field, reason: "confidenceが存在しません" });
    return errors;
  }
  if (!["high", "medium", "low"].includes(conf.level)) {
    errors.push({ field, reason: `confidence.levelが不正な値です: "${conf.level}"` });
  }
  if (!conf.reason || conf.reason.trim().length === 0) {
    errors.push({ field, reason: "confidence.reasonが空です" });
  }
  return errors;
}

// --- Evidence配列の検証（構造 + 内容の両方） ---

function validateEvidenceList(
  claim: string,
  evidenceList: LawEvidence[] | undefined,
  field: string,
  blocks: ArticleBlock[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const hasClaim = typeof claim === "string" && claim.trim().length > 0;
  const hasEvidence = Array.isArray(evidenceList) && evidenceList.length > 0;

  if (hasClaim && !hasEvidence) {
    errors.push({
      field,
      reason: `"${field}" が生成されているが根拠(evidence)が0件のため却下`,
    });
    return errors;
  }

  if (!hasEvidence) return errors;

  for (const ev of evidenceList!) {
    if (!isValidUuid(ev.id)) {
      errors.push({ field, reason: `Evidence.idがUUID形式ではありません: "${ev.id}"` });
    }

    const block = findArticleBlock(ev.article, blocks);
    if (!block) {
      errors.push({
        field,
        reason:
          `存在しない条文番号、または条文ブロックとして抽出できない参照です: "${ev.article}"` +
          `（附則・別表など特殊構造の可能性。Phase 0では未対応）`,
      });
      continue;
    }

    if (!ev.source_text || ev.source_text.trim().length === 0) {
      errors.push({ field, reason: `evidence.source_textが空です (article: ${ev.article})` });
      continue;
    }

    const ratio = ngramMatchRatio(normalize(ev.source_text), normalize(block.text));
    if (ratio < 0.6) {
      errors.push({
        field,
        reason:
          `source_textが "${ev.article}" のブロック内に存在しません` +
          `（一致率: ${(ratio * 100).toFixed(0)}%）: "${ev.source_text}"`,
      });
    }

    if (ev.type !== "explicit" && ev.type !== "derived") {
      errors.push({ field, reason: `evidence.typeが不正な値です: "${ev.type}"` });
    }
  }

  return errors;
}

// --- 統合バリデーション ---

function validateLawSummary(law: LawSummary, rawText: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const blocks = extractArticleBlocks(rawText);

  const claimFields: {
    claim: keyof LawSummary;
    evidence: keyof LawSummary;
    confidence: keyof LawSummary;
  }[] = [
    { claim: "affected", evidence: "affected_evidence", confidence: "affected_confidence" },
    {
      claim: "impact_household",
      evidence: "impact_household_evidence",
      confidence: "impact_household_confidence",
    },
    { claim: "impact_sme", evidence: "impact_sme_evidence", confidence: "impact_sme_confidence" },
  ];

  for (const { claim, evidence, confidence } of claimFields) {
    errors.push(
      ...validateEvidenceList(
        law[claim] as string,
        law[evidence] as LawEvidence[] | undefined,
        evidence,
        blocks
      )
    );
    errors.push(...validateConfidenceShape(law[confidence] as Confidence | undefined, confidence));
  }

  errors.push(
    ...validateEvidenceList(
      law.effective_date,
      law.effective_date_evidence,
      "effective_date_evidence",
      blocks
    )
  );

  if (!law.source_url || law.source_url.trim().length === 0) {
    errors.push({ field: "source_url", reason: "source_urlが存在しません" });
  }

  return errors;
}

// --- 検証コマンド ---

async function runValidateCommand(lawId: string): Promise<void> {
  const doc = await loadSourceDocument(lawId);

  const responsePath = path.resolve("data/responses", `${lawId}.response.json`);
  let rawResponse: string;
  try {
    rawResponse = await readFile(responsePath, "utf-8");
  } catch {
    throw new Error(
      `FATAL: ${responsePath} が見つかりません。` +
        `先に "prompt" コマンドでプロンプトを生成し、Claudeの出力をこのパスへ保存してください。`
    );
  }

  const parsed = parseModelOutput(rawResponse);

  // source_url / created_atはAIに生成させず、プログラム側で確定情報を付与する
  const law: LawSummary = {
    ...parsed,
    source_url: doc.source_url,
    created_at: new Date().toISOString(),
  };

  const errors = validateLawSummary(law, doc.raw_text);
  if (errors.length > 0) {
    console.error(
      `FATAL: Evidence/Confidence検証エラー。law_id=${lawId} は公開不可として停止します。`
    );
    for (const e of errors) console.error(`  - [${e.field}] ${e.reason}`);
    throw new Error("VALIDATION_FAILED");
  }

  const outDir = path.resolve("data/laws");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${lawId}.json`);
  await writeFile(outPath, JSON.stringify(law, null, 2), "utf-8");

  console.log(`OK: ${outPath} を生成しました（Evidence/Confidence検証済み）`);
}

// --- エントリポイント ---

async function main() {
  const command = process.argv[2];
  const lawId = process.argv[3];

  if ((command !== "prompt" && command !== "validate") || !lawId) {
    console.error("使い方:");
    console.error("  npx tsx scripts/analyze-law.ts prompt <law_id>");
    console.error("  npx tsx scripts/analyze-law.ts validate <law_id>");
    process.exitCode = 1;
    return;
  }

  try {
    if (command === "prompt") {
      await runPromptCommand(lawId);
    } else {
      await runValidateCommand(lawId);
    }
  } catch (err) {
    // 自動リトライ・自動修復・部分公開はしない(ADR-001 fail-closed)
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

main();
