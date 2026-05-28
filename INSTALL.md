# Install PromptCite

One install. Adds `/receipt` to every supported AI coding/writing agent
on your machine.

> The one-liner URLs below resolve against the `main` branch by default.
> For maximum determinism, install from a tagged release (e.g.,
> `…/main/install.sh` → `…/v1.0.0/install.sh`) — tagged releases include
> a sigstore build-provenance attestation you can verify with
> `gh attestation verify <tarball> --repo camadkins/promptcite`.

## One-liner

**macOS / Linux / WSL / Git Bash**

```bash
curl -fsSL https://raw.githubusercontent.com/camadkins/promptcite/main/install.sh | bash
```

**Windows (PowerShell 5.1+)**

```powershell
irm https://raw.githubusercontent.com/camadkins/promptcite/main/install.ps1 | iex
```

What it does:

- Auto-detects every supported agent installed on your machine
  (Claude Code, Cursor, Codex, Gemini CLI, Copilot, etc.).
- For each one, runs that agent's native install path (plugin /
  extension / rule file / `npx skills add`).
- Wires Claude Code hooks where applicable.
- Skips anything you don't have. Safe to re-run. ~30 seconds end-to-end.

Want to preview before installing? Use `--dry-run`:

```bash
curl -fsSL https://raw.githubusercontent.com/camadkins/promptcite/main/install.sh | bash -s -- --dry-run
```

## Per-agent install

If you want to install for one agent (or want to see exactly what command
runs under the hood), use the table below. Every row also works as
`--only <id>` to the unified installer.

| Agent | Install command | Auto-activates? |
|---|---|:-:|
| **Claude Code** | `claude plugin marketplace add camadkins/promptcite && claude plugin install promptcite@promptcite` | Yes |
| **Gemini CLI** | `gemini extensions install https://github.com/camadkins/promptcite` | Yes |
| **Codex CLI** | `npx -y github:camadkins/promptcite -- --only codex --with-init` | Surgical block in `AGENTS.md` at project root |
| **Cursor** | `npx -y github:camadkins/promptcite -- --only cursor --with-init` | Per-project rule file at `.cursor/rules/promptcite-receipt.md` |
| **Windsurf** | `npx -y github:camadkins/promptcite -- --only windsurf --with-init` | Per-project rule file at `.windsurf/rules/promptcite-receipt.md` |
| **Cline** | `npx -y github:camadkins/promptcite -- --only cline --with-init` | Per-project rule file at `.clinerules/promptcite-receipt.md` |
| **GitHub Copilot** | `npx -y github:camadkins/promptcite -- --only copilot --with-init` | Repo-wide instructions via `--with-init` |
| **Continue** | `npx -y github:camadkins/promptcite -- --only continue --with-init` | Per-project rule file at `.continue/rules/promptcite-receipt.md` |
| **Roo Code** | `npx -y github:camadkins/promptcite -- --only roo --with-init` | Per-project rule file at `.roo/rules/promptcite-receipt.md` |
| **Aider** | `npx -y github:camadkins/promptcite -- --only aider --with-init` | Surgical block in `CONVENTIONS.md` at project root (load via `--read CONVENTIONS.md` or `.aider.conf.yml`) |

The full agent matrix lives in `bin/install.js` under the `PROVIDERS`
array. `npx skills add` covers ~25 long-tail agents via the
[vercel-labs/skills](https://github.com/vercel-labs/skills) registry —
see the registry for the up-to-date list.

For "auto-activates? No" agents, type `/receipt` once per session.

## Manual install (no `curl | bash`)

If you'd rather see exactly what runs:

```bash
git clone https://github.com/camadkins/promptcite.git
cd promptcite
node bin/install.js --dry-run --all   # preview every command
node bin/install.js --list             # inspect the agent matrix
node bin/install.js --all              # install for everything detected
```

## Flags

| Flag | Effect |
|---|---|
| `--all` | Install for every detected agent. The full ride. |
| `--only <id>` | One agent only. Repeatable: `--only claude --only cursor`. |
| `--dry-run` | Print every command. Write nothing. |
| `--with-init` | Drop always-on rule files into the current repo (`.cursor/`, `.windsurf/`, `.clinerules/`, `.github/copilot-instructions.md`, `AGENTS.md`). |
| `--config-dir <path>` | Override Claude Code config dir. Default: `$CLAUDE_CONFIG_DIR` or `~/.claude`. |
| `--non-interactive` | Never prompt. Auto-default when stdin is not a TTY. |
| `--no-color` | Disable ANSI colors. |
| `--list` | Print the full agent matrix and exit. |
| `--force` | Re-run even if already installed. |
| `--uninstall` | Remove everything. |
| `--version` / `-v` | Print version and exit. |
| `--help` / `-h` | Print this help and exit. |

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/camadkins/promptcite/main/install.sh | bash -s -- --uninstall
```

Or, from a clone: `node bin/install.js --uninstall`.

Removes the slash command from every agent the installer touched, the
shared rule file, and any `--with-init` artifacts in the current repo.

## Privacy

PromptCite makes **no network calls** during receipt generation. The
installer invokes the agent CLIs you already have installed and (with
`--with-init`) writes to known config directories — nothing else leaves
your machine. There is no telemetry, no analytics, no install ID.

See [`SECURITY.md`](./SECURITY.md) for the full threat model.
