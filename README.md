# aw-analyzer

[ActivityWatch](https://activitywatch.net/) のデータを分析し、条件に応じた通知を行う macOS CLI ツール。

常駐プロセスを必要とせず、**1回の tick 実行で判定→通知→終了** する設計により、シンプルで信頼性の高い運用が可能です。

## ✨ 特徴

- 🔔 **スマート通知** - 作業時間や連続作業に基づいた通知
- 📊 **日次サマリー** - 1日の作業内容を要約して通知
- 🤖 **AI レポート** - OpenAI を使った詳細な活動分析（オプション）
- 💬 **Slack 連携** - レポートを Slack に自動投稿（オプション）
- 🧪 **テスト容易** - 依存性注入による高いテスタビリティ
- 🔒 **プライバシー重視** - すべてローカルで動作

## 📋 前提条件

- **macOS** - 通知は macOS ネイティブ機能を使用
- **[Bun](https://bun.sh/)** - JavaScript ランタイム
- **[ActivityWatch](https://activitywatch.net/)** - アクティビティトラッキング（`http://localhost:5600` で動作中）

## 🚀 インストール

```bash
# リポジトリをクローン
git clone https://github.com/posaune0423/aw-analyzer.git
cd aw-analyzer

# 依存関係をインストール
bun install
```

## 📖 使い方

### 基本コマンド

すべてのコマンドは `bun run <command>` で実行できます。

```bash
# ジョブを実行して通知を送信
bun run tick

# launchd サービスをインストール（自動実行）
bun run install-service

# launchd サービスをアンインストール
bun run uninstall-service

# 状態をリセット
bun run reset
```

### ユーティリティコマンド

手動でデータを確認・レポート生成するためのコマンドです。

```bash
# メトリクスを表示（作業時間、AFK時間、トップアプリなど）
bun run metrics

# 日次サマリーを表示
bun run summary

# 日次レポートを生成
bun run report

# 連続作業アラートをチェック
bun run alert
```

オプション付きで実行する場合は `--` の後に指定します：

```bash
# 特定日のレポートを AI で生成し Slack に送信
bun run report -- --date 2025-01-01 --ai --slack

# 昨日のメトリクスを詳細表示
bun run metrics -- --date 2025-01-01 --verbose
```

### ヘルプ・バージョン

```bash
# ヘルプを表示
bun run help

# バージョンを表示
bun run version
```

### オプション

| オプション         | 説明                                                |
| ------------------ | --------------------------------------------------- |
| `--verbose`        | 詳細なログを出力                                    |
| `--quiet`          | エラー以外の出力を抑制                              |
| `--interval <min>` | launchd 実行間隔（分、install のみ、デフォルト: 5） |
| `--dry-run`        | 変更を加えずに実行内容を表示（install/uninstall）   |

## 🔧 組み込みジョブ

### 1. Daily Summary（日次サマリー）

**実行時間**: 毎日 21:00

前日の作業時間と使用アプリ上位3つを通知します。

```
📊 Daily Summary - 2026-01-01
Work time: 6h 30m
Top apps: Cursor: 3h 20m, Chrome: 2h 10m, Slack: 1h
```

### 2. Continuous Work Alert（連続作業アラート）

**条件**: 連続作業時間が 90 分を超えた場合  
**クールダウン**: 30 分（連続通知を防止）

```
⚠️ Take a Break!
You've been working continuously for 1h 35m. Consider taking a short break.
```

### 3. Daily Report（日次レポート）

**実行時間**: 毎日 22:00

詳細な日次レポートを生成します。AI 分析と Slack 投稿はオプションです。

```
📊 Daily Report Generated
Report for 2026-01-01 has been generated.
```

## ⚙️ 環境変数

| 変数名              | 説明                              | 必須   |
| ------------------- | --------------------------------- | ------ |
| `OPENAI_API_KEY`    | OpenAI API キー（AI レポート用）  | いいえ |
| `SLACK_WEBHOOK_URL` | Slack Webhook URL（Slack 投稿用） | いいえ |

```bash
# 例: AI レポートと Slack 連携を有効化
export OPENAI_API_KEY="sk-..."
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."

bun run tick
```

## ⏰ 自動実行（launchd）

macOS の launchd を使って定期実行を設定できます。**CLI から簡単にインストール/アンインストールできます。**

### クイックセットアップ

```bash
# launchd サービスをインストール（5分間隔でデフォルト設定）
bun run install-service

# 10分間隔でインストール
bun run install-service -- --interval 10

# 変更内容をプレビュー（実際には変更しない）
bun run install-service -- --dry-run --verbose

# アンインストール
bun run uninstall-service
```

### サービス管理

```bash
# ログを確認
tail -f /tmp/aw-analyzer.log

# エラーログを確認
tail -f /tmp/aw-analyzer.error.log

# 手動で即座に実行
launchctl start com.aw-analyzer

# サービスを一時停止
launchctl stop com.aw-analyzer
```

### 環境変数の設定

インストール時に設定されている環境変数（`OPENAI_API_KEY`、`SLACK_WEBHOOK_URL`）は自動的に plist に含まれます。

```bash
# AI レポートと Slack 連携を有効化してインストール
export OPENAI_API_KEY="sk-..."
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
bun run install-service
```

### 手動で plist を作成する場合

`~/Library/LaunchAgents/com.aw-analyzer.plist` を手動で作成することもできます：

```bash
# plist内容をプレビュー
bun run install-service -- --dry-run --verbose
```

これで plist の内容を確認し、必要に応じて手動で調整できます。

## 🏗️ アーキテクチャ

```
src/
├── main.ts              # エントリーポイント（ジョブ登録）
├── cli.ts               # CLI 引数解析・コマンド実行
├── scheduler.ts         # ジョブ評価・通知オーケストレーション
├── jobs/                # 個別ジョブ実装
│   ├── continuous-work-alert.ts
│   ├── daily-summary.ts
│   └── report.ts
├── libs/                # 外部サービス連携
│   ├── activity-watch.ts   # ActivityWatch API
│   ├── analyzer.ts         # AI レポート生成
│   ├── notifier.ts         # macOS 通知
│   └── slack.ts            # Slack 連携
└── utils/               # ユーティリティ
    ├── date-utils.ts
    ├── logger.ts
    └── state-store.ts
```

### 設計原則

- **Tick 実行モデル**: 1回起動 → ジョブ評価 → 通知 → 終了（常駐しない）
- **冪等性**: クールダウンと日次キーにより、同一通知の重複を防止
- **疎結合**: Job / Provider / Notifier を分離し、テストでの差し替えが容易
- **状態管理**: `~/.aw-analyzer/state.json` にジョブ実行状態を保存

## 🛠️ 開発

```bash
# 型チェック
bun run typecheck

# リント
bun run lint
bun run lint:fix

# フォーマット
bun run format
bun run format:fix

# テスト
bun run test
```

## 📄 ライセンス

MIT
