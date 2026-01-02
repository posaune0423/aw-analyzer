# Dead Code Elimination

## Overview

This document explains how to detect dead code in Rust projects.

## Tool: cargo-udeps

### Installation and Execution

```bash
# Install cargo-udeps
cargo install cargo-udeps

# Check for unused dependencies
cargo udeps

# Check including dev dependencies
cargo udeps --all-targets

# Check for unused code (requires nightly)
cargo +nightly udeps
```

### Basic Usage

1. **Check help**

```bash
cargo udeps --help
```

2. **Check with default settings**

```bash
cargo udeps
```

3. **Check including dev dependencies**

```bash
cargo udeps --all-targets
```

4. **Check for unused code (nightly feature)**

```bash
cargo +nightly udeps
```

### Options

- `--all-targets`: Check all targets including tests and examples
- `--manifest-path <PATH>`: Path to Cargo.toml
- `--package <SPEC>`: Package to check

## Tool: cargo-machete

### Installation and Execution

```bash
# Install cargo-machete
cargo install cargo-machete

# Check for unused code
cargo machete

# Automatically remove unused code
cargo machete --fix
```

### Basic Usage

1. **Check for unused code**

```bash
cargo machete
```

2. **Automatically remove unused code**

```bash
cargo machete --fix
```

## Real Analysis Example

### 1. Initial Run

```bash
$ cargo udeps
```

Results:

- Unused dependencies listed
- Suggestions for removal

### 2. Run including dev dependencies

```bash
$ cargo udeps --all-targets
```

Results:

- Unused dev dependencies also listed

### 3. Check for unused code

```bash
$ cargo machete
```

Results:

- Unused functions, structs, and modules listed

## Interpreting Analysis Results

### Types of Unused Dependencies

1. **Unused External Dependencies**
   - Dependencies in Cargo.toml but not imported
   - Action: Remove from Cargo.toml

2. **Unused Dev Dependencies**
   - Dev dependencies not used in tests
   - Action: Remove if not needed

3. **Conditional Dependencies**
   - Features that are never enabled
   - Action: Review feature usage

### Types of Unused Code

1. **Unused Functions**
   - Private functions never called
   - Action: Remove if not needed

2. **Unused Structs/Enums**
   - Types defined but never instantiated
   - Action: Remove or mark as `#[allow(dead_code)]` if needed for future use

3. **Unused Imports**
   - Imports that are never used
   - Action: Remove (often auto-fixed by rustfmt)

## Recommended Workflow

1. **First run analysis only**

```bash
cargo udeps
cargo machete
```

2. **Review results and decide action plan**

- Dependencies that can be removed
- Code that can be deleted
- Code to keep for future use (mark with `#[allow(dead_code)]`)

3. **Clean up incrementally**

- First remove obviously unnecessary dependencies
- Then remove unused code
- Finally review conditional features

4. **Automatic fixes (carefully)**

```bash
# Take backup before running
git stash
cargo machete --fix
git diff  # Check changes
```

## Notes

1. **Conditional compilation**: `cargo-udeps` may not detect dependencies used in `#[cfg(...)]` blocks
2. **Macro usage**: Some dependencies may be used only in macros
3. **Re-exports**: Be careful with public re-exports in lib.rs

## Example in This Project

1. **Unused code found in diagnostics**
   - Unused imports in modules
   - Unused functions (commented out for potential future use)

2. **Actions taken**
   - Removed unused imports
   - Kept potentially useful code commented out or marked with `#[allow(dead_code)]`

3. **Results**
   - Cleaner codebase
   - Expected reduction in build size
