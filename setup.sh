#!/bin/bash
# setup.sh — configure this skills toolkit for a new machine
#
# Usage:
#   ./setup.sh                  # auto-detects MAIN_DIR as parent of this .claude/ folder
#   ./setup.sh /path/to/dir     # explicit MAIN_DIR (your Projects / workspace root)
#
# What it does:
#   1. Patches install-skill/SKILL.md with your MAIN_DIR and script paths
#   2. Initialises the graphify submodule
#   3. Symlinks all skills into ~/.claude/skills/ (global)

set -e

DOTCLAUDE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -n "$1" ]; then
  MAIN_DIR="$1"
else
  MAIN_DIR="$(cd "$DOTCLAUDE_DIR/.." && pwd)"
fi

SKILLS_DIR="$DOTCLAUDE_DIR/skills"
INSTALL_SKILL_MD="$SKILLS_DIR/install-skill/SKILL.md"
SCRIPTS_DIR="$SKILLS_DIR/install-skill/scripts"

echo "MAIN_DIR  : $MAIN_DIR"
echo "DOTCLAUDE : $DOTCLAUDE_DIR"
echo ""

# 1. Patch install-skill/SKILL.md
echo "→ Patching install-skill/SKILL.md..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|MAIN_DIR: \`.*\`|MAIN_DIR: \`$MAIN_DIR\`|g" "$INSTALL_SKILL_MD"
  sed -i '' "s|SCRIPTS: \`.*\`|SCRIPTS: \`$SCRIPTS_DIR\`|g" "$INSTALL_SKILL_MD"
  # patch inline script paths
  sed -i '' "s|bash /[^ ]*/install-skill/scripts/setup-permissions.sh|bash $SCRIPTS_DIR/setup-permissions.sh|g" "$INSTALL_SKILL_MD"
  sed -i '' "s|bash /[^ ]*/install-skill/scripts/install.sh|bash $SCRIPTS_DIR/install.sh|g" "$INSTALL_SKILL_MD"
  sed -i '' "s|bash /[^ ]*/install-skill/scripts/list-targets.sh|bash $SCRIPTS_DIR/list-targets.sh|g" "$INSTALL_SKILL_MD"
  sed -i '' "s|bash /[^ ]*/install-skill/scripts/link.sh|bash $SCRIPTS_DIR/link.sh|g" "$INSTALL_SKILL_MD"
else
  sed -i "s|MAIN_DIR: \`.*\`|MAIN_DIR: \`$MAIN_DIR\`|g" "$INSTALL_SKILL_MD"
  sed -i "s|SCRIPTS: \`.*\`|SCRIPTS: \`$SCRIPTS_DIR\`|g" "$INSTALL_SKILL_MD"
  sed -i "s|bash /[^ ]*/install-skill/scripts/setup-permissions.sh|bash $SCRIPTS_DIR/setup-permissions.sh|g" "$INSTALL_SKILL_MD"
  sed -i "s|bash /[^ ]*/install-skill/scripts/install.sh|bash $SCRIPTS_DIR/install.sh|g" "$INSTALL_SKILL_MD"
  sed -i "s|bash /[^ ]*/install-skill/scripts/list-targets.sh|bash $SCRIPTS_DIR/list-targets.sh|g" "$INSTALL_SKILL_MD"
  sed -i "s|bash /[^ ]*/install-skill/scripts/link.sh|bash $SCRIPTS_DIR/link.sh|g" "$INSTALL_SKILL_MD"
fi
echo "   done"

# 2. Initialise graphify submodule
echo "→ Initialising graphify submodule..."
git -C "$DOTCLAUDE_DIR" submodule update --init --recursive
echo "   done"

# 3. Symlink all skills into global ~/.claude/skills/
echo "→ Symlinking skills to ~/.claude/skills/..."
mkdir -p "$HOME/.claude/skills"
for skill_dir in "$SKILLS_DIR"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  dest="$HOME/.claude/skills/$skill_name"
  if [ -L "$dest" ]; then
    echo "   skip $skill_name (already linked)"
  elif [ -d "$dest" ]; then
    echo "   skip $skill_name (real dir exists at $dest — remove manually to replace)"
  else
    ln -s "$skill_dir" "$dest"
    echo "   linked $skill_name"
  fi
done
echo "   done"

echo ""
echo "Setup complete. Open a new Claude Code session to use the skills."
