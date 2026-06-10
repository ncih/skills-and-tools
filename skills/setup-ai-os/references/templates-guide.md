# Templates Guide

Full content for all 12 templates to create in `02_Templates/`.
All wiki templates (Person through Research_Note) must include the YAML frontmatter block.

---

## Person.md

```markdown
---
aliases: []
tags: [people]
date_created: {{date}}
date_modified: {{date}}
status: active
supersedes: ""
---

# {{Name}}

**Role:** 
**Company:** [[]]
**Email:** 
**LinkedIn:** 

## Context
_Who are they, how did we meet, why do they matter._

## Relationship
**Type:** investor | customer | advisor | partner | team | candidate | other
**Status:** active | dormant | closed
**Last contact:** {{date}}

## Key Conversations
- 

## Commitments & Follow-ups
- [ ] 

## Notes
```

---

## Company.md

```markdown
---
aliases: []
tags: [companies]
date_created: {{date}}
date_modified: {{date}}
status: active
supersedes: ""
---

# {{Company Name}}

**Industry:** 
**Stage:** pre-seed | seed | series-a | series-b | growth | public
**Website:** 
**HQ:** 

## Relationship to [Project]
**Type:** competitor | prospect | partner | investor | vendor | other
**Status:** active | watching | inactive

## Key People
- [[]] — role

## What They Do
_One paragraph._

## Competitive / Strategic Notes

## Interactions
- 

## Notes
```

---

## Feature.md

```markdown
---
aliases: []
tags: [product, feature_spec]
date_created: {{date}}
date_modified: {{date}}
status: draft
supersedes: ""
---

# {{Feature Name}}

**Status:** draft | scoped | in-progress | shipped | deprecated
**Priority:** p0 | p1 | p2
**Pillar:** [[Vision_Document]]

## Problem
_What pain does this solve? For whom?_

## User Story
As a **[user type]**, I want to **[action]** so that **[outcome]**.

## Scope
**In scope:**
- 

**Out of scope:**
- 

## Acceptance Criteria
- [ ] 

## Design Notes

## Engineering Notes

## Open Questions
```

---

## Market_Note.md

```markdown
---
aliases: []
tags: [market]
date_created: {{date}}
date_modified: {{date}}
status: active
supersedes: ""
---

# {{Topic}}

**Type:** gtm | pricing | icp | positioning | competitive-strategy | research
**Source:** 

## Summary

## Detail

## Implications for [Project]

## Related
- [[]]
```

---

## Engineering_Decision.md

```markdown
---
aliases: []
tags: [engineering, decision]
date_created: {{date}}
date_modified: {{date}}
status: active
supersedes: ""
---

# {{Decision Title}}

**Status:** proposed | accepted | superseded | deprecated
**Deciders:** 

## Context

## Options Considered

### Option A — {{name}}
- Pros:
- Cons:

### Option B — {{name}}
- Pros:
- Cons:

## Decision
**Chosen:** Option _
**Reason:** 

## Consequences

## Superseded History
```

---

## SOP.md

```markdown
---
aliases: []
tags: [operations, sop]
date_created: {{date}}
date_modified: {{date}}
status: active
supersedes: ""
---

# {{Process Name}}

**Owner:** 
**Trigger:** 
**Frequency:** daily | weekly | monthly | on-demand | on-event

## Steps
1. 
2. 

## Tools Used
- 

## Notes & Edge Cases

## Related
- [[]]
```

---

## Research_Note.md

```markdown
---
aliases: []
tags: [research]
date_created: {{date}}
date_modified: {{date}}
status: active
supersedes: ""
---

# {{Topic / Paper / Framework}}

**Source:** 
**Type:** paper | article | framework | mental-model | talk | book
**Field:** ai-agents | orchestration | enterprise-saas | llm | other

## Core Idea

## How It Works

## Relevance to [Project]
**Verdict:** apply-now | apply-later | watch | not-applicable

## Key Quotes / Data Points

## Related
- [[]]
```

---

## Workspace_Scope.md

```markdown
---
initiative: "{{Initiative Name}}"
date_created: {{date}}
date_modified: {{date}}
status: scoped
wiki_feature: "[[]]"
---

# Scope: {{Initiative Name}}

## Goal
_One sentence: what does success look like when this is shipped?_

## Problem Being Solved

## User Story
As a **[user type]**, I want to **[action]** so that **[outcome]**.

## In Scope
- 

## Out of Scope
- 

## Success Criteria
- [ ] 

## Constraints

## Open Questions
- 

## References
- [[]]
```

---

## Workspace_QA_Report.md

```markdown
---
initiative: "{{Initiative Name}}"
date: {{date}}
issues_reviewed: []
code_gate: pass | fail
overall_verdict: pass | fail | partial
---

# QA Report: {{Initiative Name}}

## Summary
| Gate | Result |
|---|---|
| Lint | pass / fail |
| Typecheck | pass / fail |
| Tests | pass / fail |
| Acceptance criteria | pass / fail / partial |

**Overall:** _one sentence_

## Per-Issue Results

### #{{N}} — {{Issue Title}}
**Code gate:** pass | fail
**Acceptance criteria:** met | not-met | partial
**Verdict:** ready-to-close | needs-fix | needs-human-UAT

## Human Testing Plan
### #{{N}} — {{Issue Title}}
1. 
2. 
**Done when:** 

## Issues Needing Fixes
- [ ] #{{N}} — _what needs fixing_

## Notes for /ralph-retro
```

---

## Workspace_Session_Notes.md

```markdown
---
initiative: "{{Initiative Name}}"
session_type: brainstorm | workshop | research | planning | retro | other
date: {{date}}
participants: []
---

# Session Notes: {{Title}}

## Objective

## Key Outputs
- 

## Decisions
- 

## Open Items
- [ ] 

## References
- [[]]
```

---

## Raw_Capture.md

```markdown
---
date: {{date}}
type: meeting-note | product-idea | research-clip | decision | brain-dump | other
people: []
companies: []
---

# {{Title}}

## Context

## Content

## Key Takeaways / Decisions

## Follow-ups
- [ ] 
```

---

## Agent.md

```markdown
---
name: agent-name
description: One sentence — when should the orchestrator delegate to this agent?
model: claude-sonnet-4-6
---

# {{Agent Name}}

## Role
_What is this agent's function in the system?_

## When to use
_What triggers the orchestrator to delegate here?_

## Inputs
_What is handed to this agent at the start of each run?_

## Instructions
1. 
2. 
3. 

## Output format
_What does this agent return to the orchestrator?_

## Rules
- 

## Notes
_Stack-specific constraints, edge cases, escalation paths._
```
