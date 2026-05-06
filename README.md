# OpenCode - Copilot-Only Fork

> A hardened fork of [opencode](https://github.com/anomalyco/opencode) locked to GitHub Copilot. Safe for corporate use, with an autonomous **Autopilot** agent mode for unattended coding.

---

## Why This Fork

If your company has GitHub Copilot Business/Enterprise seats, you already have access to frontier models through the Copilot API. This fork strips OpenCode down to **only** use that API.

- **Zero data leakage** - the only outbound traffic goes to `api.githubcopilot.com` and `github.com`
- **Source-level patches** - share uploads, external proxies, third-party providers, auto-update checks, and telemetry are all removed at the code level, not behind env vars
- **Drop-in replacement** - same OpenCode TUI, LSP support, plan/build modes. Just locked to one provider.

## Autopilot Mode

Set a task. Walk away. Come back to finished work.

Autopilot is a new agent mode that runs fully autonomously - it auto-approves all tool calls, auto-continues when interrupted, and keeps working until the job is done.

### How It Works

1. Switch to autopilot agent via `Tab` key or start a session with `--agent autopilot`
2. Give it a task - it will not ask questions or pause for confirmation
3. When it finishes, it signals **"ALL TASKS COMPLETE"**

Two auto-continue mechanisms keep it moving:

- **Truncation recovery** - if the model hits the output token limit (`finish_reason: length`), a synthetic "continue" message is injected. Resets after productive tool calls.
- **Autopilot continuation** - if the agent stops without signaling completion, it gets re-prompted to keep working. Capped at 5 retries.

### Guardrails

Autopilot won't run forever. Built-in safety limits prevent runaway sessions:

| Guardrail | Default | Config Key |
|---|---|---|
| Token budget | 20M tokens (input + output + reasoning) | `autopilot_token_budget` |
| Time cap | 8 hours (480 minutes) | `autopilot_timeout_minutes` |
| Max auto-continues | 5 consecutive (resets on tool calls) | `auto_continue_max_retries` |

Configure in `.opencode.json`:

```json
{
  "experimental": {
    "autopilot_token_budget": 20000000,
    "autopilot_timeout_minutes": 480,
    "auto_continue_max_retries": 5
  }
}
```

### CLI Usage

Run autopilot from the command line with optional guardrails:

```bash
opencode run --agent autopilot --message "Refactor the auth module"
opencode run --agent autopilot --max-turns 100 --timeout 60 --message "Fix all lint errors"
```

| Flag | Description |
|---|---|
| `--agent autopilot` | Use the autopilot agent |
| `--max-turns N` | Max agent turns before exit (default: 200) |
| `--timeout N` | Timeout in minutes (default: 480) |

### Live Dashboard

When running in autopilot, the TUI sidebar shows a live status panel:

- **Time** - elapsed vs timeout cap
- **Tokens** - consumed vs budget
- **Continues** - auto-continue count

Indicators turn orange at 90% usage. Use `/autopilot` to view current settings.

## Security Patches

Every outbound network path except Copilot has been sealed at the source level:

| What | Patch |
|---|---|
| Share / conversation upload | Permanently disabled (`disabled = true`) |
| Reverse proxy to `app.opencode.ai` | Replaced with 404 |
| CORS for `*.opencode.ai` | Removed from allowlist |
| Auto-update checks | Short-circuited to return current version |
| Third-party providers | 19 SDK imports removed, only `github-copilot` retained |
| Non-Copilot auth plugins | Stripped (Codex, GitLab, Poe, Cloudflare) |
| Model registry | Allowlist enforced - only `github-copilot` models shown |

## Build from Source

Requires [Bun](https://bun.sh) >= 1.3.13.

```bash
git clone https://github.com/Zekai-Zhao-321/opencode.git
cd opencode
bun install
cd packages/opencode
OPENCODE_CHANNEL=latest bun run build
```

> **Important:** Set `OPENCODE_CHANNEL=latest` when building. Without it, the channel defaults to the git branch name (e.g. `main`), which creates a separate database file (`opencode-main.db`) instead of the shared `opencode.db`. This means sessions won't carry over between builds with different channels.

On Windows (PowerShell):

```powershell
$env:OPENCODE_CHANNEL = "latest"
bun run build
```

### Install the Binary

After building, the binary is at `dist/opencode-<platform>/bin/opencode`. Copy it to your PATH:

```bash
# Linux/macOS
cp dist/opencode-linux-x64/bin/opencode ~/.local/bin/

# Windows (PowerShell)
Copy-Item dist\opencode-windows-x64\bin\opencode.exe "$env:APPDATA\npm\opencode.exe"
```

### Dev Mode

Run from source without building:

```bash
cd packages/opencode
bun run --conditions=browser src/index.ts
```

## Configuration

Minimal `.opencode.json` (already included in the repo):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "github-copilot/claude-sonnet-4.6",
  "enabled_providers": ["github-copilot"],
  "provider": {
    "github-copilot": {
      "name": "GitHub Copilot",
      "env": ["GITHUB_TOKEN"]
    }
  },
  "share": "disabled"
}
```

Authentication happens through the standard Copilot device flow - run the binary and follow the prompts.

## Upstream

This fork tracks [anomalyco/opencode](https://github.com/anomalyco/opencode). The upstream project provides the core TUI, agent framework, LSP integration, and tool system. All credit to the OpenCode team.

---

MIT License - see [LICENSE](./LICENSE).
