# Requirements Document

## Introduction

aw-analyzer は、macOS 上で定期的に起動される CLI として動作し、ActivityWatch 等の活動データからメトリクスを算出して条件に応じた通知を行う。運用は「plist 1枚・tick 1本」を基本とし、常駐プロセスを必要としない。任意条件のルール（Job）と、データソース（Provider）/通知手段（Notifier）を疎結合に保ち、外部サービスが利用できない環境でもテスト可能であることを重視する。加えて、メトリクス/要約を AI に分析させて見やすい Markdown レポートを生成し、Slack 等へ通知できる（オプション）。

## Requirements

### Requirement 1: CLI 実行モデル（tick 起動・即終了）

**Objective:** As a macOS ユーザー, I want 定期起動されるコマンドを1回実行して終了させたい, so that 常駐プロセスなしで通知運用できる

#### Acceptance Criteria

1. When aw-analyzer が CLI として起動されたとき, the aw-analyzer shall 指定されたサブコマンドに従って処理を実行する
2. When `tick` 相当の実行が開始されたとき, the aw-analyzer shall 当該 tick で実行すべきジョブ群を評価して処理する
3. The aw-analyzer shall 1回の `tick` 実行が完了したらプロセスを終了する
4. If `tick` 相当の実行で致命的なエラーが発生したとき, then the aw-analyzer shall 非ゼロの終了コードで終了する
5. The aw-analyzer shall 不正な CLI 引数が指定された場合に利用方法を提示できる

### Requirement 2: ジョブ（ルール）実行制御（汎用・拡張可能）

**Objective:** As a ユーザー, I want 複数の通知ルールをジョブとして追加したい, so that 任意条件の通知を増やせる

#### Acceptance Criteria

1. The aw-analyzer shall ジョブを一意に識別できる ID を持つ
2. When `tick` が実行されたとき, the aw-analyzer shall 各ジョブについて「実行すべきか」を評価する
3. When ジョブが「実行すべき」と評価されたとき, the aw-analyzer shall 当該ジョブを実行する
4. When ジョブが「実行すべきではない」と評価されたとき, the aw-analyzer shall 当該ジョブの実行をスキップする
5. The aw-analyzer shall 新しいジョブを追加する際に既存ジョブの仕様（受け入れ条件）を破壊しない

### Requirement 3: 通知（Notifier 抽象）と通知内容生成

**Objective:** As a ユーザー, I want ルールに応じた通知を受け取りたい, so that 行動改善やセルフモニタリングに活かせる

#### Acceptance Criteria

1. When ジョブが通知すべき結果を返したとき, the aw-analyzer shall Notifier を介して通知を発火する
2. The aw-analyzer shall 通知にタイトルと本文を含められる
3. Where 通知音が有効化されている場合, the aw-analyzer shall 通知に通知音の指定を含められる
4. If Notifier が通知発火に失敗したとき, then the aw-analyzer shall エラーとして扱い適切に記録できる
5. The aw-analyzer shall Notifier 実装を差し替え可能である（例: macOS 通知以外）

### Requirement 4: 通知抑制（cooldown）と冪等性

**Objective:** As a ユーザー, I want 同じ条件で通知が連発されないようにしたい, so that ノイズなく通知を利用できる

#### Acceptance Criteria

1. When ジョブが通知すべき結果を返したとき, the aw-analyzer shall cooldown に基づいて通知の可否を判定する
2. While cooldown 期間内である場合, the aw-analyzer shall 通知を送信しない
3. The aw-analyzer shall ジョブごとに独立した cooldown を適用できる
4. The aw-analyzer shall 1日1回等の「日付単位の冪等」な通知を実現できる（同一日内での重複通知を避けられる）
5. If 状態が破損または欠落しているとき, then the aw-analyzer shall 可能な範囲で安全側に動作し、連発を避けるための保守的な挙動を選べる

### Requirement 5: 状態管理（永続化・可搬・再実行耐性）

**Objective:** As a ユーザー, I want 前回実行や通知履歴を保持したい, so that スケジュールや cooldown を正しく機能させられる

#### Acceptance Criteria

