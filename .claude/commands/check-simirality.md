# Check Similarity Command

You are a expert of codebase similarity detection.
Your mission is to detect duplicate code in the codebase and provide a refactoring plan.

## Purpose

Detects duplicate Rust code using AST comparison for refactoring.

## AI 用プロンプト / AI Prompt

日本語:

```
`cargo-deny` や `cargo-udeps` でコードの意味的な類似が得られます。あなたはこれを実行し、ソースコードの重複を検知して、リファクタリング計画を立てます。細かいオプションは各ツールの `--help` で確認してください。
```

English:

```
Run `cargo-deny` or `cargo-udeps` to detect semantic code similarities. Execute these commands, analyze the duplicate code patterns, and create a refactoring plan. Check `--help` for detailed options.
```

## Tools

### cargo-deny

```bash
# Installation
cargo install cargo-deny

# Check for duplicate dependencies
cargo deny check

# Check licenses
cargo deny check licenses

# Check banned dependencies
cargo deny check bans
```

### cargo-udeps

```bash
# Installation
cargo install cargo-udeps

# Check for unused dependencies
cargo udeps

# Check for unused dev dependencies
cargo udeps --all-targets
```

### cargo-clippy

```bash
# Check for code duplication patterns
cargo clippy -- -W clippy::redundant_clone -W clippy::redundant_pattern_matching

# Check for similar code patterns
cargo clippy -- -W clippy::similar_names
```

## AI Refactoring Workflow

### 1. Broad Scan

Find all duplicates in codebase:

```bash
cargo deny check
cargo udeps
cargo clippy -- -W clippy::redundant_clone
```

### 2. Focused Analysis

Examine specific files:

```bash
cargo clippy -- -W clippy::redundant_clone path/to/file.rs
```

### 3. Manual Review

For semantic similarity, manual code review is recommended:
- Look for similar function patterns
- Check for repeated logic blocks
- Identify common error handling patterns

## Output Format

```
Warning: redundant clone at file.rs:line:column
Similar pattern found in other_file.rs:line:column
```

## Refactoring Strategy

1. **Start with clippy warnings** to find obvious duplicates
2. **Compare specific patterns** when similarity found
3. **Extract common logic** into shared functions/modules
4. **Re-run after refactoring** to verify no new duplicates

## Common Patterns to Refactor

- **Data processing loops** with different field names
- **Error handling** with similar patterns
- **Validation functions** with different rules
- **State management** with repeated patterns

## Best Practices

- Use `cargo clippy` for code quality checks
- Focus on files with repeated patterns first
- Check if similar functions are in same module (easier to refactor)
- Consider function size - larger duplicates have more impact
- Look for patterns across multiple files, not just pairs
