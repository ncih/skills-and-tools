---
name: to-inbox
description: Capture a product-feedback item or idea as a GitHub issue labelled `feedback` (the project's feedback inbox) — normalized via the intake template and de-duplicated against existing feedback issues. Use whenever an idea, bug observation, UX gripe, or feature thought surfaces mid-conversation — during UAT, while reading code, or when the user says "add this to the inbox", "capture that", "log this feedback", "note this idea for later", or "to-inbox". Reach for it proactively the moment something worth not-forgetting comes up, rather than letting it scroll away in chat.
---

# To Inbox (v2 — GitHub-native)

Capture one feedback/idea item as a **GitHub issue labelled `feedback`** so it survives past
this conversation and feeds the next `workshop-feedback` session. This is the *manual* capture
path; app-user feedback arrives via the in-app NPS export (`from-app`). Full loop spec:
`docs/feedback-loop-design.md` (v2).

Keep this fast and low-ceremony — capturing an idea shouldn't derail the conversation. Infer
fields from context; ask only when something is genuinely ambiguous and matters.

**Boundary:** this skill creates only `feedback`-labelled issues. Never apply triage labels
(`needs-triage` etc.) — those belong to implementation issues, a different layer.

## Process

### 1. De-duplicate before creating

Search the inbox first:

```
gh issue list --label feedback --state all --search "<keywords>" --json number,title,state
```

- **Clear match** → don't create a near-twin. Comment the new evidence/detail onto the existing
  issue (frequency signal accrues in one place) and tell the user which issue it landed on.
- **Uncertain** → create the new issue but add the **`possible-dup`** label and name the
  candidate in the body ("Possibly duplicates #N"). The next workshop resolves it.
- Don't agonise — capture is meant to be cheap.

### 2. Create with the intake template

```
gh issue create --label feedback --title "<outcome-phrased title, ≤80 chars>" --body "..."
```

Body template:

```markdown
**Source:** <uat | chat | idea | user | app> (<YYYY-MM-DD>, <who>)
**Type:** <bug | enhancement | feature | idea>
**Context:** <2–6 sentences: the problem from the user's perspective, enough for a future
workshop to act without this conversation. Use CONTEXT.md vocabulary. Note known constraints.>
**Related:** <issue #s, ADRs, scope items, code areas — or omit>
```

Field guidance — infer, don't interrogate:
- **Title** — outcome phrasing ("Host can …", "Guest gets …"), project glossary terms.
- **Source** — `uat` (testing), `chat` (discussion), `idea` (proposal), `user` (an end-user
  said it), `app` (from the in-app export — normally automated).
- **Type** — `bug` / `enhancement` / `feature` / `idea` (still fuzzy).
- **No priority at intake** — priority is a workshop judgment; pre-assigned priorities go
  stale and bias the discussion.
- Add **`parked`** only when a named decision blocks the item — state that blocking question
  in the body. Add **`phase-2`** if it's behind the phase gate (CONTEXT §12).

### 3. Confirm in one line

E.g. *"Filed #72 — 'Guest can split an item by fraction' (feature)."* — or *"Added your note to
existing #57 instead (duplicate)."* No need to echo the whole body.

## Cowork sandbox fallback

If `gh` isn't available (AGENTS.md §5), stage the exact `gh issue create` command (or append it
to a staging script) for the user to run, and say so. Don't silently drop the capture.

## Notes

- One item per invocation is the norm; if the user dumps several, file each separately (still
  dedupe each).
- This skill only *creates/comments*. Relabelling to `scoped`, resolving `possible-dup`s, and
  closing all belong to `workshop-feedback` (or to shipping) — don't pre-empt them.
