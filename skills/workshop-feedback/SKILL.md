---
name: workshop-feedback
description: Run a deliberate product-feedback workshop — read the GitHub feedback inbox (issues labelled `feedback`), discuss and prioritise with the user as a thinking partner, and converge on a dated scope document that feeds the next PRD. Use when the user wants to "workshop the feedback", "plan the next iteration", "decide what to build next", "go through the inbox", "prioritise the backlog of ideas", or kick off the cycle that ends in a PRD. Operates ONLY on feedback-labelled issues — never on implementation issues (needs-triage / ready-for-agent etc.). Convergent counterpart to the `to-inbox` capture skill; front of the scope → grill → PRD → issues pipeline. Resumable: invoke again to continue an in-progress workshop.
---

# Workshop Feedback (v2 — GitHub-native)

Turn raw feedback **plus the user's input** into a **finalised scope for the next PRD** — one
sitting, three phases. This is the *judgment* step of the pipeline: clustering, challenging,
prioritising, converging. The full loop spec is `docs/feedback-loop-design.md` (v2).

**Reuse the thinking partner you already have.** Phase 1 *is* a brainstorming session — lean on
the `product-brainstorming` skill for the thinking-partner mechanics. This skill adds the
plumbing: what to read, how to score, where the scope goes, how the inbox is reconciled.

## Hard boundary — feedback only

This skill reads and writes **only issues labelled `feedback`** (and its companion labels
`parked`, `possible-dup`, `scoped`, `phase-2`, `from-app`).

- **Never** list, relabel, close, or otherwise touch implementation issues — anything carrying
  the triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
  `in-progress`, `needs-human-verify`). That layer belongs to the `triage` skill and the Ralph
  loop. The two layers meet only later, when `to-issues` files implementation issues *from* the
  scope this workshop produces.
- The workshop's output is a **scope document**, not implementation issues. Don't pre-empt
  `grill-with-docs` / `to-prd` / `to-issues`.

## What this skill touches

| Object | Role |
|---|---|
| GitHub issues, label `feedback`, state open | the **inbox** — read; relabel; comment; close *only* duplicates |
| `docs/scope/<YYYY-MM-DD>-scope.md` | the **finalised scope** you produce (the bridge artifact the grill consumes) |

If `gh issue list --label feedback --state open` returns nothing, there's nothing to workshop —
say so and suggest capturing with `to-inbox` first.

> **Cowork sandbox note:** if `gh` isn't available (AGENTS.md §5), read what you can from
> conversation/user-pasted output and **stage** every `gh` mutation (relabel/comment/close) as
> commands for the user to run — never skip the reconcile, and guard against double-runs.

## Resumability — check before you start

Look for a recent `docs/scope/*-scope.md` that isn't finalised. If one exists, read it and
**continue** — issues already labelled `scoped` are out of the discussion. Say you're resuming.

## Phase 1 — Discuss & prioritise

The goal is a ranked shortlist the user believes in, not a rubber-stamp of the inbox order.

1. **Load the inbox:** `gh issue list --label feedback --state open` (include `parked`;
   `scoped` items are excluded by construction since scoping removes them from the live set).
   Reflect the landscape back briefly: count, obvious clusters, anything `parked` or `phase-2`.
2. **Resolve `possible-dup`s first.** Merge the useful content into the survivor via a comment,
   close the duplicate with "Duplicate of #N". This is the only closing this skill does.
3. **Think as a partner, not a clerk** (`product-brainstorming` stance): challenge assumptions,
   find root causes behind symptom-level items, group related issues, surface tensions and
   prerequisites. **The user's input steers** — their goals for the next iteration are as much
   an input as the inbox.
4. **Score out loud:** impact × frequency ÷ effort, plus strategic fit. Explain the call, don't
   hide behind the formula. Resolve `parked` items by answering their blocking question, or
   keep them parked with the reason updated in a comment.
5. **Stay editable.** New ideas surfacing mid-discussion are captured via the `to-inbox` skill
   (a `feedback`-labelled issue with the intake template), then folded into the discussion.
6. **Converge.** Confirm the shortlist with the user before writing anything.

## Phase 2 — Finalise the scope

Write `docs/scope/<YYYY-MM-DD>-scope.md` (create `docs/scope/` if needed). **Reference, don't
restate** (AGENTS.md §5): S-items cite issue numbers and add only the workshop's delta — the
rationale and the intended shape — never paste full issue bodies.

```markdown
# Scope — <YYYY-MM-DD>

**Theme:** <one line: what this iteration is about>

## Goals
- <what we intend to achieve>

## Non-goals
- <explicitly out, so scope doesn't creep>

## In scope

### S1 — <title>
- **From:** #NN (, #NN …)        ← the feedback issue(s) this covers; one S-item may fold several
- **Filed as:** _(pending to-issues)_
- **Why now:** <the prioritisation rationale>
- **Shape:** <a sentence or two on intended direction — not a spec>

## Deferred / parked
- <#NN — one-line reason it didn't make the cut>
```

Scope-item ids (`S1`, `S2`, …) are stable handles; `to-issues` later writes the resulting
implementation issue numbers into each `Filed as:`.

## Phase 3 — Reconcile the inbox

Make GitHub reflect what was decided, so the next workshop starts clean:

1. Every feedback issue that landed in **In scope**: add the **`scoped`** label and a comment
   linking the scope doc and its S-item (e.g. "Scoped into docs/scope/2026-06-05-scope.md as
   S2"). **Do not close it** — it closes later with "shipped via #NN" when the implementation
   lands and passes UAT.
2. Issues discussed but not chosen stay open and `feedback` (update `parked` + its blocking
   question if the discussion changed it).
3. Never hard-delete anything; the trail lives in labels and comments.

## Close out

A few lines: the scope doc path, which issues got `scoped`, and the handoff — **run
`grill-with-docs` on the scope doc in a fresh session** (one pipeline stage per session,
AGENTS.md §5), then `to-prd` → `to-issues`.
