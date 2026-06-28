#!/usr/bin/env python3
"""Fetch a YouTube transcript and emit it as a JSON array on stdout.

Usage:  python fetch_transcript.py <videoId> [lang1 lang2 ...]

Output (stdout, exit 0):
    [{"text": "...", "start": 0.0, "duration": 2.5}, ...]

On failure, writes a JSON error object to stderr and exits non-zero so the
Node wrapper can distinguish "no transcript" from "transient error".
    exit 2 -> bad usage
    exit 3 -> transcript genuinely/permanently unavailable
    exit 1 -> transient error (IP block, network, rate limit) -> retryable
"""
import sys
import json

# YouTube transcripts are UTF-8; Windows consoles default to cp1252 and would
# raise on non-Latin characters. Force UTF-8 on both streams. The Node wrapper
# decodes the pipe as UTF-8 to match.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing videoId"}), file=sys.stderr)
        return 2

    video_id = sys.argv[1]
    languages = sys.argv[2:] or ["en"]

    try:
        from youtube_transcript_api import (
            YouTubeTranscriptApi,
            # permanent / not-retryable
            TranscriptsDisabled,
            NoTranscriptFound,
            VideoUnavailable,
            VideoUnplayable,
            AgeRestricted,
            InvalidVideoId,
            # transient / retryable
            RequestBlocked,
            IpBlocked,
            PoTokenRequired,
            YouTubeRequestFailed,
        )
    except ImportError as exc:
        print(json.dumps({"error": f"import_error: {exc}"}), file=sys.stderr)
        return 1

    permanent = (
        TranscriptsDisabled,
        NoTranscriptFound,
        VideoUnavailable,
        VideoUnplayable,
        AgeRestricted,
        InvalidVideoId,
    )
    transient = (RequestBlocked, IpBlocked, PoTokenRequired, YouTubeRequestFailed)

    try:
        api = YouTubeTranscriptApi()
        # Try requested languages first; fall back to any available transcript.
        try:
            fetched = api.fetch(video_id, languages=languages)
        except NoTranscriptFound:
            transcripts = api.list(video_id)
            transcript = next(iter(transcripts))
            fetched = transcript.fetch()

        out = [
            {
                "text": snippet.text,
                "start": float(snippet.start),
                "duration": float(snippet.duration),
            }
            for snippet in fetched
        ]
        print(json.dumps(out, ensure_ascii=False))
        return 0
    except permanent as exc:
        print(json.dumps({"error": type(exc).__name__}), file=sys.stderr)
        return 3
    except transient as exc:
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"}), file=sys.stderr)
        return 1
    except Exception as exc:  # unknown -> treat as retryable
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
