---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues.
---

# To Issues

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

The issue tracker and triage label vocabulary should have been set up for this project. Run `/setup-ai-os` if you need to configure project settings.

## Startup: read project config

```
!cat .claude/skill-config.json 2>/dev/null || echo '{"_missing":true}'
```

Note `scope_dir` if present — used in Step 1 to locate the scope document.

## AI OS Mode

*Active when `skill-config.json` has `scope_dir`*: locate the scope document from `{scope_dir}`, extract S-item IDs, and after publishing write issue numbers back into the scope document (Step 6 — traceability loop).

## Default Mode

*Active when `skill-config.json` is missing or has no `scope_dir`*: read scope document from `docs/scope/<date>-scope.md`. Skip traceability write-back (Step 6).

If `_missing` is true when checking config, warn: "No skill-config.json found — running in Default Mode with docs/scope/ path."

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker and read its full body and comments.

If the source is a **scope document**, locate it:

- **AI OS mode** (when `skill-config.json` has `scope_dir`): find scope.md in the current initiative folder:
  ```
  !find {scope_dir} -maxdepth 2 -name "scope.md" 2>/dev/null
  ```
  Select the most recent initiative folder (by directory name date prefix). If multiple folders have a scope.md, prefer the one with `status: scoped` or `status: in-progress`.

- **Default mode** (no config or no `scope_dir`): read `docs/scope/<date>-scope.md`.

Once you have the scope document, read it in full. Each in-scope item has a stable id (`S1`, `S2`, …) that one or more issues will implement. Keep those ids — they're how the work traces back to the feedback that prompted it.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Publish the issues to the issue tracker

For each approved slice, publish a new issue to the issue tracker. Use the issue body template below. Apply the `needs-triage` triage label so each issue enters the normal triage flow.

Publish issues in dependency order (blockers first) so you can reference real issue identifiers in the "Blocked by" field.

<issue-template>
## Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

## Scope item

The scope-document item id this issue implements (e.g. `S2` in `{scope_doc_path}`). Omit if the work didn't originate from a scope doc. A single scope item may be covered by several issues.

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to the blocking ticket (if any)

Or "None - can start immediately" if no blockers.

</issue-template>

Do NOT close or modify any parent issue.

### 6. Close the traceability loop (if a scope doc was the source)

After the issues are published, write the resulting issue numbers back into the scope document next to each scope item — e.g. update the S2 item with `**Filed as:** #41, #42`. This lets anyone trace a shipped issue back through the scope to the original feedback item, and lets a later pass see which scope items still have no issues. Don't touch the feedback inbox or archive here — that reconciliation already happened in the `to-scope` skill.
