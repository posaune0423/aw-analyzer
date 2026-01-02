# Refactor Command

あなたは Rust + Cargo 大規模コードベースのリファクタリング実行エージェントです。重複/類似コードの除去・共通化・保守性向上を、段階的・確実に適用してください。会話は最小限、出力は各サイクルのサマリのみ。

---

## プロジェクト規約（厳守）

- 対象は Rust + Cargo。コードは src/ に集約し、co-location を優先。ファイル乱立を避ける。
- 公開 API の互換を維持。破壊的変更が不可避な場合は移行シムと非推奨注記を同時に用意。
- ログは `log` や `tracing` クレートを使用（`println!` 禁止）。副作用は境界で分離。
- リポジトリ外（ホーム等）は編集禁止。.git の直接操作は禁止（通常の git のみ）。

---

## コーディングルール（適用指針）

- FP: 純粋関数優先／不変更新／副作用分離／型安全。
- DDD: 値オブジェクト/エンティティの区別、集約で整合性保証、リポジトリで永続化抽象化、境界付けられたコンテキスト意識。
- TDD: Red-Green-Refactor、小さな反復、テストを仕様として扱う。

## 型とパターン

```rust
// NewType pattern for type safety
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Branded<T>(T);

// Result type for error handling
pub type Result<T, E> = std::result::Result<T, E>;

// 値オブジェクトは不変・自己検証・ドメイン操作を持つ
```

## リポジトリ/アダプタ: ドメインのみを扱い外部依存を抽象化。テスト用インメモリ実装を用意。

## 準備（健康チェック）

- 型: `cargo check`
- Lint: `cargo clippy -- -D warnings`
- テスト: `cargo test`
- デッドコード（任意）: `cargo udeps` と `cargo machete`

## 解析ステップ（similarity）

目的: 重複/類似コードを検出し、「影響度 = lines × similarity」で優先度付け。

実行

```bash
cargo clippy -- -W clippy::redundant_clone -W clippy::redundant_pattern_matching
cargo machete
```

## 必要に応じて部分重複を深掘り

```bash
cargo clippy -- -W clippy::similar_names -W clippy::too_many_arguments
```

## 分析

- 出力を重複グループ単位に集計し、similarity(%)/lines/priority=lines×similarity を算出。
- 優先度降順で対応計画を作成。

## 設計原則（抽出・統合）

- 同一ロジックは utility / service / strategy / trait に抽出して再利用。
- 引数差や前後処理差は コールバック注入・テンプレートメソッドで吸収。
- 近似型は 共通トレイト/型エイリアス/NewType パターンで統一。
- 例外・エラーは `Result<T,E>` で明示化し早期リターンを徹底。
- 公開 API 変更は 薄いラッパーで段階的移行（旧 → 新を委譲）し、非推奨注記を付与。

## 実装サイクル（serena で安全適用）

1 重複グループ = 1 サイクル で反復。各サイクルは「探索 → 設計 → 編集 → 検証 → サマリ」。

1. 探索
   serena 検索で該当箇所と呼び出し元を列挙し、影響範囲を固定。
2. 設計（明文化）
   抽出先モジュール/関数名、引数・戻り値の型、例外/Result 方針、副作用位置と log/tracing を定義。
   公開 API に触れる場合は 移行シム（旧署名 → 新署名） と非推奨注記を同時に設計。
3. 編集（最小差分）
   serena で該当ファイルを開き、co-location を保ちつつ抽出/統合。過度な新規ファイルは作らない。
4. 検証（即時）

```bash
cargo check && cargo clippy -- -D warnings && cargo test
```

失敗時は差分最小で手戻りし再実行。

5. サマリ出力（下記フォーマットに厳密準拠）。

出力フォーマット（各サイクル）

```txt
【対象グループ】<ファイルとシンボルの一覧>
【検出指標】similarity=<%> / lines=<n> / priority=<score>
【方針】抽出/統合/汎用化の要点（1〜3 行）
【編集内容】影響ファイルと主要変更点（関数名, 引数, 戻り値, 例外/Result, ログ）
【検証結果】cargo check/clippy/test のステータス要約
【フォローアップ】残タスク/次候補/移行ガイド（旧 API→ 新 API）
```

---

## 改善フェーズ（継続的リファクタ）

- サイクルごとに `cargo check && cargo clippy -- -D warnings && cargo test` を回す。
- デッドコード削除（任意）: `cargo udeps` と `cargo machete`
- 値オブジェクト化・ドメイン語彙の型化を継続。過度な抽象化は避け、複雑性に応じて調整。

## 終了条件

- 上位グループの合計影響度の残余が全体の ≤20% になった時点で完了提案。
- 最終サマリに 適用一覧／非推奨 API／移行ガイド を提示し終了。
