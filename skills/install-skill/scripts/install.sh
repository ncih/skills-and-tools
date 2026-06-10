#!/bin/bash
# install.sh — clone a skill from GitHub or migrate an existing skill into MAIN_DIR
# Usage:
#   install.sh <GITHUB_URL>           — clone and install
#   install.sh --migrate <SKILL_PATH> — copy existing skill into MAIN_DIR
set -e

# Derive MAIN_DIR from script location: scripts/ → install-skill/ → skills/ → .claude/ → Projects/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
SKILLS_DIR="$MAIN_DIR/.claude/skills"

# ── migrate mode ──────────────────────────────────────────────
if [ "$1" = "--migrate" ]; then
  SRC=$(cd "$2" && pwd)   # resolve to absolute path
  NAME=$(basename "$SRC")
  DEST="$SKILLS_DIR/$NAME"
  if [ -d "$DEST" ]; then
    echo "Already exists at $DEST — nothing to migrate"
    echo "skill_name=$NAME"
    echo "dest=$DEST"
    exit 0
  fi
  cp -r "$SRC" "$DEST"
  echo "skill_name=$NAME"
  echo "dest=$DEST"
  exit 0
fi

# ── clone mode ────────────────────────────────────────────────
GITHUB_URL="$1"
if [ -z "$GITHUB_URL" ]; then
  echo "Usage: install.sh <GITHUB_URL>" >&2
  exit 1
fi

REPO_NAME=$(basename "$GITHUB_URL" .git)
CLONE_DIR="$MAIN_DIR/.claude/${REPO_NAME}-repo"

if [ -d "$CLONE_DIR" ]; then
  echo "Repo already cloned — pulling latest..."
  git -C "$CLONE_DIR" pull --quiet
else
  git clone "$GITHUB_URL" "$CLONE_DIR"
fi

# Find skill entry point (skill.md or SKILL.md)
SKILL_MD=""
for candidate in \
  "$CLONE_DIR/skill.md" \
  "$CLONE_DIR/SKILL.md" \
  "$CLONE_DIR/${REPO_NAME}/skill.md" \
  "$CLONE_DIR/${REPO_NAME}/SKILL.md"; do
  if [ -f "$candidate" ]; then
    SKILL_MD="$candidate"
    break
  fi
done

# Fallback: search up to 3 levels deep
if [ -z "$SKILL_MD" ]; then
  SKILL_MD=$(find "$CLONE_DIR" -maxdepth 3 \( -name "skill.md" -o -name "SKILL.md" \) 2>/dev/null | head -1)
fi

if [ -z "$SKILL_MD" ]; then
  echo "ERROR: No skill.md or SKILL.md found in $CLONE_DIR" >&2
  exit 1
fi

# Extract name from YAML frontmatter
SKILL_NAME=$(grep -m1 '^name:' "$SKILL_MD" | sed 's/name:[[:space:]]*//' | tr -d '"'"'" | xargs 2>/dev/null || true)
[ -z "$SKILL_NAME" ] && SKILL_NAME="$REPO_NAME"

SKILL_SRC_DIR=$(dirname "$SKILL_MD")
DEST="$SKILLS_DIR/$SKILL_NAME"
mkdir -p "$DEST"

# Symlink the skill entry point as SKILL.md (convention)
ln -sf "$(realpath "$SKILL_MD")" "$DEST/SKILL.md"

# Symlink any adjacent resource directories
for dir in skills references assets scripts; do
  if [ -d "$SKILL_SRC_DIR/$dir" ]; then
    ln -sf "$(realpath "$SKILL_SRC_DIR/$dir")" "$DEST/$dir"
  fi
done

echo "skill_name=$SKILL_NAME"
echo "source=$SKILL_SRC_DIR"
echo "dest=$DEST"
