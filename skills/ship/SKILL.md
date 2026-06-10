---
name: ship
description: General-purpose GitHub PR and merge lifecycle manager — asks what to ship (code, wiki/knowledge, full initiative, or custom), runs a pre-ship checklist, resolves merge conflicts intelligently, creates a PR with code review, and handles post-ship cleanup. Use whenever someone wants to merge a branch, ship a feature, push knowledge updates, close out an initiative, resolve conflicts before merging, or do a code review before merging. Also invoke when the user says "ship this", "merge ralph", "PR time", "ready to merge", "conflicts to resolve", or "close out this feature".
---

# /ship — PR & Merge Lifecycle Manager

Guides a change from "done" to "merged and cleaned up" — whatever that change is.

---

## Startup: read project config

```
!cat .claude/skill-config.json 2>/dev/null || echo '{"_missing":true}'
```

- If present → run **AI OS mode** detection in Step 1.
- If `_missing: true` → skip detection, go straight to the **Default mode** prompt in Step 1.

---

## Step 1: Understand what's being shipped

## AI OS Mode

Run these silently before saying anything:

```bash
git status --short
git branch --show-current
git log --oneline origin/main..HEAD 2>/dev/null | head -10
gh issue list --label needs-human-verify --state open --json number,title 2>/dev/null
```

Analyse the changed files to detect what kind of ship this is:

| Condition | Natural prompt to surface |
|---|---|
| Only files under `brain/01_Wiki/` or `brain/00_Raw/` changed | "Looks like a knowledge update — push to remote?" |
| Only files under `src/` changed | "Looks like a code change — open a PR from this branch?" |
| Files under both `brain/` and `src/` changed | "Full initiative — run wiki-update, then open a PR?" |
| Current branch is `ralph` and there are commits ahead of main | "On ralph with N commits — run QA check first, then merge?" |
| Any uncommitted changes present | "There are uncommitted changes — commit first, then ship?" |
| None of the above (mixed or unclear) | Fall back to the Default mode A/B/C/D prompt below |

