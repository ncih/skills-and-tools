#!/bin/bash
# setup-permissions.sh — add install-skill bash allowlist to the nearest settings.json
# Writes to the project-level .claude/settings.json if one exists (or can be created),
# otherwise falls back to the global ~/.claude/settings.json.
# Safe to re-run: checks for duplicates before writing.

set -e

# Derive SKILL_DIR from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GLOBAL_SKILL_DIR="$HOME/.claude/skills/install-skill"

# Scripts that need to run without prompts (both path variants: repo path and global symlink path)
PATTERNS=(
  "Bash(bash $SKILL_DIR/scripts/install.sh*)"
  "Bash(bash $SKILL_DIR/scripts/link.sh*)"
  "Bash(bash $SKILL_DIR/scripts/list-targets.sh*)"
  "Bash(bash $SKILL_DIR/scripts/setup-permissions.sh*)"
  "Bash(bash $GLOBAL_SKILL_DIR/scripts/install.sh*)"
  "Bash(bash $GLOBAL_SKILL_DIR/scripts/link.sh*)"
  "Bash(bash $GLOBAL_SKILL_DIR/scripts/list-targets.sh*)"
  "Bash(bash $GLOBAL_SKILL_DIR/scripts/setup-permissions.sh*)"
)

# Decide target settings file: use global
TARGET="$HOME/.claude/settings.json"

if [ ! -f "$TARGET" ]; then
  echo '{}' > "$TARGET"
fi

# Use python3 to safely merge permissions into existing JSON
python3 - "$TARGET" "${PATTERNS[@]}" << 'PYEOF'
import json, sys

target = sys.argv[1]
new_patterns = sys.argv[2:]

with open(target) as f:
    cfg = json.load(f)

perms = cfg.setdefault("permissions", {})
allow = perms.setdefault("allow", [])

added = []
for p in new_patterns:
    if p not in allow:
        allow.append(p)
        added.append(p)

with open(target, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")

if added:
    print(f"Added {len(added)} permission rule(s) to {target}")
else:
    print(f"All permission rules already present in {target}")
PYEOF
