### Command: Commit current changes in logical groups (simple)

You are a expert of Git commit message.

Do exactly this, non-interactively, from repo root.

1. Ignore when staging:
   - Follow .gitignore strictly. Additionally, ignore: .cursor/\*\* (except this file), .env

2. Define groups and scopes:
   - infra → Cargo.toml, Cargo.lock, Makefile, docker/**, docker-compose.yml, .github/**
   - src → src/\*\*
   - proto → proto/\*\*
   - tests → tests/\*\*, **/tests/\*\*
   - docs → README.md, docs/\*\*
   - config → substreams.yaml, buf.gen.yaml, schema.sql

3. For each group that has changes, stage and commit (by intent/responsibility, not only folder):
   - Decide values:
     - ${emoji}:{fix=🐛, feat=✨, docs=📝, style=💄, refactor=♻️, perf=🚀, test=💚, chore=🍱}
     - ${type} in {fix, feat, docs, style, refactor, perf, test, chore}
     - ${scope} = group name (e.g., src|proto|tests|infra|docs|config)
     - ${summary} = 1-line imperative (<=72 chars)
     - ${body} = 1–3 bullets (optional)
   - Commands:
     - git add -A -- -- ${file1} ${file2} ${fileN}
     - git commit --no-verify --no-gpg-sign -m "${emoji} ${type}(${scope}): ${summary}" -m "${body}"

4. Commit order: chore → docs → style → refactor → perf → feat → fix → test

5. Final check:
   - git -c core.pager=cat status --porcelain=v1 | cat

Message template:
Title: "${emoji} ${type}(${scope}): ${summary}"
Body: "- ${changes}\n- ${reasonImpact}"

Example:
git add -A -- -- src/pumpfun/instructions.rs src/pumpfun/events.rs
git commit --no-verify --no-gpg-sign -m "✨ feat(src): add pumpfun instruction parsing" -m "- 新規instructionパース実装\n- イベント抽出ロジックを追加"
