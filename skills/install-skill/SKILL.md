---
name: install-skill
description: Install a Claude Code skill from a GitHub URL into the Projects directory, then optionally symlink it globally or into sub-projects. Trigger when the user provides a GitHub link to a skill repo, says "install skill", "add this skill from github", "set up this skill", or wants to symlink/migrate an existing skill across their projects.
model: claude-haiku-4-5-20251001
---

# Install Skill

MAIN_DIR: `<patched by setup.sh>`  
SCRIPTS: `<patched by setup.sh>`

> **First time?** Run `setup.sh` from the `.claude/` root — it patches these paths for your machine.

---

## Step 0 — Ensure permissions (always run first)

```bash
bash $SCRIPTS/setup-permissions.sh
```

If this command itself prompts for approval, tell the user:
> "I need one-time permission to set up install-skill. Please approve this, and all future runs will be automatic."

Once it runs (prints "already present" or "Added N rule(s)"), proceed.

---

## Route A — GitHub URL provided

```bash
bash $SCRIPTS/install.sh "<GITHUB_URL>"
```

On success the script prints two lines:
```
skill_name=<name>
dest=<path>
```
Note both values. Tell the user: "`<name>` installed to Projects."  
→ Go to **Ask about symlinks**.

---

## Route B — No URL (skill referenced by name or path)

Ask: "What's the path or name of the skill you want to work with?"

If the path is **outside** MAIN_DIR ask: "Want me to migrate it to the Projects directory first?"
- Yes → `bash $SCRIPTS/install.sh --migrate "<PATH>"`  
  Output gives `skill_name=` and `dest=` as above.
- No → use the existing path as `<dest>`.

→ Go to **Ask about symlinks**.

---

## Ask about symlinks

```bash
bash $SCRIPTS/list-targets.sh
```

Print the full output to the user. Then ask:  
> "Which locations should I symlink `<skill-name>` to? (e.g., `global`, `splitlah-mvp`, or `all`)"

---

## Symlink each chosen target

For each target the user picks, run:

```bash
bash $SCRIPTS/link.sh "<dest>" "<target>"
# <target> = "global"  OR  full path to a project e.g. /path/to/projects/my-app
```

When all done, list the locations that were symlinked.
