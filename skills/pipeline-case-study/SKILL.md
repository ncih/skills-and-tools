---
name: pipeline-case-study
description: Converts pipeline session logs + chat transcripts into a shareable case study with narrative, feature deep-dives, cost evaluation, and insights. Use when the user wants to document a completed sprint or workflow for sharing — expects JSONL log paths (Claude Code session files) for each pipeline stage and optionally a description of the sprint's context/theme.
---

# Pipeline Case Study

Turns a set of Claude Code session logs (`.jsonl`) into a polished, shareable case study documenting how a sprint moved from idea to shipped code. Produces a two-layer document: a non-technical narrative for sharing, with a technical appendix including a full cost evaluation and actionable insights.

## Quick start

The user provides one or more of the following log paths, and optionally a sprint theme and feature to deep-dive:

```
Scoping log:    ~/.claude/projects/<project>/session-A.jsonl
Grill/PRD log:  ~/.claude/projects/<project>/session-B.jsonl
To-issue log:   ~/.claude/projects/<project>/session-C.jsonl
Triage log:     ~/.claude/projects/<project>/session-D.jsonl
QA log:         ~/.claude/projects/<project>/session-E.jsonl
Retro log:      ~/.claude/projects/<project>/session-F.jsonl
Ralph logs:     <repo>/ralph/logs/iter-*.log  (or ralph/runs.csv for stats)
```

If the user doesn't specify which feature to deep-dive, pick the one with the most complete story across the pipeline (typically the most complex issue by cost/turns).

## Extraction workflow

### Step 1 — Parse the logs for dialogue

For each JSONL log, run:

```python
import json

def extract_messages(path, max_chars=15000):
    msgs = []
    with open(path) as f:
        for line in f:
            try:
                obj = json.loads(line.strip())
                role = obj.get('type', '')
                if role in ('user', 'assistant'):
                    content = obj.get('message', {})
                    if isinstance(content, dict):
                        for block in content.get('content', []):
                            if isinstance(block, dict) and block.get('type') == 'text':
                                msgs.append((role.upper()[:4], block['text'][:600]))
            except: pass
    return msgs
```

Extract: key decisions made, artifacts produced (file paths), notable quotes, skill names invoked.

### Step 2 — Extract cost from every session log

Run this against each JSONL file to get per-session token counts and estimated cost:

```python
import json

def session_cost(path):
    total_input = total_output = total_cr = total_cw = 0
    models, turns = set(), 0
    with open(path) as f:
        for line in f:
            try:
                obj = json.loads(line.strip())
                if obj.get('type') == 'assistant':
                    msg = obj.get('message', {})
                    model = msg.get('model', '')
                    if model: models.add(model)
                    u = msg.get('usage', {})
                    if u:
                        total_input += u.get('input_tokens', 0)
                        total_output += u.get('output_tokens', 0)
                        total_cr += u.get('cache_read_input_tokens', 0)
                        total_cw += u.get('cache_creation_input_tokens', 0)
                        turns += 1
            except: pass
    # Claude Sonnet 4.x pricing (per million tokens)
    cost = (total_input/1e6)*3 + (total_output/1e6)*15 + (total_cr/1e6)*0.30 + (total_cw/1e6)*3.75
    return {'turns': turns, 'models': models, 'cost': cost,
            'output_tokens': total_output, 'cache_read': total_cr}
```

Update model pricing if the session used a different model tier (Haiku ~10× cheaper, Opus ~3× more expensive than Sonnet).

### Step 3 — Turn-by-turn cost trace for expensive sessions

For any session costing significantly more than expected, trace cost accumulation turn-by-turn to identify which phase drove the cost:

```python
def cost_trace(path, checkpoints=None):
    if checkpoints is None:
        checkpoints = [20, 50, 100, 150, 200, 250, 300, 350, 400, 450]
    msgs, total = [], 0
    with open(path) as f:
        for line in f:
            try:
                obj = json.loads(line.strip())
                if obj.get('type') == 'assistant':
                    u = obj['message'].get('usage', {})
                    if u:
                        cost = (u.get('input_tokens',0)/1e6)*3 + (u.get('output_tokens',0)/1e6)*15 \
                             + (u.get('cache_read_input_tokens',0)/1e6)*0.30 \
                             + (u.get('cache_creation_input_tokens',0)/1e6)*3.75
                        msgs.append(cost)
            except: pass
    for i, c in enumerate(msgs, 1):
        total += c
        if i in checkpoints or i == len(msgs):
            print(f'Turn {i:3d}: cumulative ${total:.2f}')
```

The cost curve reveals which phase consumed the budget. A steep climb early = setup/debugging. A steep climb late = long browser/verification sessions. Flat early + steep late = good (most cost is productive work).

### Step 4 — Gather stats from ralph

```bash
tail -30 ralph/runs.csv        # per-run: timestamp, iter, outcome, turns, tokens, cost
cat ralph/reviews/archive/review-*.md   # latest retro verdicts and patterns
```

Compute: total features, total cost, average cost/feature, fastest/slowest, pass rate.

### Step 5 — Identify the deep-dive features

Criteria for Feature Deep-Dive 1 (most architecturally complex): highest grill session involvement, most ADRs produced, most interesting design decisions.

Criteria for Feature Deep-Dive 2 (failure/recovery): something that didn't work perfectly first time — double implementer, blocked issue, test-passing but broken feature. Include what the retro fixed.

Criteria for Feature Deep-Dive 3 (ADR as specification): a feature where the planner read an ADR and derived the correct architecture without any human in the loop.

