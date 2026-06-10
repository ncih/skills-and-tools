# Out-of-Scope Knowledge Base

The `.out-of-scope/` directory in a repo stores persistent records of rejected feature requests. It serves two purposes:

1. **Institutional memory** - why a feature was rejected, so the reasoning is not lost when the issue is closed
2. **Deduplication** - when a new issue comes in that matches a prior rejection, the skill can surface the previous decision instead of re-litigating it

## Directory structure

One file per **concept**, not per issue. Multiple issues requesting the same thing are grouped under one file.

## File format

Use a relaxed, readable style. Include: concept name heading, why it is out of scope, and a prior requests list with issue links.

## When to check `.out-of-scope/`

During triage Step 1 (Gather context), read all files in `.out-of-scope/`. Matching is by concept similarity, not keyword. Surface any match to the maintainer before proceeding.

## When to write to `.out-of-scope/`

Only when an **enhancement** (not a bug) is rejected as `wontfix`. Check if a matching file already exists first; if so, append to it rather than creating a duplicate.
