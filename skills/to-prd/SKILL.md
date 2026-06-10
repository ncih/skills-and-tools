---
name: to-prd
description: "Turn the current conversation context into a PRD and publish it as a GitHub Issue. USE THIS SKILL when the user says \"write a PRD\", \"create a spec from what we discussed\", \"publish this to the issue tracker\", \"write this up as a PRD\", \"turn this into a spec\", or \"document these requirements\". Sketches major module boundaries and confirms with the user before writing the PRD. In AI OS projects, also saves prd.md to the active initiative folder for /wiki-update and /ship."
---

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know.

The issue tracker and triage label vocabulary should have been set up for this project. Run `/setup-ai-os` if you need to configure project settings.

## Startup: read project config

```
!cat .claude/skill-config.json 2>/dev/null || echo '{"_missing":true}'
```

If config is present and has `scope_dir`, note `scope_dir` and `templates_dir` — used at the end to save a local `prd.md`.

## Default Mode

*Steps 1–3 run in both Default and AI OS modes. AI OS projects also run § AI OS Mode after step 3.*

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs in the area you're touching.

2. Sketch out the major modules you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules that can be tested in isolation.

A deep module (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

Check with the user that these modules match their expectations. Check with the user which modules they want tests written for.

3. Write the PRD using the template below, then publish it to the project issue tracker. Apply the `needs-triage` triage label so it enters the normal triage flow.

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

</prd-template>

## AI OS Mode

### Step 4 — Save local prd.md

*Only when `skill-config.json` has `scope_dir`.*

After the GitHub Issue is published, find the current initiative folder:

```
!find {scope_dir} -maxdepth 2 -name "scope.md" 2>/dev/null
```

Select the most recent initiative folder (by directory name date prefix). If multiple exist, prefer
the one whose `scope.md` has `status: scoped` or `status: in-progress`.

Write the PRD content to `{initiative_folder}/prd.md`. This file is consumed by `/wiki-update`
(extracts settled knowledge) and `/ship` (checks it was created before archiving).

If no initiative folder is found, warn the user: "No active initiative found in `{scope_dir}` —
save prd.md manually to the correct initiative folder, or run `/to-scope` first." Do NOT skip
publishing the GitHub Issue.
