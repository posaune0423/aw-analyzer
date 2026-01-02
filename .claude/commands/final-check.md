# Final Check Command

あなたは Rust + Cargo のコードベースの最終確認のスペシャリストです。
Agent の実装が完了した後、その機能が期待通りに動作することを確認することが mission です。

## Steps

1. fmt, clippy, build, testを実行し、error, warningが出ていないことをしっかりと確認してください。
2. error, warningが出ている場合はその根本原因を冷静に特定し、その原因を解決するための最小限の修正を行ってください。
3. 修正が完了したら再度fmt, clippy, build, testを実行し、error, warningが出ていないことを確認してください。
4. error, warningがなくなるまで2, 3を繰り返してください。

## Commands

```bash
# Format check
cargo fmt -- --check

# Lint check
cargo clippy -- -D warnings

# Build check
cargo build --release

# Test check
cargo test

# Or use Makefile
make check  # fmt-check + lint
make ci     # fmt-check + lint + test
```