1. The aw-analyzer shall ジョブ実行判定および cooldown 判定に必要な状態を永続化できる
2. When `tick` が複数回実行されたとき, the aw-analyzer shall 永続化した状態を読み取り次回判定に反映する
3. The aw-analyzer shall 状態ストアの保存場所を設定で変更できる
4. If 状態ストアの読み込みに失敗したとき, then the aw-analyzer shall 空状態として扱うか、明示的にエラー終了するかを選択できる
5. The aw-analyzer shall 状態書き込み時にデータを破損させない（部分書き込み等のリスクを低減する）

### Requirement 6: データ取得（Provider 抽象）と ActivityWatch 連携

**Objective:** As a ユーザー, I want ActivityWatch のデータから必要なメトリクスを得たい, so that ルール判定と通知文生成に使える

#### Acceptance Criteria

1. The aw-analyzer shall ジョブが必要とするメトリクスを Provider を介して取得できる
2. The aw-analyzer shall Provider の内部実装詳細（ActivityWatch の API・クエリ方言・bucket 等）をジョブから隠蔽する
3. When ActivityWatch が利用可能な場合, the aw-analyzer shall ActivityWatch からメトリクスを取得できる
4. If ActivityWatch が利用できない場合, then the aw-analyzer shall ジョブ実行を安全に失敗させるか、代替データ（fixture 等）で継続できる
5. The aw-analyzer shall ActivityWatch の接続先（例: base URL）を設定で変更できる

### Requirement 7: メトリクス算出（対象・粒度・表現）

**Objective:** As a ユーザー, I want 活動の要約や異常検知のためのメトリクスを得たい, so that 通知が具体的で行動に結びつく

#### Acceptance Criteria

1. The aw-analyzer shall 日次の活動メトリクスを算出できる（例: 稼働、AFK、深夜稼働、最大連続、上位アプリ）
2. The aw-analyzer shall 当日の活動メトリクスを算出できる（例: 最大連続などのリアルタイム寄り指標）
3. When 期間が指定されたとき, the aw-analyzer shall 指定期間に対するメトリクスを算出できる
4. The aw-analyzer shall 深夜帯などの特定時間帯に対するメトリクスを算出できる
5. The aw-analyzer shall メトリクスが欠損する場合にゼロまたは不明として扱い、通知文を破綻させない

### Requirement 8: スケジュール表現（起動頻度の上限を前提にした柔軟性）

**Objective:** As a ユーザー, I want 毎時 tick でも日次や条件付きの通知を実現したい, so that plist を増やさずに運用できる

#### Acceptance Criteria

1. The aw-analyzer shall 外部スケジューラの起動頻度（tick）を上限としてジョブ実行を制御できる
2. When 指定時刻以降の最初の tick が到来したとき, the aw-analyzer shall 日次ジョブを1回だけ実行できる
3. The aw-analyzer shall tick 毎に評価するジョブと、条件が満たされたときのみ通知するジョブを両立できる
4. The aw-analyzer shall 起動頻度を上げた場合でも同一設計で動作できる（同一 tick インターフェースで拡張可能）
5. The aw-analyzer shall 起動頻度が低い場合でも誤通知や連発を避けられる（状態と cooldown により抑制する）

### Requirement 9: 可観測性（ログ・診断）

**Objective:** As a 運用者, I want 失敗原因を追えるログが欲しい, so that トラブルシュートできる

#### Acceptance Criteria

1. The aw-analyzer shall `tick` 実行の開始/終了を記録できる
2. The aw-analyzer shall ジョブの実行/スキップ理由を記録できる
3. If Provider 呼び出しで失敗したとき, then the aw-analyzer shall エラー内容と影響範囲（どのジョブ/どの取得）が分かる形で記録できる
4. If 通知発火で失敗したとき, then the aw-analyzer shall エラー内容を記録できる
5. The aw-analyzer shall ログの冗長さ（例: quiet/verbose）を設定で変更できる

### Requirement 10: セキュリティ・プライバシー（ローカル運用前提）

**Objective:** As a ユーザー, I want 個人の活動データが外部に漏れないようにしたい, so that 安心して利用できる

#### Acceptance Criteria

