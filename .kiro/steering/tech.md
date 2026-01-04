# Technology Stack

## Architecture

- **CLI（tick）実行**: 1回の起動で “判定→実行→通知→状態更新” を完結し、終了する
- **疎結合な拡張点**: Provider（データ取得）/ Job（判定・処理）/ Notifier（通知）を分離し、依存性注入で差し替え可能にする
- **決定的な評価**: 同一の入力（データ + 状態）に対して同一の結果を返すことを重視する（テストと運用の再現性）

## Core Technologies

- **Language**: TypeScript（`tsconfig.json`: strict, ESM 前提）
- **Runtime**: Bun
- **Module**: ESM（`package.json`: `"type": "module"`）

## Key Libraries

- **Lint**: ESLint + `typescript-eslint`（`eslint.config.ts`）
- **Format**: Prettier（import organize / oxc / tailwind プラグイン）
- **Result / Error handling**: `neverthrow`（境界I/Oでの失敗を `Result` として返す）
- **Validation**: `zod` + `@t3-oss/env-core`（`src/env.ts` で環境変数を型付け + 実行時検証）
- **Slack**: `@slack/webhook`（Incoming Webhook）+ Slack Web API（ファイルアップロード等）
- **AI**: `openai`（JSON 形式応答を前提にしたレポート生成。未設定時はフォールバック）
- **SVG → PNG**: `@resvg/resvg-js`（Slack での画像プレビューのため PNG 化）
- **macOS 通知**: `osascript` を `Bun.spawn` で実行し、通知を送る（`src/libs/notifier.ts`）

> 依存ライブラリは “開発パターンに影響するもの” のみを記録し、全依存の列挙はしない。

## Development Standards

### Type Safety

- **`strict: true`** を前提に設計し、型の穴（`any` 等）を増やさない
- **外部入力は検証**して境界で型を固める（API応答・設定・CLI引数など）

### Code Quality

- ESLint による静的解析を通す
- Prettier による自動整形を前提にする

### Testing

- テストは **外部依存を注入して差し替え可能**にし、ネットワーク/OS機能なしで検証できる形にする
- 重要なドメイン計算は **純粋関数**として切り出し、単体テストしやすくする

## Development Environment

### Required Tools

- Bun（ランタイム/パッケージ管理）

### Common Commands

```bash
bun install

# Run (tick)
bun run tick

# Weekly report (posts to Slack; requires bot token/channel id)
bun run weekly-report

# Lint / format / typecheck (scripts)
bun run lint
bun run format
bun run typecheck
```

## Key Technical Decisions

- **Bun を標準ランタイムにする**: 開発体験と実行環境の単純化（Node/npm 前提にしない）
- **常駐プロセスを避ける設計**: 1回の tick 実行を安全に再実行できるよう、状態管理と冪等性を重視する
- **外部依存の抽象化（DI）**: ActivityWatch や通知などの I/O を境界に閉じ、テストでは差し替える
- **macOS 通知は薄いラッパに閉じる**: OS 側の操作（`osascript`）は `src/libs/notifier.ts` に閉じ、テストではインメモリ notifier を差し替える
- **環境変数は境界で検証する**: `src/env.ts` で型付け・検証し、アプリ内で生の `process.env` / `Bun.env` を直接参照しない

---

_標準と意思決定を記録し、実装詳細や依存の網羅はしない_
