#!/bin/bash
# list-targets.sh — list available symlink targets
# Derive MAIN_DIR from script location: scripts/ → install-skill/ → skills/ → .claude/ → Projects/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

echo "global → ~/.claude/skills/"
echo ""
echo "Sub-folders in Projects:"
for dir in "$MAIN_DIR"/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  [[ "$name" == .* ]] && continue   # skip hidden dirs
  echo "  $name → $dir.claude/skills/"
done