1. The aw-analyzer shall 活動データの生データ（詳細イベント等）を外部（インターネット）に送信しない
2. The aw-analyzer shall ユーザーが明示的に設定した接続先（例: ActivityWatch, Slack 等）以外にアクセスしない
3. The aw-analyzer shall 状態ストアに保存する情報を最小限に抑える（通知制御に必要なキー・時刻等）
4. If デバッグログが有効なとき, then the aw-analyzer shall 可能な限り機微情報（フルな履歴等）の出力を抑制できる
5. The aw-analyzer shall ユーザーが状態ストアを削除して初期化できる
6. Where 外部通知（例: Slack）が有効化されている場合, the aw-analyzer shall 外部に送信する内容を要約/集約されたレポートに限定できる
7. The aw-analyzer shall 外部通知（例: Slack）を無効化できる

### Requirement 11: テスト容易性（外部依存なしでの検証）

**Objective:** As a 開発者, I want ActivityWatch が無い環境でも要件を検証したい, so that 安定した自動テストを回せる

#### Acceptance Criteria

1. The aw-analyzer shall Provider/Notifier を差し替えることで外部依存なしにジョブの動作を検証できる
2. The aw-analyzer shall 固定入力（fixture）に対してメトリクス算出と通知判定が再現可能である
3. When 同一の入力と状態が与えられたとき, the aw-analyzer shall 決定的な結果（同一の通知有無/本文）を返せる
4. The aw-analyzer shall スケジューリング判定（should-run）を単体でテスト可能である
5. The aw-analyzer shall Bun 環境で自動テストを実行できる

### Requirement 12: AI 分析（Analyzer 抽象）とレポート生成

**Objective:** As a ユーザー, I want 活動メトリクスを AI に分析してレポートを作成してほしい, so that 振り返りや改善点を分かりやすく把握できる

#### Acceptance Criteria

1. When レポート生成ジョブが実行されたとき, the aw-analyzer shall 指定された期間のメトリクス/要約入力を作成する
2. Where AI 分析が有効化されている場合, the aw-analyzer shall Analyzer を介してレポート本文（Markdown）を生成する
3. If AI 分析が利用できない、または失敗したとき, then the aw-analyzer shall 代替の決定的なレポート生成を行うか、ジョブを安全に失敗させる
4. The aw-analyzer shall Analyzer 実装を差し替え可能である（例: 外部 AI / ローカル AI / スタブ）
5. When 同一の入力が与えられたとき, the aw-analyzer shall Analyzer を差し替えた条件下で決定的なレポート文字列を返せる

### Requirement 13: Markdown レポートのフォーマット（可読性）

**Objective:** As a ユーザー, I want 見やすいフォーマットでレポートを読みたい, so that 重要点を素早く理解できる

#### Acceptance Criteria

1. The aw-analyzer shall レポートを Markdown として表現できる
2. The aw-analyzer shall レポートに対象期間（開始/終了）と生成時刻を含められる
3. The aw-analyzer shall レポートに少なくとも Summary と Key metrics のセクションを含められる
4. Where 異常/変化点が検出される場合, the aw-analyzer shall レポートに Notable changes/anomalies のセクションを含められる
5. If 値が欠損または不明のとき, then the aw-analyzer shall Markdown 上で欠損/不明を表現し、本文を破綻させない

### Requirement 14: Slack 等への Markdown 通知（レポート配信）

**Objective:** As a ユーザー, I want 作成したレポートを Slack などで受け取りたい, so that 日々の運用フローに組み込める

#### Acceptance Criteria

1. Where Slack 通知が有効化されている場合, the aw-analyzer shall Notifier を介して Markdown レポートを Slack に送信できる
2. The aw-analyzer shall レポート通知の宛先（例: Slack の送信先）を設定で変更できる
3. If Slack 通知が失敗したとき, then the aw-analyzer shall エラーとして扱い適切に記録できる
4. The aw-analyzer shall Slack 以外の通知手段にも拡張可能である（Notifier 実装の差し替え）
5. When 外部通知が無効化されているとき, the aw-analyzer shall ローカル通知（例: macOS 通知）を継続できる