Surface the matching prompt to the user. Pre-fill context you found (e.g. "I can see you're on
the `ralph` branch with 4 commits ahead of main and 2 open `needs-human-verify` issues").

Once the user confirms, map to the appropriate mode for downstream steps:
- Knowledge-only → behave as **mode B**
- Code-only → behave as **mode A**
- Full initiative → behave as **mode C**
- Ralph merge → behave as **mode A** + apply ralph post-ship cleanup in Step 6
- Commit first → pause, help commit, then re-detect

## Default Mode

Start by asking the user what they want to ship. Don't assume — the answer changes everything downstream.

```
What are you shipping?
  A) Code (branch → main via PR)
  B) Wiki / knowledge updates only (push compiled knowledge changes)
  C) Full initiative (wiki-update + code PR + archive workspace)
  D) Something else — describe it
```

While the user answers, run these silently to orient yourself:

```bash
git status
git branch --show-current
git log --oneline origin/main..HEAD 2>/dev/null | head -10
gh issue list --label needs-human-verify --state open --json number,title 2>/dev/null
```

Use what you find to pre-fill context (e.g. "I can see you're on the `ralph` branch with 4 commits ahead of main").

---

## Step 2: Pre-ship checklist

Run the relevant checks before touching anything. Be transparent — show the user what passed and what didn't. Don't block on soft checks; flag them and let the user decide.

### For code (modes A and C)

| Check | How | Hard stop? |
|---|---|---|
| Open `needs-human-verify` issues | `gh issue list --label needs-human-verify` | Yes — unverified issues shouldn't ship |
| Code gate green | `npm run lint && npm run typecheck && npm run test` (or stack equivalent) | Yes |
| QA report exists | Look for `qa-report.md` in `03_Workspace/Active/*/` | Soft — warn if missing |
| `wiki-update` ran | Look for recent changes to `01_Wiki/` on this branch | Soft — offer to run it |
| Branch is up to date with remote | `git fetch && git status` | Soft — flag if behind |

### For wiki only (mode B)

| Check | How | Hard stop? |
|---|---|---|
| `Index.md` is current | Spot-check against actual files in each namespace | Soft |
| `Decisions.md` updated | Check last entry date | Soft |
| No broken wikilinks (quick) | Grep for `[[` targets that don't match existing files | Soft |

### For full initiative (mode C)

Run both sets above. Also check:
- Initiative folder exists in `03_Workspace/Active/`
- `scope.md` and `prd.md` are present

If any hard stop fails: tell the user what's blocking and stop. Don't proceed until resolved.

---

## Step 3: Conflict detection and resolution

```bash
git fetch origin
git diff origin/main...HEAD --name-only  # files changed on this branch
git merge-base origin/main HEAD          # find divergence point
```

If `origin/main` has diverged, attempt a dry-run merge:

```bash
git merge --no-commit --no-ff origin/main 2>&1
git merge --abort 2>/dev/null
```

### If conflicts exist — resolve intelligently by file type

**Code files (`.ts`, `.py`, `.js`, etc.):**
- Read both sides of the conflict
- Understand the intent of each change
- Apply the approach that is more complete or more recent
- If genuinely ambiguous, show the user both sides and ask

**Wiki files (`01_Wiki/**/*.md`):**
- Newer content wins — apply temporal conflict resolution
- Move the overridden content to a `## Superseded History` section at the bottom
- Update `date_modified` in YAML frontmatter

**YAML frontmatter conflicts:**
- Prefer the version with more complete data
- Merge arrays (aliases, tags) — don't discard either side

**`Decisions.md` conflicts:**
- This is an append-only log — both sides are correct, just append both sets of rows

**`Index.md` conflicts:**
- Merge both sets of entries — the index is additive

After resolving, run the code gate again if any code files were touched.

---

## Step 4: Create the PR (code modes)

```bash
git push origin [branch]
```

Draft the PR using what you know from the branch, commits, qa-report.md, and scope.md:

```bash
gh pr create --title "[concise title]" --body "$(cat <<'EOF'
## What this ships
[1-3 bullets from scope.md or commit history]

## Test plan
[from qa-report.md human testing plan, or generated from acceptance criteria]

## Checklist
- [ ] Code gate: lint / typecheck / test
- [ ] QA report reviewed
- [ ] Wiki updated
- [ ] No open needs-human-verify issues

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then run code review:

```bash
# Invoke /code-review on the PR diff
```

Post any significant findings as inline PR comments (`gh pr review --comment`). Surface only real issues — don't clutter the PR with nitpicks.

---

## Step 5: Await approval and merge

Tell the user: "PR is open at [url]. Review the inline comments and approve when ready. Come back here and I'll merge."

When the user says to merge:

```bash
gh pr merge [pr-number] --squash --delete-branch
# Re-create ralph branch from updated main (if this was a ralph → main merge)
git checkout main && git pull
git checkout -b ralph && git push -u origin ralph
git checkout main
```

---

## Step 6: Post-ship cleanup

### If this was a full initiative (mode C):
1. Move initiative folder: `03_Workspace/Active/[name]/` → `03_Workspace/Archive/[name]/`
2. **`03_Workspace/Index.md`** — *AI OS mode:* do **not** hand-edit it; `/workspace-status` is its sole owner (D18). After archiving, tell the user to run **`/workspace-status`**, which regenerates `Index.md`/`TODO.md` so the archived initiative drops off the board. *Default mode:* there is no `03_Workspace/Index.md` to update — skip (behaviour unchanged).
3. Update the relevant `01_Wiki/Product/` feature file: set `status: active` (shipped)
4. Append to `01_Wiki/Decisions.md` if any decisions were made during the merge

### Always:
- Confirm to the user: what was shipped, what branch was deleted, what's next
- If `needs-human-verify` issues were present: remind the user they still need to close them manually

---

## Conflict resolution quick reference

| Situation | Resolution strategy |
|---|---|
| Code logic conflict | Read intent of both; apply the more complete version |
| Wiki content conflict | Newer wins; move older to Superseded History |
| YAML frontmatter | Merge fields; prefer more complete data |
| Append-only files (Decisions.md, Index.md) | Include both sets of additions |
| File deleted on one side, modified on other | Ask the user |
| Both sides renamed the same file differently | Ask the user |
| Branch diverged after **its own PR was squash-merged** to the base | The branch is a *superset* — its files already hold the base's squashed content plus newer work, so a re-merge throws `add/add` conflicts on the shared files. Confirm read-only with `git merge-tree --write-tree origin/main HEAD`. Then either: (a) resolve **take-ours** after verifying each branch version is genuinely newer — `git merge -X ours origin/main` on the branch, push, open the PR (now conflict-free); or (b) `git rebase --onto origin/main <pre-squash-commit> <branch>` to drop the duplicate commit, then fast-forward. No base content is lost either way. |

When in doubt on a conflict: show the user both sides with a clear explanation, propose a resolution, and ask for confirmation before applying.
