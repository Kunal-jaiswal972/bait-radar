"""YouTube transcript microservice — an HTTP-triggered Azure Function (Python v2).

The Node pipeline can't reliably fetch YouTube transcripts (its InnerTube/timedtext
calls are gated behind a session PoToken and return empty), so transcript
extraction lives here on youtube-transcript-api and is called over HTTP by
src/services/transcriptService.ts.

Contract (HTTP statuses let the Node caller tell "no transcript" from "retry later"):
    GET/POST /api/transcript?videoId=<id>[&lang=en,hi]
    200  -> { "segments": [{ "text": str, "start": float, "duration": float }, ...] }
    400  -> { "error": "missing videoId" }               (bad request)
    404  -> { "error": "<ExceptionName>" }               (permanently unavailable)
    503  -> { "error": "<ExceptionName>: <detail>" }      (transient — retryable)
"""
import json
import logging

import azure.functions as func
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
    YouTubeRequestFailed,
)

app = func.FunctionApp()

PERMANENT = (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    VideoUnplayable,
    AgeRestricted,
    InvalidVideoId,
)
TRANSIENT = (RequestBlocked, IpBlocked, YouTubeRequestFailed)


def _json(payload: dict, status: int) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(payload, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
    )


def _video_id(req: func.HttpRequest) -> str | None:
    vid = req.params.get("videoId")
    if vid:
        return vid
    try:
        body = req.get_json()
        return body.get("videoId") if isinstance(body, dict) else None
    except ValueError:
        return None


@app.function_name("transcript")
@app.route(route="transcript", methods=["GET", "POST"], auth_level=func.AuthLevel.FUNCTION)
def transcript(req: func.HttpRequest) -> func.HttpResponse:
    video_id = _video_id(req)
    if not video_id:
        return _json({"error": "missing videoId"}, 400)

    languages = [x for x in req.params.get("lang", "en").split(",") if x] or ["en"]

    try:
        api = YouTubeTranscriptApi()
        # Try requested languages first; fall back to any available transcript.
        try:
            fetched = api.fetch(video_id, languages=languages)
        except NoTranscriptFound:
            fetched = next(iter(api.list(video_id))).fetch()

        segments = [
            {"text": s.text, "start": float(s.start), "duration": float(s.duration)}
            for s in fetched
        ]
        return _json({"segments": segments}, 200)
    except PERMANENT as exc:
        logging.info("Transcript unavailable for %s: %s", video_id, type(exc).__name__)
        return _json({"error": type(exc).__name__}, 404)
    except TRANSIENT as exc:
        logging.warning("Transcript transient error for %s: %s", video_id, exc)
        return _json({"error": f"{type(exc).__name__}: {exc}"}, 503)
    except Exception as exc:  # unknown -> treat as retryable
        logging.exception("Transcript fetch failed for %s", video_id)
        return _json({"error": str(exc)}, 503)
