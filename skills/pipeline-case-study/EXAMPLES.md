# Example: SplitLah — 2026-06-05 Sprint

> Complete worked example of the pipeline-case-study skill. The full output document lives at
> `docs/case-study-2026-06-05.md` in the SplitLah repo.

## Input logs used

| Stage | Session ID | Key artifact produced |
|---|---|---|
| Workshop/Scoping | `fcfd3e2f` | `docs/scope/2026-06-05-scope.md` |
| Grill + PRD | `59e09778` | PRD + ADR-0013/0014/0015 |
| To-Issue | `6fad7b9c` | GitHub issues #74–#83 |
| Triage | `245c87f8` | `ready-for-agent` queue |
| QA | `bbed2295` | verification report + bug fix |
| Retro | `a8a2dfa1` | 4 improvements applied |
| Ralph logs | `ralph/logs/iter-*-20260605-*.log` | 14 committed features |

## Stats extracted

- **14 features shipped** (15 attempted — 1 correctly BLOCKED on product ambiguity)
- **$91.55 total pipeline cost** across all 7 stages
- **$6.54/feature all-in** (including scoping, grill, issues, triage, ralph, QA, retro)
- **$27.15 ralph loop** across 16 iterations — $1.94/feature average
- **$0.58** fastest ralph issue (#37 — verify CI fix already committed)
- **$3.64** most expensive ralph issue (#76 — IOU state: migration + 13 files + integration test)
- **391 automated tests** all green
- **1 real bug** caught by human browser testing (TDZ crash, slipped all automated gates)

## Cost extraction — what was run

```bash
# Per-session cost
python3 -c "
import json
sessions = {'QA': '/path/to/qa-session.jsonl', ...}
for name, path in sessions.items():
    total_input = total_output = total_cr = total_cw = 0
    turns = 0
    with open(path) as f:
        for line in f:
            obj = json.loads(line.strip())
            if obj.get('type') == 'assistant':
                u = obj['message'].get('usage', {})
                if u:
                    total_input += u.get('input_tokens', 0)
                    total_output += u.get('output_tokens', 0)
                    total_cr += u.get('cache_read_input_tokens', 0)
                    total_cw += u.get('cache_creation_input_tokens', 0)
                    turns += 1
    cost = (total_input/1e6)*3 + (total_output/1e6)*15 + (total_cr/1e6)*0.30 + (total_cw/1e6)*3.75
    print(f'{name}: {turns} turns, \${cost:.2f}')
"
```

## The QA cost breakdown — how it was derived

The QA session cost $29.06 — more than the entire ralph loop. A turn-by-turn trace revealed:

| Phase | Turns | Cumulative cost | What was happening |
|---|---|---|---|
| Gates + initial setup | 1–50 | $1.92 | Running 391 tests, reading 14 issues |
| Infra build + auth debugging | 50–350 | $17.85 | seed.sql, /dev-login, ~10 auth rounds |
| Verification + bug fix + report | 350–466 | $9.29 | Browser testing, TDZ fix, report |

**~$18 was environment setup. ~$9 was actual QA work.**

The trace command used:
```python
# Cumulative cost at checkpoints
msgs, total = [], 0
with open(qa_path) as f:
    for line in f:
        obj = json.loads(line.strip())
        if obj.get('type') == 'assistant':
            u = obj['message'].get('usage', {})
            if u:
                cost = (u.get('input_tokens',0)/1e6)*3 + (u.get('output_tokens',0)/1e6)*15 \
                     + (u.get('cache_read_input_tokens',0)/1e6)*0.30 \
                     + (u.get('cache_creation_input_tokens',0)/1e6)*3.75
                msgs.append(cost)
for i, c in enumerate(msgs, 1):
    total += c
    if i in [20, 50, 100, 150, 200, 250, 300, 350, 400, 450, 466]:
        print(f'Turn {i}: ${total:.2f}')
```

## Feature deep-dives chosen

**Deep-dive 1 — Issue #76 IOU guest state (S4):** full story across all 7 stages; 3 specific
grill decisions (IOU doesn't lock claims, counts as unpaid, 4-state model) governed the
implementation; browser-confirmed with IOU chip screenshot.

**Deep-dive 2 — Issue #74 grouped bill screen (foundational UX):** most architecturally
complex feature; two ADRs (0013 + 0014) drove the design; double implementer call exposed
a gap in the loop's completeness check; retro fixed it.

**Deep-dive 3 — Issue #77 guest phone consent (S5):** clean example of ADR-as-specification —
the planner read ADR-0015 and derived the two-layer storage model without human involvement;
browser-confirmed with Nudge button screenshot.

## Key learnings extracted

1. Grill step is where quality comes from — 15 design decisions made afternoon before code was written
2. ADRs are machine-readable product memory — ralph planner read ADR-0015 and derived two-layer phone consent architecture without human involvement
3. Automated gates catch implementation errors; humans (and browsers) catch product errors — TDZ crash slipped 391 tests, found in 30s
4. Vertical slices over horizontal layers — each issue was end-to-end demoable
5. Retro compounds — 4 improvements applied that make the next sprint cheaper
6. Blocking is a feature — #82 correctly stopped rather than guessing on product ambiguity
7. AI-as-QA-engineer: when test infrastructure was missing, the AI built it rather than blocking — ~10 debugging attempts to get browser auth working, then confirmed 10/14 features in browser

## AI-as-QA-engineer story (Stage 6)

Key narrative beats from the QA session (bbed2295):
- No test credentials → AI wrote seed.sql + /dev-login page rather than reporting BLOCKED
- ~10 debugging rounds: GoTrue bcrypt, NULL token fields, NEXT_PUBLIC env baking in Turbopack,
  .env.development.local solution, stale localStorage anonymous session
- Login working → home screen screenshot → open session screenshot (3 features in 1 frame)
- Found and fixed TDZ crash: `userId` used line 280, declared line 294 — all 391 tests passed

## Failures featured

| Failure | Log evidence | Fix applied |
|---|---|---|
| `[id]` glob in 6/16 runs | `iter-5`, multiple grep/cat failures | AGENTS.md extended to all shell commands |
| Double implementer (#74) | `iter-5` second implementer call visible in log | PROMPT.md post-implementer UI check |
| BLOCKED false-positive in digest | `iter-3` #82 flagged incorrectly | digest.sh BLOCKED detection |
| TDZ crash slipped all gates | QA browser session, found in 30s | AGENTS.md variable ordering note |
