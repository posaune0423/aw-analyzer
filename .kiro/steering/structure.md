# Project Structure

## Organization Philosophy

- **目的別に疎結合**: “外部I/O” と “ドメインロジック” を分離し、差し替え可能・テスト可能に保つ
- **小さなモジュール**: 1ファイル1責務を基本に、拡張点（Provider/Notifier/Job）を明示する
- **仕様駆動**: `.kiro/specs/` の要件を起点に設計・実装を進め、steering はパターンの記録に留める

## Directory Patterns

### Source code (primary)

**Location**: `/src/`  
**Purpose**: プロダクト本体の実装を置く（CLI / libs / utils を含む）  
**Example**: `src/cli.ts`, `src/libs/aw/api.ts`

### CLI

**Location**: `/src/cli.ts`  
**Purpose**: CLI のエントリポイント（tick 実行の起点）。引数解析→ジョブ評価→通知→終了を担当する  
**Example**: `bun run src/cli.ts`

### Utilities

**Location**: `/src/utils/`  
**Purpose**: 依存の少ない汎用処理（日時/フォーマット/小さな変換など）  
**Example**: `src/utils/dateRange.ts`

### Libraries (integration / domain modules)

**Location**: `/src/libs/`  
**Purpose**: 外部サービスやドメイン境界を含むモジュールを配置する（テストしやすい API に整える）  
**Example**: `src/libs/aw/api.ts`（ActivityWatch API wrapper）

### Tests

**Location**: `/tests/`  
**Purpose**: 自動テストを配置する。外部依存は注入で差し替え、fixture 入力で決定的に検証する  
**Example**: `tests/cli.test.ts`

### Scripts

**Location**: `/scripts/`  
**Purpose**: 開発用スクリプト（生成/変換/一括処理など）。プロダクト本体の依存関係を増やさない  
**Example**: `scripts/dev.ts`

### Legacy (temporary)

**Location**: `/mcp_code/`  
**Purpose**: 一時的に取り込まれた ActivityWatch 向け MCP サーバ/ツール群。`src/` へ移植（コピペ）後に削除する  
**Example**: `mcp_code/index.ts`, `mcp_code/query.ts`

### Kiro specs / steering

**Location**: `/.kiro/specs/`  
**Purpose**: 機能ごとの仕様（requirements/design/tasks）  
**Example**: `.kiro/specs/aw-analyzer/requirements.md`

**Location**: `/.kiro/steering/`  
**Purpose**: プロジェクトの “意思決定・パターン” の記録（網羅的仕様ではない）  
**Example**: `product.md`, `tech.md`, `structure.md`

## Naming Conventions

- **Files**: `camelCase.ts`（例: `getSettings.ts`）, テストは `*.test.ts`
- **Exports**: 目的が明確な命名を優先（例: MCP tool は `activitywatch_*_tool`）
- **Tool names**: 外部公開される名前は安定させる（例: `"activitywatch_run_query"`）

## Import Organization

```typescript
// Prefer ESM imports and local relative paths
import { activitywatch_run_query_tool } from "./query.js";
```

> `src/` 配下では、可能な限り “依存方向” を単純に保つ（CLI → libs/utils へ依存し、逆依存は作らない）

## Code Organization Principles

- **外部依存の抽象化**: ネットワーク/OS/外部APIは境界に閉じ、テストでは差し替える（依存性注入）
- **グローバル状態の回避**: 環境変数・現在時刻などは引数で上書きできる設計にする
- **純粋関数の分離**: 検証・計算・ルール判定などは副作用から切り離し、テスト容易性を上げる

---

_パターンを記録し、ファイルツリーの列挙はしない_
