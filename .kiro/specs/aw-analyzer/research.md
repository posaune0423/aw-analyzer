---

## Summary

- **Feature**: `aw-analyzer`
- **Discovery Scope**: Extension（外部I/O: Slack Incoming Webhook / OpenAI）
- **Key Findings**:
  - Slack への配信は Incoming Webhook が最小実装であり、`@slack/webhook` が TypeScript で扱いやすい。
  - AI 生成は外部I/Oであり、Ports & Adapters 境界に隔離し、テストではスタブ注入で決定性を担保する。
  - Prompt は別ファイルとして管理し、Job から Repository 経由で取得することで編集・差し替えを容易にできる。

## Research Log

### Slack Incoming Webhook を用いた Markdown レポート通知

- **Context**: Requirement 14（Slack 等への Markdown 通知）を満たしつつ、Notifier 抽象/DI を維持したい。
- **Sources Consulted**:
  - [Incoming webhooks | Slack Developer Docs](https://docs.slack.dev/tools/node-slack-sdk/webhook)
  - [Using TypeScript | Slack Developer Docs](https://docs.slack.dev/tools/node-slack-sdk/typescript)
- **Findings**:
  - `@slack/webhook` の `IncomingWebhook` により、Webhook URL へ送信する最小のクライアントを構成できる。
  - SDK は TypeScript で利用可能で、Adapter に閉じ込めることで上位（Domain/Job）から Slack 依存を排除できる。
- **Implications**:
  - `SlackWebhookNotifier` を NotifierPort の Adapter として追加し、Webhook URL を設定（DI）として注入する。
  - Slack 送信失敗は `notifier_error` に分類してログ/終了コードへ反映する。

### OpenAI を用いたレポート生成（Analyzer 抽象）

- **Context**: Requirement 12（AI 分析とレポート生成）を “簡潔に” 実装したいが、テスト容易性（Requirement 11）とプライバシー（Requirement 10）を満たす必要がある。
- **Sources Consulted**:
  - [OpenAI JavaScript library docs](https://platform.openai.com/docs/libraries/javascript)
  - [openai/openai-node](https://github.com/openai/openai-node)
- **Findings**:
  - OpenAI の公式 JavaScript/TypeScript SDK（`openai`）を利用することで、API 呼び出しを比較的少ないコードで実装できる。
  - 生成結果は非決定的になり得るため、テストでは `AnalyzerPort` をスタブ注入して決定的出力を担保する必要がある。
- **Implications**:
  - `AnalyzerPort` を新設し、`OpenAiAnalyzer` はその Adapter として実装する（外部I/Oを境界へ閉じ込める）。
  - Analyzer へ渡す入力は “集約済みメトリクス/要約” に限定し、生データ（詳細イベント等）を送信しない（10.1, 10.6）。
  - AI 失敗時はフォールバック（決定的な `ReportFormatter`）または Job の安全な失敗を選択可能にする（12.3）。

### Prompt を別ファイルで管理する方針

- **Context**: Prompt を変更しやすくし、Job/Analyzer の実装から分離したい。
- **Sources Consulted**:
  - 仕様（Requirement 12, 13）とテスト容易性（Requirement 11）
- **Findings**:
  - Prompt をリポジトリ内のファイルとして管理し、実行時に読み込むことで差し替えが容易になる。
  - Prompt の欠落/読み取り失敗は設定不備として早期検出すべき。
- **Implications**:
  - `PromptRepositoryPort` と `FilePromptRepository` を設計に追加し、Prompt 名（例: `daily_report`）で取得する契約を提供する。

## Architecture Pattern Evaluation

| Option    | Description                   | Strengths                                 | Risks / Limitations                | Notes                               |
| --------- | ----------------------------- | ----------------------------------------- | ---------------------------------- | ----------------------------------- |
| Hexagonal | Ports & Adapters を維持し拡張 | 外部I/O（Slack/OpenAI）を隔離しテスト容易 | Adapter が増え設計が肥大化しやすい | 既存 `design.md` と steering に整合 |

## Design Decisions

### Decision: Slack 通知は `@slack/webhook` を Adapter に封じ込める

- **Context**: Requirement 14 とテスト容易性（Requirement 11）を両立したい。
- **Alternatives Considered**:
  1. 直接 `fetch` で Webhook を叩く — 依存は減るが、payload/将来変更の吸収が弱い
  2. `@slack/webhook` を利用 — SDK による型と最小APIで運用できる
- **Selected Approach**: `SlackWebhookNotifier` を追加し、Job は `NotifierPort` のみを参照する。
- **Rationale**: Domain を Slack 実装から隔離でき、差し替えやテストが容易。
- **Trade-offs**: 依存パッケージが増える。Webhook URL 管理が必要。
- **Follow-up**: レート制限/失敗時のリトライ方針は実装フェーズで検討する（要件に基づき最小は “失敗を記録”）。

### Decision: AI 生成は `AnalyzerPort` とフォールバック生成を併設する

- **Context**: AI 失敗や非決定性が運用/テストで問題になり得る（12.3, 12.5）。
- **Alternatives Considered**:
  1. AI のみ — 失敗時に通知不可、テストが不安定
  2. AI + 決定的フォールバック — 失敗時も最低限のレポートは出せる
- **Selected Approach**: `AnalyzerPort` を新設し、失敗時は `ReportFormatter` にフォールバック可能にする。
- **Rationale**: tick 運用の安定性とテスト容易性を両立できる。
- **Trade-offs**: 実装要素が増える。
- **Follow-up**: フォールバックの内容（セクション/表現）を Requirements 13 に沿って決める。

## Risks & Mitigations

- Slack Webhook URL の漏洩 — 設定は環境変数/ローカル設定ファイルに限定し、ログ出力を避ける
- Bun 実行環境での SDK 互換性 — `SlackWebhookClientPort` を経由し、問題があれば実装差し替えで切り分け可能にする
- AI 生成が不安定/失敗 — `AnalyzerPort` のスタブ注入とフォールバック生成を用意する
- プライバシー逸脱（生データ送信） — Analyzer 入力DTOを “集約済み” に限定し、境界で検査する

## References

- [Incoming webhooks | Slack Developer Docs](https://docs.slack.dev/tools/node-slack-sdk/webhook) — Slack Incoming Webhook の基本
- [Using TypeScript | Slack Developer Docs](https://docs.slack.dev/tools/node-slack-sdk/typescript) — Slack SDK の TypeScript 利用
- [OpenAI JavaScript library docs](https://platform.openai.com/docs/libraries/javascript) — OpenAI JS/TS SDK
- [openai/openai-node](https://github.com/openai/openai-node) — 公式SDKリポジトリ

# Research & Design Decisions

## Summary

- **Feature**: `aw-analyzer`
- **Discovery Scope**: Complex Integration
- **Key Findings**:
  - ActivityWatch の REST API ドキュメントは「未完で変更されうる」ことが明記されており、最新の詳細はローカル aw-server の API playground（`http://localhost:5600/api/`）で確認する前提が必要。
  - クエリ言語（`query_bucket`, `filter_keyvals`, `filter_period_intersect`, `merge_events_by_keys`, `sort_by_duration`, `find_bucket` など）は公式の “Working with data / Custom Queries” にまとまっており、Provider 内部で「クエリ文字列生成」を隔離するのが安全。
  - `mcp_code/` は axios を利用しているが、本体 CLI 実装では Bun 標準の `fetch` ベースにして依存を最小化しつつ、入力正規化とエラー整形のノウハウは移植するのが合理的。

## Research Log

### ActivityWatch REST API の安定性と参照元

- **Context**: Provider が `buckets` / `events` / `query` を呼ぶ必要があるが、API 仕様の“確定度”が要件（疎結合）に影響する。
- **Sources Consulted**:
  - [ActivityWatch REST API](https://docs.activitywatch.net/en/latest/api/rest.html)
  - 同ページ内の note: ローカル aw-server の API playground（`http://localhost:5600/api/`）が最新
- **Findings**:
  - REST API は開発中で変更されうる旨が明記されている。
  - `GET /api/0/buckets/` と `GET /api/0/buckets/<bucket_id>/events` などの存在が示されている。
  - Query API は詳細仕様ではなく “Writing Queries” への誘導になっている。
- **Implications**:
  - Provider は “ActivityWatch の詳細” を外部に漏らさない契約（`getDailyMetrics` 等）に固定し、内部で query/bucket 選定の変更を吸収できるようにする。
  - 仕様差分が出たときに、修正範囲を Provider に閉じ込める設計が必須。

### クエリ言語と canonical events の活用方針

- **Context**: 稼働/AFK/深夜/連続/上位アプリなどのメトリクスを安定に計算したい。
- **Sources Consulted**:
  - [Working with data](https://docs.activitywatch.net/en/latest/examples/working-with-data.html)
- **Findings**:
  - “Canonical events” は web UI と同等の処理済みデータであり、多くの用途の出発点として推奨されている。
  - クエリ言語の代表関数（`query_bucket` / `filter_keyvals` / `filter_period_intersect` / `merge_events_by_keys` / `sort_by_duration`）と、`find_bucket` や `__CATEGORIES__` といった補助要素が紹介されている。
- **Implications**:
  - Provider は最初の実装で “canonical 相当” を優先し、必要なメトリクスを `DailyMetrics` に落として返す。
  - “AWQL 方言差” を Job に持ち込まないため、クエリ文の構築・実行・結果パースは Provider 内に隔離する。

### 外部ドキュメント取得制約（参考）

- **Context**: `@jxa/run` の公式 README を直接参照したい。
- **Sources Consulted**:
  - プロジェクト steering 内の参照（`.kiro/steering/tech.md`）
- **Findings**:
  - 自動 fetch は robots 制約で取得できないサイトがある。
- **Implications**:
  - 設計書では “Notifier は差し替え可能” を強調し、JXA 固有の制約（対話不可環境など）を吸収できるようにする。

## Architecture Pattern Evaluation

| Option      | Description                                  | Strengths               | Risks / Limitations  | Notes                                  |
| ----------- | -------------------------------------------- | ----------------------- | -------------------- | -------------------------------------- |
| Hexagonal   | Core を Ports で抽象し Adapters を外側に置く | 疎結合、DI でテスト容易 | 層が増える           | Job/Provider/Notifier という要件と一致 |
| Layered     | CLI→Service→Infra                            | 学習コスト低            | 境界が曖昧になりがち | Provider/Notifier の差し替えが薄まる   |
| Script-only | 1ファイルで直書き                            | 最小                    | 変更耐性が低い       | 要件（汎用 Job、DI）と矛盾             |

## Design Decisions

### Decision: Provider/Notifier を Ports として固定し、Job を Domain に閉じ込める

- **Context**: 「任意条件・任意間隔」「AW依存の隔離」「外部なしでテスト」の同時達成。
- **Alternatives Considered**:
  1. Job が直接 AW API を叩く
  2. Provider を薄くし、集計ロジックを Job 側に置く
- **Selected Approach**: Provider は “メトリクス取得” の契約のみ公開し、AW API / AWQL / bucket 選定 / パースは Provider に封印する。Notifier も同様にポート化し、OS 依存を封印する。
- **Rationale**: 要件の「疎結合」「テスト容易性」「変更範囲局所化」に最も合致する。
- **Trade-offs**: Provider 実装が相対的に複雑になりやすい。
- **Follow-up**: Provider 内部の query 戦略（canonical vs raw events）を実装段階で確定し、fixture を整備する。

### Decision: HTTP は注入可能な HttpClient とし、Bun fetch ベースを標準にする

- **Context**: 依存最小化とテスト容易性、実行環境を Bun に寄せる。
- **Alternatives Considered**:
  1. axios をそのまま採用
  2. Bun `fetch` を利用
- **Selected Approach**: 既定実装は Bun `fetch` を利用し、`HttpClient` インターフェース（GET/POST）を注入可能にする。
- **Rationale**: Bun で追加依存を不要にしつつ、テストではモック注入で決定的に検証できる。
- **Trade-offs**: axios の便利機能（自動 JSON 等）を自前で補う必要がある。
- **Follow-up**: Provider における “JSON parse / HTTP エラー整形” の共通化。

## Risks & Mitigations

- ActivityWatch API 仕様差分 — Provider を境界に閉じ、ローカル API playground での確認手順を明記する
- クエリ言語の方言/結果フォーマット差 — query 結果のパースを境界で検証し、fixture でカバーする
- macOS 通知実装の環境依存 — Notifier を差し替え可能にし、テストでは InMemoryNotifier を使う

## References

- [ActivityWatch REST API](https://docs.activitywatch.net/en/latest/api/rest.html) — buckets/events/query の入口と「APIは未凍結」の注意
- [Working with data](https://docs.activitywatch.net/en/latest/examples/working-with-data.html) — canonical events とクエリ言語の基礎
