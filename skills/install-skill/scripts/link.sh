#!/bin/bash
# link.sh — symlink an installed skill into a target location
# Usage: link.sh <SOURCE_SKILL_DIR> <TARGET>
#   SOURCE_SKILL_DIR — full path to the skill in MAIN_DIR/.claude/skills/<name>
#   TARGET           — "global" | full path to a project dir (e.g. /Users/nicholas/Desktop/Projects/splitlah-mvp)
set -e

SOURCE="$1"
TARGET="$2"

if [ -z "$SOURCE" ] || [ -z "$TARGET" ]; then
  echo "Usage: link.sh <SOURCE_SKILL_DIR> <TARGET>" >&2
  exit 1
fi

SKILL_NAME=$(basename "$SOURCE")

if [ "$TARGET" = "global" ]; then
  BASE_DIR="$HOME/.claude"
else
  BASE_DIR="$TARGET/.claude"
fi

DEST="$BASE_DIR/skills/$SKILL_NAME"

if [ -d "$DEST" ]; then
  echo "Already exists at $DEST — skipping"
  exit 0
fi

mkdir -p "$DEST"

# Symlink every item from source into dest
for item in "$SOURCE"/*; do
  [ -e "$item" ] || [ -L "$item" ] || continue
  # Resolve the real target (handles chains of symlinks)
  real=$(realpath "$item" 2>/dev/null || echo "$item")
  ln -sf "$real" "$DEST/$(basename "$item")"
done

echo "Symlinked $SKILL_NAME → $DEST"
