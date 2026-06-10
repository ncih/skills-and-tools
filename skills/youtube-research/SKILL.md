---
name: youtube-research
description: Search YouTube for videos on a topic and extract their full native transcripts, saving each as a structured markdown file. Use whenever the user wants to research a topic using YouTube content, says "find videos about X", "get transcripts from YouTube on Y", pastes one or more YouTube URLs or video IDs, or wants raw video content saved for downstream research. No API key or account needed — uses YouTube's native captions directly. Triggers on: "research on YouTube", "find me videos about", "get transcripts for", pasted youtube.com or youtu.be links.
version: "1.0.0"
---

# YouTube Research

Search YouTube and extract native transcripts into clean markdown files.
No API key needed. Uses YouTube's own captions via `youtube-transcript-api` + `yt-dlp`.

The bundled script handles everything including auto-installing its own dependencies on first run.

## Script location

`scripts/youtube_research.py` (in this skill folder)

Run it with:

```bash
python path/to/scripts/youtube_research.py <command> [options]
```

---

## Two modes

### A. Topic search

User gives a research topic or question.

```bash
python scripts/youtube_research.py search "AI automation pipelines" --limit 5
```

- Searches YouTube, shows numbered list of results with channel/duration/views
- Asks user which to fetch (or use `--auto` / `-y` to skip the prompt)
- Fetches native transcripts and saves each as a `.md` file

### B. Direct URLs / video IDs

User pastes one or more YouTube links or video IDs. Skip search entirely.

```bash
python scripts/youtube_research.py fetch https://youtube.com/watch?v=ABC123 https://youtu.be/XYZ789
python scripts/youtube_research.py fetch ABC123def45
```

Accepts: `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID`, or bare 11-char video IDs.

---

## Output location

By default saves to the **current working directory**. Override with `--output`:

```bash
python scripts/youtube_research.py search "LLM agents" --output ~/research/ai-agents
```

Each file is named after the video title, e.g. `what-is-agentic-ai-andrej-karpathy.md`.

### File format

```markdown
# Video Title

**Channel:** Channel Name
**URL:** https://youtube.com/watch?v=VIDEO_ID
**Retrieved:** 2026-06-02
**Language:** en

---

## Transcript

[00:00] Welcome to today's session...
[00:15] We're going to cover...
```

---

## How to invoke this skill

When the user asks to research a YouTube topic or extract transcripts, construct and run the appropriate command using the script. Always tell the user:

1. The command you're running
2. Where files will be saved
3. Summary of what was saved / skipped after it completes

If the script is not yet on the user's PATH, use the full path to `scripts/youtube_research.py` within this skill's directory.

## Notes

- Videos without captions are skipped gracefully with a reason
- Tries manual captions first, falls back to auto-generated
- Auto-installs `youtube-transcript-api` and `yt-dlp` on first run if missing (requires pip)
- No API keys, no accounts, no credits
