# YouTube Data Analyzer

A serverless, event-driven pipeline on **Azure Functions v4** that watches YouTube
channels, ingests every new upload, extracts its metadata / comments / transcript,
runs **AI clickbait + sentiment analysis**, persists structured insights to **Cosmos
DB**, and tracks engagement velocity over time. The data is exposed through an API
for a React dashboard (Phase 7).

The pipeline is **push-based**: YouTube notifies us the moment a video is published
(via PubSubHubbub), so there is no polling of the upload feed.

---

## Table of contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [End-to-end data flow](#end-to-end-data-flow)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [AI enrichment](#ai-enrichment)
- [Resilience &amp; degradation](#resilience--degradation)
- [HTTP endpoints](#http-endpoints)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Deployment](#deployment)
- [Roadmap](#roadmap)

---

## Architecture

```
                                    ┌─────────────────────────────────┐
   YouTube PubSubHubbub ──webhook──▶│  APIM (public front door)       │
                                    └───────────────┬─────────────────┘
                                                    │
        ┌───────────────────────────┬───────────────┼──────────────────────────┐
        ▼                           ▼               ▼                          ▼
  POST /channels            /webhook/youtube   /dashboard/.../refresh    /dashboard/.../transcript
  (HTTP fn)                 (HTTP fn)          (HTTP fn, Phase 6)         (HTTP fn, Phase 6)
        │                           │
        │ save + subscribe          │ publish {videoId, channelId}
        ▼                           ▼
   Cosmos:Channels         Event Hub: video-ingestion-hub
                                    │
                                    ▼
                          EventHubTrigger: processVideoIngestion ──┐
                          (YouTube Data API + Python transcript)   │
                                                                   ▼
                                                          AI enrichment layer
                                              (Vision + Gemini + Azure AI Language)
                                                                   ▼
                                                        Cosmos: VideoInsights (upsert)
                                                                   ▲
                          TimerTrigger (daily, Phase 5) ───────────┘  (append timeline + new comments)

                          Cosmos: VideoInsights ──read──▶ Dashboard API ──▶ React SPA (Phase 7)
```

Two ideas drive the design:

1. **Event-driven, not request-driven.** The webhook does almost no work — it
   validates the Atom payload and drops a small message on Event Hub, then returns
   `202` immediately. All the heavy extraction/AI work happens asynchronously in the
   Event Hub trigger, so a slow YouTube/AI call never blocks (and never causes the
   hub to retry the webhook).
2. **Degrade, never block.** Every external dependency (Vision, Gemini, Language,
   the transcript scraper) can fail independently and the pipeline still persists
   whatever succeeded. See [Resilience & degradation](#resilience--degradation).

---

## Tech stack

| Concern | Choice |
|---|---|
| Compute | Azure Functions v4, Node.js **v4 programming model** (TypeScript) |
| Runtime / package manager | **Bun** (local dev, build, deps); Azure runs Node at runtime |
| API gateway | Azure API Management (APIM) |
| Message broker | Azure Event Hubs (`video-ingestion-hub`) |
| Database | Azure Cosmos DB (NoSQL) — `Channels`, `VideoInsights` |
| Thumbnail vision | Azure AI Vision (Image Analysis 4.0 — Read / Tags / Objects) |
| LLM | Google **Gemini Flash** (`gemini-2.5-flash`) — sole LLM provider |
| Sentiment NLP | Azure AI Language (Text Analytics sentiment) |
| Transcripts | Python `youtube-transcript-api` via `child_process.spawn()` |
| Validation | **Zod** at every trust boundary (env, HTTP bodies, queue messages, AI responses, Cosmos reads) |

---

## End-to-end data flow

1. **Register a channel** — `POST /api/channels` with a channel URL/handle/ID.
   The service resolves it to a canonical `UC…` channel ID, upserts a `Channels`
   doc, and fires an async **PubSubHubbub** subscribe request.
2. **Hub handshake** — PubSubHubbub calls back with a `GET` challenge; the webhook
   echoes it and flips the channel's `hubSubscriptionStatus` to `verified`.
3. **New upload** — when the channel publishes, the hub `POST`s an Atom feed to the
   webhook. We parse out `{ videoId, channelId }`, publish a message to
   `video-ingestion-hub` (partitioned by `channelId`), and return `202`.
4. **Extraction** — the Event Hub trigger (`processVideoIngestion`) fetches:
   - video metadata + statistics (YouTube Data API `videos`),
   - top ~100 comments (`commentThreads`, relevance order),
   - the transcript (Python scraper via `spawn`).
5. **AI enrichment** — thumbnail Vision (OCR + tags + objects) → clickbait scoring
   (heuristic + Gemini) → transcript-hook sentiment → per-comment sentiment.
6. **Persist** — the assembled `VideoInsights` document is upserted to Cosmos. Re-runs
   merge with the existing doc so nothing is lost, and a new `timeline` snapshot is
   appended.
7. **Track over time** *(Phase 5)* — a daily timer re-pings view count + new comments
   and appends to `timeline` / `comments`.

---

## Project structure

The code is **layered**, with dependencies pointing strictly downward
(`functions → services → clients/domain → config/types`):

```
src/
├─ config/
│  └─ env.ts              # Zod-validated, cached environment access (fail-fast)
├─ types/                 # Zod schemas + inferred TS types (the shared contract)
│  ├─ common.ts           #   enums, sentiment scores, Logger
│  ├─ channel.ts          #   Channels document
│  ├─ ingestion.ts        #   Event Hub message
│  ├─ insights.ts         #   AI insights block + ClickbaitSignals
│  ├─ video.ts            #   VideoInsights document
│  └─ index.ts            #   barrel
├─ domain/                # Pure logic, no I/O
│  ├─ atom.ts             #   Atom feed parsing + topic URLs
│  └─ clickbait.ts        #   heuristic score, label thresholds, score merge
├─ clients/               # Thin singletons wrapping each external SDK/API
│  ├─ cosmosClient.ts     #   Cosmos client + getContainer()
│  ├─ eventHubClient.ts   #   Event Hub producer
│  ├─ youtubeClient.ts    #   YouTube Data API URL builder
│  ├─ visionClient.ts     #   Azure AI Vision
│  ├─ languageClient.ts   #   Azure AI Language
│  └─ geminiClient.ts     #   Gemini model factory
├─ db/
│  └─ repositories.ts     # Schema map: binds each container to its Zod schema
├─ services/              # Business logic / orchestration
│  ├─ cosmoRepoService.ts #   generic validated repository factory
│  ├─ channelService.ts   #   resolve + register channel, manage subscription
│  ├─ ingestionService.ts #   publish to Event Hub
│  ├─ videoService.ts     #   YouTube metadata + comments
│  ├─ transcriptService.ts#   Python transcript scraper bridge
│  ├─ visionService.ts    #   thumbnail OCR/tags/objects
│  ├─ clickbaitService.ts #   heuristic + Gemini clickbait scoring
│  ├─ sentimentService.ts #   Azure AI Language sentiment
│  └─ enrichmentService.ts#   orchestrates all AI steps → insights block
├─ functions/             # Azure Functions entry points (triggers only)
│  ├─ registerChannel.ts  #   POST /api/channels
│  ├─ youtubeWebhook.ts   #   GET/POST /api/webhook/youtube
│  └─ processVideoIngestion.ts # EventHubTrigger on video-ingestion-hub
└─ scripts/
   ├─ fetch_transcript.py # youtube-transcript-api 1.x scraper (JSON to stdout)
   └─ requirements.txt
```

**Why this shape:**

- **`functions/` are thin.** A trigger validates its input, calls services, and
  shapes the response. No business logic lives in a handler.
- **`services/` orchestrate; `domain/` is pure.** Clickbait math (`domain/clickbait.ts`)
  has no I/O and is trivially testable; `clickbaitService.ts` adds the Gemini call and
  degradation around it.
- **The data layer validates once.** `cosmoRepoService.createRepository(container, schema)`
  returns a typed repository whose `read`/`query` run the Zod schema automatically and
  log/skip drift. `db/repositories.ts` is the single place every container↔schema
  binding is declared — adding a table is one line.
- **`types/` are Zod-sourced.** Persisted shapes are defined as Zod schemas with
  `z.infer` for the TS type, so the same definition validates Cosmos reads *and* types
  the code.

---

## Data model

### `Channels` container (partition key `/channelId`)

```jsonc
{
  "id": "UCxxxx",              // == channelId
  "channelId": "UCxxxx",
  "url": "https://youtube.com/@handle",
  "topicUrl": "https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCxxxx",
  "hubSubscriptionStatus": "pending | verified | failed",
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

### `VideoInsights` container (partition key `/channelId`)

```jsonc
{
  "id": "dQw4w9WgXcQ",         // == videoId
  "channelId": "UCxxxx",       // partition key
  "publishedAt": "ISO",
  "metadata": {
    "title": "...", "description": "...",
    "thumbnailUrl": "...", "videoUrl": "...",
    "transcript_status": "success | failed_retryable | manual_override",
    "transcript": [{ "text": "...", "start": 0.0, "duration": 1.2 }]
  },
  "insights": {
    "thumbnail":  { "ocr_text": ["..."], "tags": ["..."], "objects": ["..."] },
    "clickbait":  {
      "heuristic_score": 0.71, "heuristic_label": "Likely Clickbait",
      "llm_score": 0.40,       "llm_label": "Mildly Clickbait",
      "llm_source": "gemini-2.5-flash",
      "weighted_score": 0.49,  "max_score": 0.71, "max_label": "Likely Clickbait",
      "verdict": "Mildly Clickbait", "is_clickbait": false
    },
    "transcript_sentiment": { "label": "Positive", "window_seconds": 15 },
    "comment_sentiment": {
      "overall": "Positive",
      "counts":        { "positive": 60, "negative": 10, "neutral": 25, "mixed": 5 },
      "distribution":  { "positive": 0.6,  "negative": 0.1, "neutral": 0.25, "mixed": 0.05 },
      "average_scores":{ "positive": 0.58, "neutral": 0.30, "negative": 0.12 },
      "total": 100
    }
  },
  "comments": [
    { "id": "...", "author": "...", "text": "...",
      "sentiment": "Positive",
      "confidence": { "positive": 0.9, "neutral": 0.08, "negative": 0.02 },
      "timestamp": "ISO" }
  ],
  "timeline": [
    { "timestamp": "ISO", "views": 12345,
      "aggregate_sentiment": { "positive": 0.58, "negative": 0.12, "neutral": 0.30 } }
  ]
}
```

---

## AI enrichment

All steps are orchestrated by `enrichmentService.enrichVideo()` and each degrades
independently.

### Thumbnail vision (`visionService.ts`)
Azure AI Vision Image Analysis 4.0. Requests `Read` (OCR), `Tags`, and `Objects`.
Tags/Objects are region-limited, so on failure it **retries with `Read` only** — OCR
text is the signal the rest of the pipeline depends on.

### Clickbait scoring (`clickbaitService.ts` + `domain/clickbait.ts`)
Two scorers see the **same evidence** (`ClickbaitSignals`: title, description, tags,
objects, thumbnail OCR overlays):

- **Heuristic (rule-based, 0–1):** overlay presence, ALL-CAPS ratio, count of
  absolute/sensational words, and punctuation intensity — each capped.
- **LLM (Gemini, 0–1):** a strict JSON system prompt, `temperature: 0`,
  `responseMimeType: application/json`, Zod-validated reply.

They merge into:
- `weighted_score = 0.3·heuristic + 0.7·llm` → drives `verdict` and `is_clickbait`
  (threshold `0.5`),
- `max_score = max(heuristic, llm)`,
- human labels: *Not / Mildly / Likely / Highly Clickbait*.

If Gemini fails (no key, timeout 15s, quota, network), `llm_score` falls back to the
heuristic score and `llm_source` becomes `"heuristic_fallback"` — scoring never blocks.

### Sentiment (`sentimentService.ts`)
Azure AI Language. The **transcript hook** (first 15s) gets a single-doc call; the
**comments** are batched (10 docs/request, ≤5000 chars each) with results aligned back
to input order. Each comment keeps its `confidence` scores; `comment_sentiment`
aggregates counts, distribution, and the mean confidence (overall = argmax of means).

### Gemini call budget
**One Gemini call per video** (clickbait scoring only). Vision and Language are the
other two paid services; transcripts are free (scraped).

---

## Resilience & degradation

| Failure | Behavior |
|---|---|
| Video deleted/private | metadata returns `null` → message skipped cleanly |
| Metadata API transient error | re-throws → Event Hub re-delivers (eventually DLQ) |
| Comments disabled | treated as `[]` (permanent, not an error) |
| Comment fetch transient error | logged; `transcript_status = failed_retryable`, run continues |
| No transcript available | `TranscriptUnavailableError` (exit 3) → status stays, run continues |
| Transcript transient/timeout | `transcript_status = failed_retryable`, run continues |
| Vision down | empty OCR/tags/objects; clickbait still scores on title/description |
| Gemini down | `llm_source = heuristic_fallback`, weighted score = heuristic |
| Language down | comments keep placeholder `Neutral` sentiment |
| Cosmos doc fails schema (drift) | logged with field paths, treated as "not found"; doc rebuilt |

Re-running extraction for a video **merges** with the existing document (preserves prior
transcript/comments if the new run came up empty) rather than overwriting.

---

## HTTP endpoints

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/channels` | Register a channel (`{ channel \| url \| channelId }`) and subscribe |
| `GET`  | `/api/webhook/youtube` | PubSubHubbub verification handshake (echoes `hub.challenge`) |
| `POST` | `/api/webhook/youtube` | Atom upload notification → publish to Event Hub, `202` |

> `EventHubTrigger` (`processVideoIngestion`) is not an HTTP endpoint — it fires off the
> `video-ingestion-hub`. Dashboard read APIs and refresh/transcript write-backs come in
> Phases 6–7.

---

## Local development

### Prerequisites
- **Bun** (package manager + build)
- **Azure Functions Core Tools v4** (`func --version` → 4.x)
- **Python 3.9+** (for the transcript scraper)
- Azure resources: Cosmos DB, Event Hubs, AI Vision, AI Language; a YouTube Data API
  key; a Gemini API key.

### Setup
```bash
# 1. Install Node deps
bun install

# 2. Python venv for the transcript scraper
python -m venv .venv
.venv/Scripts/python -m pip install -r src/scripts/requirements.txt   # Windows
# source .venv/bin/activate && pip install -r src/scripts/requirements.txt  # macOS/Linux

# 3. Configure secrets (see next section) in local.settings.json — gitignored

# 4. Build + run
bun run build
bun run start          # runs `func start` (prestart builds first)
```

`local.settings.json` is **local-only and gitignored** — it is never deployed. In
Azure the same keys live as Function App **Application Settings**.

### The transcript scraper
`fetch_transcript.py` uses `youtube-transcript-api` **1.x** (the 0.6.x classmethod API
is broken against current YouTube endpoints). It prints `{text,start,duration}[]` JSON to
stdout and signals outcome via exit code: `0` success, `2` bad usage, `3` permanently
unavailable, `1` transient/retryable. `PYTHON_BIN` points the worker at the venv
interpreter.

---

## Environment variables

Validated by `config/env.ts` (Zod) on first access — missing **required** vars fail fast.

**Required**
| Key | Notes |
|---|---|
| `COSMOS_CONNECTION_STRING` | Cosmos DB account connection string |
| `EVENTHUB_CONNECTION_STRING` | used by the **producer** (publish code) |
| `EventHubConnection` | used by the **trigger binding** (resolved by setting *name*) — set to the same value |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key |

**Defaults provided**
| Key | Default |
|---|---|
| `COSMOS_DATABASE` | `ytanalytics` |
| `EVENTHUB_NAME` | `video-ingestion-hub` |
| `PUBSUBHUBBUB_HUB_URL` | `https://pubsubhubbub.appspot.com/subscribe` |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `PYTHON_BIN` | `python` |

**Optional (features degrade if absent)**
`PUBSUBHUBBUB_CALLBACK_URL`, `PUBSUBHUBBUB_VERIFY_TOKEN`, `PUBSUBHUBBUB_LEASE_SECONDS`,
`GEMINI_API_KEY`, `VISION_ENDPOINT`, `VISION_KEY`, `LANGUAGE_ENDPOINT`, `LANGUAGE_KEY`,
`SCRIPTS_DIR`.

> **Two Event Hub keys?** Yes. Your producer code reads a connection *string*
> (`EVENTHUB_CONNECTION_STRING`); the Functions trigger binding resolves a setting by
> *name* (`EventHubConnection`). They hold the same value.

---

## Deployment

The local `local.settings.json` is never deployed. In Azure:

1. **Function App (Node)** — deploy with `func azure functionapp publish <app-name>`.
   The Consumption plan is fine to start.
2. **App Settings** — every env var above becomes an encrypted Application Setting,
   injected into the process as `process.env.*` (so `env()` works unchanged). They are
   server-side only and visible only to RBAC-authorized users.
   - **Hardening:** store secrets in **Key Vault** and reference them
     (`@Microsoft.KeyVault(SecretUri=…)`); the app reads them via its **Managed
     Identity** — no raw secrets in config.
   - **Best:** drop connection strings entirely and grant the Function App's managed
     identity RBAC roles (Cosmos Data Contributor, Event Hubs Data Receiver/Sender) so
     bindings authenticate with zero stored secrets.
3. **Python transcripts** — the Node Functions host has no Python. Deploy
   `fetch_transcript.py` as a **separate Python Function App** (no Docker needed) and
   have `transcriptService.ts` call it over HTTP. That service is the single seam to
   change (swap `spawn` → `fetch`).
4. **APIM** — put API Management in front for the public routes, then set
   `PUBSUBHUBBUB_CALLBACK_URL` to the APIM webhook URL.

---

## Roadmap

See [`plan.md`](plan.md) for the full phased plan.

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffold & shared foundations | ✅ Done |
| 1 | Channel management + webhook ingestion | ✅ Done |
| 2 | Data extraction worker (metadata/comments/transcript) | ✅ Done |
| 3 | AI processing (Vision + Gemini + Language) | ✅ Done |
| 4 | Persistence to Cosmos (strict schema) | ✅ Done |
| 5 | Time-series tracking (daily timer) | ⏭ Next |
| 6 | Dashboard write-back endpoints (refresh / transcript override) | ⬜ Planned |
| 7 | React dashboard frontend | ⬜ Planned |
```
