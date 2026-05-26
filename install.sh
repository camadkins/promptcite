#!/usr/bin/env bash
# PromptCite installer shim — thin bootstrap that hands off to bin/install.js.
#
# All detection, merge, and install logic lives in bin/install.js. This shim
# exists for one reason only: to make `curl … | bash` work. Do NOT re-implement
# install logic here. One Node brain, two shell shims. The moment this file
# starts making per-agent decisions, it has to stay in lockstep with
# install.ps1, which is the bug. Keep this file dumb.
set -euo pipefail

REPO="camadkins/promptcite"

if ! command -v node >/dev/null 2>&1; then
  echo "promptcite: Node.js (>=18) required. Install:" >&2
  echo "  macOS:  brew install node" >&2
  echo "  Linux:  see https://nodejs.org or use nvm (https://github.com/nvm-sh/nvm)" >&2
  echo "  WSL:    follow Linux instructions inside your distro" >&2
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "promptcite: Node $NODE_MAJOR is too old. Need Node >=18." >&2
  echo "  Upgrade: https://nodejs.org" >&2
  exit 1
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]:-}")" 2>/dev/null && pwd)" || here=""
if [ -n "$here" ] && [ -f "$here/bin/install.js" ]; then
  exec node "$here/bin/install.js" "$@"
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "promptcite: npx required (ships with Node >=18). Reinstall Node.js." >&2
  exit 1
fi

exec npx -y "github:$REPO" "$@"
