---
name: current-session-path
description: Finds and returns the absolute path to the current Claude Code session's JSONL log file. Use when the user asks for the current chat log path, session file location, transcript path, or wants to pass this session to another chat.
---

# Current Session Path

## How it works

Claude Code stores session logs as JSONL files at:
```
~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl
```

The encoded project path is the absolute `$PWD` with `/` replaced by `-`
(e.g. `/Users/alice/projects/foo` → `-Users-alice-projects-foo`).

There is no env var exposing the current session ID, so we find it by
grepping for a string unique to this conversation.

## Steps

1. **Build the project dir path:**
```bash
PROJECT_DIR="$HOME/.claude/projects/$(pwd | sed 's|/|-|g')"
```

2. **Grep for the user's most recent message** — use a distinctive phrase
   they just typed (avoid common words). The current message asking for
   the path is itself ideal:
```bash
grep -rl "<distinctive phrase from this conversation>" "$PROJECT_DIR"/*.jsonl
```

3. **Return the single matching path.** If multiple files match, use the
   most recently modified one:
```bash
ls -t $(grep -rl "<phrase>" "$PROJECT_DIR"/*.jsonl) | head -1
```

## Example

User says: *"give me the path to this chat log"*

```bash
PROJECT_DIR="$HOME/.claude/projects/$(pwd | sed 's|/|-|g')"
grep -rl "give me the path to this chat log" "$PROJECT_DIR"/*.jsonl
# → /Users/nicholas/.claude/projects/-Users-nicholas-Desktop-Projects-foo/fcfd3e2f-....jsonl
```

## Notes

- The JSONL file is the live session — it grows as the conversation continues.
- To pass it to a fresh chat, give the full absolute path above.
- If the project has no sessions yet, `$PROJECT_DIR` won't exist — say so.
