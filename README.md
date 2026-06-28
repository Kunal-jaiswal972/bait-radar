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
4. **Extraction** — the Event Hub trigger (`processVideoIngestion`, batched up to 20)
   fetches video metadata + statistics. **Shorts** (duration < `MIN_VIDEO_SECONDS_THRESHOLD`) are
   skipped here and never persisted. For everything else it also fetches:
   - up to 200 newest comments (`commentThreads`, time order, paginated),
   - the transcript (Python scraper via `spawn`).
5. **AI enrichment** — three clickbait pillars (packaging Vision+Gemini, promise–payoff
   mismatch, comment betrayal) → `clickbait_percentage`; plus transcript-hook sentiment
   and per-comment sentiment + opinion mining.
6. **Persist** — the assembled `VideoInsights` document is upserted to Cosmos. Re-runs
   merge with the existing doc so nothing is lost, and a new `timeline` snapshot is
   appended. Then each touched channel's clickbait propensity is recomputed.
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
│  ├─ lexicons.ts         #   loads the word/phrase lists from src/data/*.txt (cached)
│  └─ clickbait.ts        #   heuristic, packaging merge, betrayal, aggregate, channel rollup
├─ data/                  # Editable lexicons (loaded at startup; grow freely)
│  ├─ clickbait-words.txt #   sensational / power / curiosity words for the heuristic
│  ├─ betrayal-phrases.txt#   "clickbait / lied / nothing happened …" for the betrayal pillar
│  └─ stopwords.txt       #   English stopwords for the lexical mismatch fallback
├─ clients/               # Thin singletons wrapping each external SDK/API
│  ├─ cosmosClient.ts     #   Cosmos client + getContainer()
│  ├─ eventHubClient.ts   #   Event Hub producer
│  ├─ youtubeClient.ts    #   YouTube Data API URL builder
│  ├─ visionClient.ts     #   Azure AI Vision
│  ├─ languageClient.ts   #   Azure AI Language
│  └─ geminiClient.ts     #   Gemini model factory (thin)
├─ db/
│  └─ repositories.ts     # Schema map: binds each container to its Zod schema
├─ services/              # Business logic / orchestration
│  ├─ cosmoRepoService.ts #   generic validated repository factory (+ queryProjection)
│  ├─ channelService.ts   #   register channel, subscription, channel clickbait rollup
│  ├─ ingestionService.ts #   publish to Event Hub
│  ├─ videoService.ts     #   YouTube metadata + comments + recent uploads
│  ├─ transcriptService.ts#   Python transcript scraper bridge
│  ├─ visionService.ts    #   thumbnail OCR/tags/objects
│  ├─ geminiService.ts    #   generateScore() + image part (timeout/parse around Gemini)
│  ├─ clickbaitService.ts #   packaging pillar (heuristic + multimodal Gemini)
│  ├─ mismatchService.ts  #   promise–payoff pillar (Azure key phrases → Gemini)
│  ├─ sentimentService.ts #   Azure AI Language sentiment + opinion mining
│  └─ enrichmentService.ts#   orchestrates all pillars → insights block
├─ functions/             # Azure Functions entry points (triggers only)
│  ├─ registerChannel.ts  #   POST /api/channels
│  ├─ youtubeWebhook.ts   #   GET/POST /api/webhook/youtube
│  └─ processVideoIngestion.ts # EventHubTrigger (skips Shorts; updates channel rollup)
└─ scripts/
   ├─ backfill.ts         # seed recent uploads of tracked channels through the hub
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
  "clickbait": {               // rollup over the channel's analyzed videos (see below)
    "propensity_percentage": 29,
    "likelihood": "Less Likely",
    "flagged_pct": 0.0,        // fraction of videos scoring >= 60%
    "video_count": 12,
    "avg_betrayal_rate": 0.03,
    "trend": "rising | falling | stable",
    "updated_at": "ISO"
  },
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
    "title": "...", "description": "...", "channelTitle": "...",
    "thumbnailUrl": "...", "videoUrl": "...",
    "duration": "PT10M30S",
    "transcript_status": "success | failed_retryable | manual_override",
    "transcript": [{ "text": "...", "start": 0.0, "duration": 1.2 }]
  },
  "insights": {
    "thumbnail":  { "ocr_text": ["..."], "tags": ["..."], "objects": ["..."] },
    "clickbait":  {                          // v2 multi-pillar model
      "packaging": {                         // pillar 1 — title/desc/thumbnail bait
        "heuristic_score": 0.73, "llm_score": 0.40,
        "llm_source": "gemini-2.5-flash",    // or "heuristic_fallback"
        "score": 0.50                        // 0.3*heuristic + 0.7*llm
      },
      "mismatch": {                          // pillar 2 — promise vs payoff
        "available": true,                   // false when no transcript
        "score": 0.0,                        // 0..1, higher = bigger gap
        "source": "gemini"                   // | "lexical_fallback" | "unavailable"
      },
      "betrayal": {                          // pillar 3 — comments crying clickbait
        "score": 0.0, "betrayal_rate": 0.0,
        "flagged_count": 0, "total_comments": 200
      },
      "clickbait_percentage": 29,            // 0..100 weighted blend
      "likelihood": "Less Likely",           // 5-level label
      "weights": { "packaging": 0.4, "mismatch": 0.4, "betrayal": 0.2 }
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
      "opinions": [{ "target": "thumbnail", "sentiment": "Negative" }],  // opinion mining
      "timestamp": "ISO" }
  ],
  "timeline": [
    { "timestamp": "ISO", "views": 12345, "likes": 890, "comments": 120,
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

### Clickbait model — v2 (3 pillars → percentage)
Clickbait = a gap between the **promise** (title + thumbnail) and the **payoff**
(content + audience reaction). The score is a weighted blend of three pillars, each
0–1, producing a `clickbait_percentage` (0–100) and a 5-level `likelihood`.

**Pillar 1 — Packaging** (`clickbaitService.ts` + `domain/clickbait.ts`), weight `0.4`.
Heuristic + Gemini on the same evidence (title, description, tags, objects, OCR overlays):
- *Heuristic (rule-based):* overlay presence, ALL-CAPS ratio, hits against the
  **sensational-word list** (`data/clickbait-words.txt`), punctuation intensity — each
  capped. Single words match on token boundaries; phrases match as substrings.
- *Gemini (multimodal):* the thumbnail **image** is sent alongside the text; strict
  JSON, `temperature: 0`.
- Merged: `score = 0.3·heuristic + 0.7·llm`.

**Pillar 2 — Promise–payoff mismatch** (`mismatchService.ts`), weight `0.4`.
The transcript is condensed two ways — Azure **Extractive Summarization** (salient
sentences across the whole video) **and** **Key Phrase Extraction** (topics from
windows sampled end-to-end) — plus a head excerpt, then a small **Gemini judge** rates
whether the content delivers the title/thumbnail promise (`0` = delivers, `1` = pure
bait). `available: false` when there's no transcript, and its weight is redistributed.

**Pillar 3 — Audience betrayal** (`domain/clickbait.ts`), weight `0.2`.
Fraction of comments signalling betrayal — the **betrayal-phrase list**
(`data/betrayal-phrases.txt`: `clickbait`, `lied`, `where is the`, …) plus **Azure
Opinion Mining** (a negative aspect-opinion whose target is packaging:
`thumbnail`/`title`/`intro`). Scaled so a 20% betrayal rate saturates the pillar.

> The word/phrase lists are **data files** under `src/data/` loaded at startup
> (`domain/lexicons.ts`) — grow them to industrial size without code changes; a missing
> file falls back to a small built-in default. Override the directory with `LEXICON_DIR`.

The blend → `clickbait_percentage` → `likelihood`: `<20` Least · `20–40` Less ·
`40–60` Normal · `60–80` Highly · `80–100` Most Likely.

**Channel rollup** (`channelService.updateChannelClickbait`): a **recency-weighted
mean** of the channel's video percentages (newer uploads weigh more), plus `% flagged`
(videos ≥ 60%), `avg_betrayal_rate`, and a `trend` (newer half vs older half, needs
≥ 4 videos). Recomputed once per ingestion batch via a projected query and stored on
the `Channels` doc.

> Transcript-sentiment and comment-sentiment are computed and stored for the dashboard
> but are **not** part of the clickbait score — they measure mood, not deception.

### Sentiment (`sentimentService.ts`)
Azure AI Language. The **transcript hook** (first 15s) gets a single-doc call; the
**comments** are batched (10 docs/request, ≤5000 chars each) with results aligned back
to input order. Each comment keeps its `confidence` scores; `comment_sentiment`
aggregates counts, distribution, and the mean confidence (overall = argmax of means).
The comment call also enables **Opinion Mining** (`includeOpinionMining`) — same call,
no extra cost — surfacing aspect-level opinions (`target` + sentiment) per comment.
Negative opinions about packaging targets (thumbnail/title/intro) feed the betrayal pillar.

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
| Video is a Short (< `MIN_VIDEO_SECONDS_THRESHOLD`) | skipped entirely — not enriched, not persisted |
| Vision down | empty OCR/tags/objects; packaging still scores on title/description |
| Gemini down (packaging) | `packaging.llm_source = heuristic_fallback`; packaging = heuristic only |
| Gemini down (mismatch) | `mismatch.source = lexical_fallback` (title-word presence in transcript) |
| Language down | comments keep `Neutral`; opinion-mining betrayal signal lost (lexicon still works) |
| Cosmos doc fails schema (drift) | logged with field paths, treated as "not found"; doc rebuilt |

Re-running extraction for a video **merges** with the existing document (preserves prior
transcript/comments if the new run came up empty) rather than overwriting.

### Fallbacks & their weaknesses

Every external dependency has a fallback so the pipeline never blocks — but each
degraded path trades away accuracy. Know what you lose:

| Fallback | When it fires | What you lose / weakness |
|---|---|---|
| Vision `Read`-only (drop Tags/Objects) | region error on the full feature set | no visual concept tags/objects for the packaging scorers — they lean on OCR + title |
| Vision fully empty | Vision down entirely | heuristic loses its overlay signal; Gemini still sees the raw image |
| Packaging → heuristic | Gemini 503/timeout/no key | rule-based only: misses nuanced bait, can't read the image, can't tell *sensational-but-honest* from *deceptive* |
| Thumbnail image omitted | image fetch 404 (e.g. maxres fallback) | Gemini judges packaging from text only — no shocked faces / arrows / red-circle cues |
| Mismatch → lexical overlap | Gemini down for the judge | pure word-presence: blind to synonyms/paraphrase; a title word appearing once ≠ promise delivered; noisy on terse titles |
| Mismatch → unavailable | no transcript at all | the *defining* clickbait signal is missing; index rests on packaging (promise only) + betrayal (lagging) |
| Summary dropped (key phrases only) | Extractive Summarization fails / region-gated | judge loses narrative sentences, keeps topic key phrases — coarser sense of *what actually happens* |
| Key phrases → excerpt only | Azure key-phrase call fails | Gemini sees just the first ~1500 chars → can't judge whether a *buried* payoff is delivered |
| Cross-video sampling (10 windows) | transcript > ~50k chars | gaps between sampled windows — very long videos aren't read in full, only spanned |
| Lexicon → built-in default | a `data/*.txt` file can't be read | falls back to a tiny hardcoded list → far fewer sensational/betrayal terms detected |
| Comment sentiment → `Neutral` | Language down | `comment_sentiment` flatlines and the opinion-mining half of betrayal is lost (lexicon half survives) |
| Comments → `[]` | comments disabled | betrayal pillar = 0 (no signal, not "innocent"); index leans on packaging + mismatch |
| Channel `trend` = `stable` | < 4 analyzed videos | trend can't be computed; propensity from few videos is noisy |
| Schema-drift doc dropped | Cosmos doc fails validation | treated as not-found and rebuilt — prior fields absent from the new run are lost |

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

### Seeding data (backfill)
Videos only enter the system via the **webhook** (new uploads) — there is no
"add a video" endpoint; a channel must be registered first. To get historical data
for testing, the backfill script pushes the N most recent uploads of every tracked
channel through the same ingestion hub the webhook uses:

```bash
bun run src/scripts/backfill.ts            # 3 recent uploads per channel (default)
bun run src/scripts/backfill.ts 5          # 5 each
bun run src/scripts/backfill.ts 3 UCxxxx   # only this channel id
```

It reads `local.settings.json` directly (the Functions host need not be running) and
publishes `source: "backfill"` ingestion messages, which the Event Hub trigger
processes exactly like a webhook upload (so Shorts among them are still skipped).

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
| `MIN_VIDEO_SECONDS_THRESHOLD` | `60` — videos shorter than this are treated as Shorts and skipped entirely |
| `LEXICON_DIR` | unset → `src/data` — directory holding the clickbait/betrayal/stopword `.txt` files |

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
| — | Backfill script + extended data (likes/comments/duration) + Shorts filter | ✅ Done |
| 8 | Clickbait model v2 (packaging + mismatch + betrayal → percentage; channel rollup; opinion mining) | ✅ Done |
| 5 | Time-series tracking (daily timer) | ⏭ Next |
| 6 | Dashboard write-back endpoints (refresh / transcript override) | ⬜ Planned |
| 7 | React dashboard frontend | ⬜ Planned |

---

## Further reading

Clickbait detection research and YouTube ranking signals that inform the v2 model:

- [ThumbnailTruth — Multi-Modal LLM detection of misleading YouTube thumbnails (arXiv 2025)](https://arxiv.org/html/2509.04714v1)
- [BaitRadar — Multi-model clickbait detection using title, thumbnail, transcript, comments, tags, stats (arXiv)](https://arxiv.org/html/2505.17448v1)
- [Multimodal Clickbait Detection by De-confounding Biases via Causal Inference (arXiv)](https://arxiv.org/html/2410.07673v1)
- [YouTube Ranking Factors 2026 — "Quality CTR" & retention](https://rankxdigital.com/blog/youtube-ranking-factors/)
- [YouTube Satisfaction Signals — dismissive comments as a suppression signal](https://marketingagent.blog/2025/11/04/youtubes-recommendation-algorithm-satisfaction-signals-what-you-can-control/)
