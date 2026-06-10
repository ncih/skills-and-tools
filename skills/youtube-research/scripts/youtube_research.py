#!/usr/bin/env python3
"""
YouTube Research Script
Searches YouTube for videos on a topic and extracts their native transcripts.
Saves each transcript as a structured markdown file.

Usage:
  python youtube_research.py search "AI automation pipelines" --limit 5
  python youtube_research.py fetch "https://youtube.com/watch?v=VIDEO_ID"
  python youtube_research.py fetch VIDEO_ID1 VIDEO_ID2 VIDEO_ID3
"""

import sys
import re
import json
import argparse
import subprocess
from datetime import date
from pathlib import Path


# ── Dependency check / auto-install ──────────────────────────────────────────

YT_DLP = [sys.executable, "-m", "yt_dlp"]  # always works regardless of PATH

def ensure_deps():
    missing = []
    try:
        import youtube_transcript_api  # noqa
    except ImportError:
        missing.append("youtube-transcript-api")
    try:
        subprocess.run([sys.executable, "-m", "yt_dlp", "--version"], capture_output=True, check=True)
    except subprocess.CalledProcessError:
        missing.append("yt-dlp")

    if missing:
        print(f"Installing: {', '.join(missing)} ...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "--break-system-packages"] + missing,
            check=True,
        )
        print("Done.\n")

ensure_deps()

from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled  # noqa


# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_video_id(url_or_id: str) -> str:
    """Accept a URL or bare 11-char video ID, return the video ID."""
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url_or_id)
        if m:
            return m.group(1)
    # Assume it's already a bare video ID
    if re.match(r"^[A-Za-z0-9_-]{11}$", url_or_id):
        return url_or_id
    raise ValueError(f"Cannot extract video ID from: {url_or_id}")


def safe_filename(title: str) -> str:
    """Convert a video title to a safe filename."""
    slug = re.sub(r"[^\w\s-]", "", title.lower())
    slug = re.sub(r"[\s_]+", "-", slug).strip("-")
    return slug[:80] + ".md"


def search_youtube(query: str, limit: int = 10) -> list[dict]:
    """Use yt-dlp to search YouTube. Returns list of video dicts."""
    print(f"Searching YouTube: \"{query}\" (limit {limit})...")
    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--print", "%(id)s\t%(title)s\t%(channel)s\t%(duration_string)s\t%(view_count)s",
        "--no-warnings",
        f"ytsearch{limit}:{query}",
    ]
    cmd = YT_DLP + cmd[1:]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Search error: {result.stderr.strip()}", file=sys.stderr)
        return []

    videos = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            videos.append({
                "id": parts[0],
                "title": parts[1] if len(parts) > 1 else "Unknown",
                "channel": parts[2] if len(parts) > 2 else "Unknown",
                "duration": parts[3] if len(parts) > 3 else "?",
                "views": parts[4] if len(parts) > 4 else "?",
                "url": f"https://youtube.com/watch?v={parts[0]}",
            })
    return videos


def fetch_transcript(video_id: str) -> tuple[str | None, str | None]:
    """
    Fetch native YouTube transcript. Returns (transcript_text, language).
    Tries: English first, then any available language.
    Returns (None, error_message) if unavailable.
    """
    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)

        # Try English first, then fall back to any available language
        try:
            transcript = transcript_list.find_transcript(["en"])
        except Exception:
            transcript = next(iter(transcript_list))

        data = transcript.fetch()
        language = transcript.language_code

        # Format with timestamps
        lines = []
        for entry in data:
            start = getattr(entry, "start", None) or entry.get("start", 0) if isinstance(entry, dict) else entry.start
            text = (getattr(entry, "text", None) or entry.get("text", "") if isinstance(entry, dict) else entry.text).strip()
            if text:
                mins, secs = divmod(int(start), 60)
                hrs, mins = divmod(mins, 60)
                ts = f"[{hrs:02d}:{mins:02d}:{secs:02d}]" if hrs else f"[{mins:02d}:{secs:02d}]"
                lines.append(f"{ts} {text}")

        return "\n".join(lines), language

    except TranscriptsDisabled:
        return None, "Transcripts disabled for this video"
    except NoTranscriptFound:
        return None, "No transcript available (no captions)"
    except Exception as e:
        return None, str(e)


