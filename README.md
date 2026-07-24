# LexCore

一次情報から、人が意思決定可能な知識基盤（Decision Knowledge Infrastructure）を構築するプロジェクトです。

LexCoreは「AIで法律を要約するサービス」ではありません。AIは知識の生成者ではなく、一次情報を構造化・分類・根拠付きで整理するコンポーネントとして扱います（詳細は `docs/adr/ADR-001-fail-closed-explainability.md` を参照）。

## データフロー

```
e-Gov一次情報
    │  (scripts/fetch-egov.ts)
    ▼
data/raw/*            ← 取得した生の条文テキスト・SourceDocument（Git管理対象外）
    │  (scripts/analyze-law.ts prompt)
    ▼
data/prompts/*         ← AIへ渡すプロンプト（Git管理対象外）
    │  （人がClaudeへ貼り付け）
    ▼
data/responses/*       ← AIが生成したJSON（未検証、Git管理対象外）
    │  (scripts/analyze-law.ts validate)
    │  Evidence / Confidence / source_url / UUID形式を検証
    │  fail-closed: 1件でも違反があれば生成しない
    ▼
data/laws/*            ← 検証を通過した公開可能なKnowledge Data（Git管理対象）
    │
    ▼
Web UI (app/page.tsx)  ← data/laws/*.json をビルド時に直接読み込み表示
```

`data/laws/` に存在するファイルは、fail-closed検証（ADR-001）を通過したデータのみです。それ以外の中間生成物（`data/raw/`, `data/prompts/`, `data/responses/`）は未検証の作業データであり、公開対象ではないためGit管理対象外としています。

## セットアップ

```bash
npm install
```

## 使い方

```bash
# 1. e-Govから法令本文を取得
npx tsx scripts/fetch-egov.ts "https://laws.e-gov.go.jp/law/<law_id>"

# 2. プロンプトを生成
npx tsx scripts/analyze-law.ts prompt <law_id>

# 3. data/prompts/<law_id>.prompt.md の内容をClaude(Haiku系モデル)へ貼り付け、
#    出力されたJSONを data/responses/<law_id>.response.json として保存する

# 4. 検証（通過した場合のみ data/laws/<law_id>.json が生成される）
npx tsx scripts/analyze-law.ts validate <law_id>

# 5. Web UIで確認
npm run dev
```