## Output structure

Write to `docs/case-studies/<YYYY-MM-DD>/case-study.md`:

```
# [Central Thesis — why it works, not just that it's fast]
## A Case Study in Human-AI Product Development

[Opening: the failure mode of AI-generated code → the mechanism that prevents it → headline stats]

## The Numbers
[Table: features, total cost, all-in per-feature cost, test coverage, bugs caught by AI vs human]

## What Actually Happened: The N Stages
[One section per stage. QA should cover the AI-as-QA-engineer story if logs show
test infrastructure was built: credentials issue, debugging approach, browser verification,
what the browser caught that all automated tests missed]

## Feature Deep-Dive 1: [Most Architecturally Complex Feature]
[Chain: scope → grill decision → ADR written → issue filed → planner reads ADR → implements correctly]

## Feature Deep-Dive 2: [Feature with Failure/Recovery]
[Show the imperfect run, what passed incorrectly, what the retro fixed for next time]

## Feature Deep-Dive 3: [Feature Where ADR Replaced a Human Conversation]
[The ADR was the specification. The code was the transcription.]

## What the Human Did vs. What the AI Did
[Side-by-side table: decisions vs. execution]

## Why This Works: The Core Mechanism
[Three points: decisions before implementation / machine-readable formats / verification by structure]

## Learnings
[N numbered learnings, each grounded in a specific log event]

## The Full Pipeline Economics
[See economics section below — this is required, not optional]

---

## Technical Appendix
### A. The Full Pipeline Skill Map [table: stage | skill | time | artifact]
### B. Ralph Loop — Cost and Time Breakdown [table from runs.csv]
### C. How the Loop Works [mechanistic description]
### D. The Grill's Critical Function [why it matters]
### E. What Failed and What Was Learned [table: failure → root cause → fix]
### F. ADRs/Decisions Produced This Sprint [list]
```

## The Full Pipeline Economics section (required)

This section is the cost evaluation — not just the ralph loop cost, but every stage. It must include:

**1. Cost table — all stages:**

| Stage | Skill | Model | Turns | Est. Cost | Notes |
|---|---|---|---|---|---|
| Workshop | `workshop-feedback` | Sonnet 4.x | N | $X.XX | one-line characterisation |
| Grill + PRD | `grill-with-docs` | Sonnet 4.x | N | $X.XX | |
| To-Issue | `to-issues` | Sonnet 4.x | N | $X.XX | |
| Triage | `triage` | Sonnet 4.x | N | $X.XX | |
| Ralph Loop | `ralph-loop` | Sonnet 4.x | N runs | $X.XX | N features @ $Y avg |
| QA | `check-needs-human-verify` | Sonnet 4.x | N | $X.XX | see breakdown |
| Retro | `ralph-retro` + `session-retro` | Sonnet 4.x | N | $X.XX | |
| **Total** | | | | **$XX.XX** | **$Y.YY/feature all-in** |

**2. QA turn-by-turn breakdown (always include for QA):**

Run the `cost_trace` function against the QA log. Identify phases:
- Gates + initial read (~turns 1–N): cheap
- Infrastructure debugging (building seed data, login page, auth debugging): often the largest cost
- Actual feature verification in browser: the productive cost
- Bug fix + report: modest

If infra debugging consumed >30% of the QA cost, flag this explicitly: "**~$X of the $Y QA cost was environment setup, not feature verification.**" This is the most important cost insight to surface.

**3. Per-stage evaluation (keep/optimise/one-time):**

For each stage, assess one of:
- **Keep as-is** — cost is justified by what it produces; model downgrade would hurt quality
- **Optimisable** — routine work (log reading, label ops, brief writing) that Haiku could handle; estimate savings
- **One-time cost** — infra or setup that won't recur; calculate next-sprint cost

**4. The environment setup insight:**

If QA had a significant infra debugging phase, include this as a named insight:

> **Environment setup is the highest-leverage cost reduction in agentic QA.** Any agentic session starting without a working environment will spend the majority of its turns building the environment rather than doing the work. The cost scales with context length — each failed attempt extends the accumulated context, making subsequent turns more expensive. A one-time "environment setup" session early in the project (seed data, developer login, local env config) typically costs $3–5 and eliminates $15–20 of debugging from every QA sprint thereafter.

**5. Optimised pipeline estimate:**

Show a before/after table using the per-stage assessments:

| Stage | Current | Optimised | Rationale |
|---|---|---|---|
| Grill + PRD | $X | $X | Keep Sonnet — load-bearing |
| Retro | $X | ~$Y | Haiku for log reading |
| QA | $X | ~$Y | Infra now exists |
| ... | | | |
| **Total** | **$X** | **~$Y** | |

## Writing principles

- **Central thesis: why it works, not how fast it shipped.** Speed is the hook; the mechanism is the substance.
- **Narrative-first.** The non-technical reader should get through the whole document without needing to understand the technology.
- **Concrete, not general.** "The grill resolved three decisions" is weak. Name the decisions.
- **Failures deserve prominence.** Bugs caught, blocked issues, double implementer calls — these make the successes believable.
- **Cost insights should be surprising.** "QA cost more than the autonomous loop" is the headline. "Only $9 of that was actual QA" is the insight. Lead with the surprising finding, then explain it.
- **Separate what humans did from what AI did.** Always: humans made decisions, AI executed. Make it explicit.

## See also

- [EXAMPLES.md](EXAMPLES.md) — the 2026-06-05 SplitLah case study (complete worked example with full cost analysis)
