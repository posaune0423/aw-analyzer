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
- **macOS automation (typed)**: JXA（`@jxa/run`）を使い、Bun + TypeScript から型安全に osascript/JXA を実行する（参考: `https://github.com/JXA-userland/JXA` / `https://github.com/JXA-userland/JXA/tree/master/packages/@jxa/run`）

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

# Run entrypoint
bun run index.ts

# Lint / format / typecheck (scripts)
bun run lint
bun run format
bun run type-check
```

## Key Technical Decisions

- **Bun を標準ランタイムにする**: 開発体験と実行環境の単純化（Node/npm 前提にしない）
- **常駐プロセスを避ける設計**: 1回の tick 実行を安全に再実行できるよう、状態管理と冪等性を重視する
- **外部依存の抽象化（DI）**: ActivityWatch や通知などの I/O を境界に閉じ、テストでは差し替える
- **macOS 通知/自動化は型安全に扱う**: OS 側の操作（osascript 等）は薄いラッパに閉じ、境界で入力/出力を検証する（テストでは実装を差し替える）

---

_標準と意思決定を記録し、実装詳細や依存の網羅はしない_