def get_video_title(video_id: str) -> str:
    """Fetch video title via yt-dlp for direct-link mode."""
    cmd = YT_DLP + ["--print", "%(title)s\t%(channel)s", "--no-warnings",
           f"https://youtube.com/watch?v={video_id}"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0 and result.stdout.strip():
        parts = result.stdout.strip().split("\t")
        return parts[0], parts[1] if len(parts) > 1 else "Unknown"
    return video_id, "Unknown"


def save_transcript(video: dict, transcript: str, language: str, output_dir: Path) -> Path:
    """Save transcript as a markdown file. Returns the saved path."""
    filename = safe_filename(video["title"])
    filepath = output_dir / filename

    # Avoid overwriting — append counter if needed
    counter = 1
    while filepath.exists():
        stem = safe_filename(video["title"]).replace(".md", "")
        filepath = output_dir / f"{stem}-{counter}.md"
        counter += 1

    content = f"""# {video['title']}

**Channel:** {video['channel']}
**URL:** {video['url']}
**Retrieved:** {date.today().isoformat()}
**Language:** {language}

---

## Transcript

{transcript}
"""
    filepath.write_text(content, encoding="utf-8")
    return filepath


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_search(args):
    query = " ".join(args.query)
    limit = args.limit
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    videos = search_youtube(query, limit=limit * 2)  # Fetch extra to account for no-caption videos
    if not videos:
        print("No results found.")
        return

    # Show results
    print(f"\nFound {len(videos)} videos:\n")
    for i, v in enumerate(videos, 1):
        views = f"{int(v['views']):,}" if v['views'].isdigit() else v['views']
        print(f"  {i:2}. {v['title']}")
        print(f"      {v['channel']} · {v['duration']} · {views} views")
        print(f"      {v['url']}\n")

    # Selection
    if args.auto or limit >= len(videos):
        selected = videos[:limit]
        print(f"Fetching transcripts for top {len(selected)} videos...\n")
    else:
        raw = input(f"Which videos? (e.g. '1 3 5', 'top {limit}', or 'all'): ").strip().lower()
        if raw in ("all", ""):
            selected = videos[:limit]
        elif raw.startswith("top"):
            n = int(re.search(r"\d+", raw).group()) if re.search(r"\d+", raw) else limit
            selected = videos[:n]
        else:
            indices = [int(x) - 1 for x in re.findall(r"\d+", raw) if 1 <= int(x) <= len(videos)]
            selected = [videos[i] for i in indices]

    _fetch_and_save(selected, output_dir)


def cmd_fetch(args):
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    videos = []
    for url_or_id in args.urls:
        try:
            vid_id = extract_video_id(url_or_id)
            title, channel = get_video_title(vid_id)
            videos.append({
                "id": vid_id,
                "title": title,
                "channel": channel,
                "url": f"https://youtube.com/watch?v={vid_id}",
            })
        except ValueError as e:
            print(f"Skipping '{url_or_id}': {e}")

    _fetch_and_save(videos, output_dir)


def _fetch_and_save(videos: list[dict], output_dir: Path):
    saved = []
    skipped = []

    for v in videos:
        print(f"Fetching transcript: {v['title'][:60]}...")
        transcript, lang_or_err = fetch_transcript(v["id"])

        if transcript is None:
            print(f"  ✗ Skipped — {lang_or_err}")
            skipped.append((v["title"], lang_or_err))
        else:
            filepath = save_transcript(v, transcript, lang_or_err, output_dir)
            print(f"  ✓ Saved → {filepath.name}")
            saved.append(filepath)

    # Summary
    print(f"\n{'─'*50}")
    print(f"Saved:   {len(saved)} transcript(s) → {output_dir}")
    if skipped:
        print(f"Skipped: {len(skipped)} video(s) (no captions)")
        for title, reason in skipped:
            print(f"  • {title[:60]} — {reason}")
    print(f"{'─'*50}")

    if saved:
        print("\nFiles:")
        for p in saved:
            print(f"  {p}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="YouTube Research — search and extract transcripts")
    parser.add_argument("--output", "-o", default=".", help="Directory to save transcript files (default: current dir)")

    sub = parser.add_subparsers(dest="command")

    p_search = sub.add_parser("search", help="Search YouTube by topic")
    p_search.add_argument("query", nargs="+", help="Search query")
    p_search.add_argument("--limit", "-n", type=int, default=5, help="Max transcripts to fetch (default 5)")
    p_search.add_argument("--auto", "-y", action="store_true", help="Skip video selection prompt")
    p_search.add_argument("--output", "-o", default=None, help="Output directory (overrides global)")

    p_fetch = sub.add_parser("fetch", help="Fetch transcripts from specific URLs or video IDs")
    p_fetch.add_argument("urls", nargs="+", help="YouTube URLs or video IDs")
    p_fetch.add_argument("--output", "-o", default=None, help="Output directory (overrides global)")

    args = parser.parse_args()

    # Sub-command --output overrides global
    if hasattr(args, "output") and args.output:
        pass  # already set on args
    # (global --output is the fallback, already on args from parent parser)

    if args.command == "search":
        cmd_search(args)
    elif args.command == "fetch":
        cmd_fetch(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
