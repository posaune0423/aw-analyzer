# Scripts

One-shot scripts for testing jobs without scheduling.

## Usage

```bash
# Display help
bun scripts/oneshot.ts help

# Fetch and display raw metrics from ActivityWatch
bun scripts/oneshot.ts metrics

# Generate daily summary
bun scripts/oneshot.ts summary

# Generate daily report (fallback, no AI)
bun scripts/oneshot.ts report

# Generate AI-powered report (requires OPENAI_API_KEY)
bun scripts/oneshot.ts report --ai

# Send report to Slack (requires SLACK_WEBHOOK_URL)
bun scripts/oneshot.ts report --slack

# Combine AI and Slack
bun scripts/oneshot.ts report --ai --slack

# Check continuous work alert
bun scripts/oneshot.ts alert

# Specify a different date
bun scripts/oneshot.ts report --date 2025-01-01

# Use a different ActivityWatch server
bun scripts/oneshot.ts metrics --aw-url http://192.168.1.100:5600

# Enable verbose logging
bun scripts/oneshot.ts report --verbose
```

## npm Scripts

For convenience, the following npm scripts are also available:

```bash
bun run oneshot           # Same as bun scripts/oneshot.ts
bun run oneshot:metrics   # Fetch metrics
bun run oneshot:summary   # Daily summary
bun run oneshot:report    # Generate report
bun run oneshot:alert     # Check continuous work alert
```

## Environment Variables

- `OPENAI_API_KEY`: Required for `--ai` option
- `SLACK_WEBHOOK_URL`: Required for `--slack` option
