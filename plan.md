# YouTube Analytics Pipeline — Implementation Plan

> **Status:** DRAFT FOR REVIEW. Nothing is implemented yet. We build phase-by-phase, each phase reviewed and approved before the next begins.

## 1. Goal

A serverless, event-driven pipeline that ingests YouTube channel uploads via webhook, extracts metadata/comments/transcripts, runs AI clickbait + sentiment analysis, persists to Cosmos DB, tracks engagement velocity over time, and exposes the data to a React dashboard with write-back actions.

## 2. Architecture at a Glance

```
                                    ┌─────────────────────────────────┐
   YouTube PubSubHubbub ──webhook──▶│  APIM (public front door)       │
                                    └───────────────┬─────────────────┘
                                                    │
        ┌───────────────────────────┬───────────────┼──────────────────────────┐
        ▼                           ▼               ▼                          ▼
  POST /channels            /webhook/youtube   /dashboard/.../refresh    /dashboard/.../transcript
  (HTTP fn)                 (HTTP fn)          (HTTP fn)                  (HTTP fn)
        │                           │
        │ save + subscribe          │ publish {videoId, channelId}
        ▼                           ▼
   Cosmos:Channels         Event Hub: video-ingestion-hub
                                    │
                                    ▼
                          EventHubTrigger: Extraction Worker ──┐
                          (YouTube Data API + Python transcript)│
                                                                ▼
                                                       AI Processing Layer
                                             (Vision + Gemini + AI Language)
                                                                ▼
                                                     Cosmos: VideoInsights (upsert)
                                                                ▲
                          TimerTrigger (daily 23:30 IST) ───────┘  (append timeline + new comments)

                          Cosmos: VideoInsights ──read──▶ Dashboard API (HTTP fns) ──▶ React SPA
```

## 3. Tech Stack (locked)

| Concern | Choice |
|---|---|
| Compute | Azure Functions v4, **Node.js v4 programming model** (TypeScript) |
| Runtime / pkg mgr | **Bun** (execution + deps) |
| API Gateway | Azure API Management (APIM) |
| Message broker | Azure Event Hubs (`video-ingestion-hub`) |
| Database | Azure Cosmos DB (NoSQL) — `Channels`, `VideoInsights` containers |
| Vision | Azure AI Vision (OCR + tags) |
| LLM | Gemini Flash API (sole provider — no Azure OpenAI) |
| NLP | Azure AI Language (sentiment) |
| Transcripts | Python `youtube-transcript-api` via `child_process.spawn()` |
| Frontend | React + Vite + TypeScript SPA (consumes the dashboard API) |
| OUT OF SCOPE | FFmpeg / video frame extraction / blob / S3 |

## 4. Target File Structure

```
yt-data-analyzer/
├─ src/
│  ├─ functions/
│  │  ├─ channelManagement.ts        # POST /api/channels
│  │  ├─ webhookYoutube.ts           # GET+POST /api/webhook/youtube
│  │  ├─ extractionWorker.ts         # EventHubTrigger: video-ingestion-hub
│  │  ├─ timeSeriesTracker.ts        # TimerTrigger daily
│  │  ├─ dashboardRefresh.ts         # POST /api/dashboard/videos/{id}/refresh
│  │  └─ dashboardTranscript.ts      # POST /api/dashboard/videos/{id}/transcript
│  ├─ utils/
│  │  ├─ cosmos.ts                   # Cosmos client + container helpers
│  │  ├─ eventhub.ts                 # Event Hub producer
│  │  ├─ youtube.ts                  # YouTube Data API v3 wrapper
│  │  ├─ pubsubhubbub.ts             # subscription + Atom XML parse
│  │  ├─ vision.ts                   # Azure AI Vision wrapper
│  │  ├─ language.ts                 # Azure AI Language wrapper
│  │  ├─ llm.ts                      # Gemini → AOAI fallback orchestration
│  │  ├─ clickbait.ts                # heuristic + merge scoring
│  │  ├─ transcript.ts               # spawn() wrapper for Python
│  │  └─ types.ts                    # shared TS interfaces (VideoInsights schema)
│  └─ scripts/
│     ├─ fetch_transcript.py
│     └─ requirements.txt
├─ host.json
├─ local.settings.json               # template only (secrets gitignored)
├─ package.json
├─ tsconfig.json
└─ plan.md
```

---

# Phases

Each phase lists **deliverables**, **commands**, and **acceptance criteria**. Original tasks map to phases as noted.

## Phase 0 — Scaffold & Shared Foundations
*(Prereq for everything; not in original task list but required.)*

**Deliverables**
- `func init --worker-runtime typescript --model v4` project scaffold.
- `package.json` wired for Bun; `tsconfig.json`; `host.json` (extension bundle for Event Hubs + Cosmos + Timer).
- `local.settings.json` **template** with every env var placeholder used across all phases (Cosmos conn, Event Hub conn, YouTube API key, Gemini key, AOAI endpoint/key, Vision endpoint/key, Language endpoint/key, PubSubHubbub callback URL).
- `src/utils/types.ts` — TypeScript interfaces for the full `VideoInsights` schema (Task 4) and `Channel` doc. Defined up front so all phases share one contract.
- `src/utils/cosmos.ts` — singleton Cosmos client, `getContainer(name)` helper, container bootstrap.

**Commands**
- `bun add @azure/cosmos @azure/event-hubs`
- `bun add -d @types/node typescript`
- Bun + `func` toolchain notes.

**Acceptance:** `bun run build` compiles; `func start` boots locally with no functions failing to load.

---

## Phase 1 — Channel Management & Webhook Ingestion *(Task 1)*

**Deliverables**
- `channelManagement.ts` — `POST /api/channels`: accept channel URL **or** ID, normalize to channelId, upsert to `Channels` container, fire PubSubHubbub subscribe request.
- `webhookYoutube.ts`:
  - `GET` → echo `hub.challenge` (verification handshake).
  - `POST` → parse Atom XML, extract `videoId` + `channelId`, publish to `video-ingestion-hub`, return **202** immediately.
- `src/utils/pubsubhubbub.ts` — subscribe helper + Atom XML parser.
- `src/utils/eventhub.ts` — Event Hub producer client.
- APIM routing config (inbound policy / operation mapping) for the two routes.

**Commands**
- `bun add xml2js` (Atom parse) + `bun add -d @types/xml2js`

**Acceptance:** GET challenge returns the raw challenge string; POST publishes a message visible on the hub and returns 202; channel doc lands in Cosmos.

---

## Phase 2 — Data Extraction Worker *(Task 2)*

**Deliverables**
- `extractionWorker.ts` — `EventHubTrigger` on `video-ingestion-hub`.
  - YouTube Data API v3: `videos` (Title, Description, maxresdefault thumbnail, video URL, PublishedAt, ViewCount) + `commentThreads` (top 100 comments: text + author).
  - Resilience: partial-failure rule — **never discard successfully fetched data**; on transcript/comment failure set `transcript_status = failed_retryable` and proceed; catch proxy/timeout errors.
- `src/utils/youtube.ts` — Data API wrapper.
- `src/utils/transcript.ts` — `child_process.spawn()` wrapper invoking Python.
- `src/scripts/fetch_transcript.py` — `youtube-transcript-api`, emits JSON `{text,start,duration}[]`.
- `src/scripts/requirements.txt` — isolated `.venv`.

**Commands**
- `bun add googleapis` (or lightweight `axios` calls — decide at impl)
- `python -m venv .venv` → `pip install youtube-transcript-api` (captured in requirements.txt)

**Acceptance:** A hub message produces a raw extracted record (in memory / staged) with metadata + comments + transcript or a `failed_retryable` status; no crash on transcript failure.

---

## Phase 3 — AI Processing Layer *(Task 3)*

**Deliverables**
- `src/utils/vision.ts` — thumbnail OCR + tagging.
- `src/utils/clickbait.ts` — `heuristic_score` (text overlays, ALL CAPS, absolute words), and merge: `weighted_score` (heuristic 30% / LLM 70%) + `max_score` (max).
- `src/utils/llm.ts` — Gemini Flash with a strict clickbait system prompt. **No Azure OpenAI fallback** (removed per decision). On Gemini failure/timeout, degrade gracefully: set `llm_score` to the heuristic score and flag the degradation, so scoring never blocks the pipeline.
- `src/utils/language.ts` — Azure AI Language sentiment for hook (first 15s of transcript) and batch comment sentiment mapped onto each comment object.
- Integrate all into `extractionWorker.ts` insights pipeline.

**Commands**
- `bun add @azure-rest/ai-vision-image-analysis @azure/ai-language-text @google/generative-ai`

**Acceptance:** Given a video record, produces the clickbait block, thumbnail OCR/tags/objects, transcript-hook sentiment, and per-comment sentiment; a Gemini outage transparently degrades to the heuristic score.

---

## Phase 4 — Persistence to Cosmos DB *(Task 4)*

**Deliverables**
- Upsert combined payload into `VideoInsights` (partition key decision: `/channelId`) using the **strict schema** (id=videoId, metadata, insights, comments[], timeline[]).
- Wire `cosmos.ts` upsert into the end of `extractionWorker.ts`.

**Acceptance:** A full run from hub message → Cosmos doc matching the schema exactly; re-runs upsert (no duplicates).

---

## Phase 5 — Time-Series Tracking *(Task 5)*

**Deliverables**
- `timeSeriesTracker.ts` — `TimerTrigger`, cron `0 0 18 * * *` (23:30 IST).
  - Query videos published in last 48h.
  - Ping YouTube API for latest `viewCount` + new comments → AI Language sentiment.
  - Append new comments to root `comments` (dedupe by comment ID); append new stats to `timeline`.

**Acceptance:** Timer run appends a new `timeline` entry and any net-new comments without duplicating existing ones.

---

## Phase 6 — Dashboard API Endpoints *(Task 6)*

**Deliverables**
- `dashboardRefresh.ts` — `POST /api/dashboard/videos/{videoId}/refresh`: re-run extraction + AI on demand (bypass cron). Likely republishes to hub or calls shared extraction routine.
- `dashboardTranscript.ts` — `POST /api/dashboard/videos/{videoId}/transcript`: accept raw text, set `transcript_status = manual_override`, persist.
- APIM operations for both routes.

**Acceptance:** Refresh re-populates a doc; transcript override replaces transcript and flips status.

---

## Phase 7 — React Dashboard Frontend *(Task 7)*

> Scope placeholder — kept intentionally light now; we expand the detailed spec when we reach this phase.

**Deliverables**
- Read-only **dashboard API** (HTTP functions) the SPA calls — separate from the write-back endpoints in Phase 6:
  - `GET /api/dashboard/channels` — list channels with rollups.
  - `GET /api/dashboard/channels/{channelId}/videos` — videos for a channel.
  - `GET /api/dashboard/videos/{videoId}` — full insights for one video.
- **React + Vite + TypeScript SPA** in a separate `web/` workspace, consuming those endpoints (typed client, ideally sharing the Zod schemas from `src/types`).
- Three views, mirroring the data model:
  - **Channel List** — table + aggregate sentiment / total views / engagement trend.
  - **Videos** — thumbnail gallery (title, publish date, clickbait `verdict` + `max_score`), drill-through to a video.
  - **Individual Video** — view-count timeline, sentiment donut, comments table, transcript view.
- **Write-back actions** wired to the Phase 6 endpoints: a *Refresh* button → `POST /refresh`, and a *Transcript upload* form → `POST /transcript`.
- CORS + routing via APIM; SPA hosted on Azure Static Web Apps (or served statically).

**Commands**
- `bun create vite web --template react-ts` (or equivalent) inside the repo.

**Acceptance:** The SPA lists channels, drills into a video's insights, and both write-back actions succeed against the deployed API.

---

## 5. Cross-Cutting Decisions to Confirm During Review

1. **Cosmos partition key** — proposing `/channelId` for `VideoInsights`. Confirm.
2. **YouTube client** — `googleapis` SDK vs raw `axios` REST calls.
3. **Refresh mechanism (Phase 6)** — republish to Event Hub (reuses worker, async) vs synchronous shared extraction function (immediate response). Proposing republish for consistency.
4. **Secrets** — all via `local.settings.json` locally → App Settings / Key Vault in Azure. No secrets committed.
5. **Bun + Azure Functions** — Bun for local dev/build/deps; Azure Functions host runs Node at runtime. Confirm acceptable.

## 6. Suggested Build Order

`Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7`

Phases 2–4 are tightly coupled (extraction → AI → persist) and may be reviewed together if you prefer larger increments. Phases 1, 5, 6 are independent slices. Phase 7 is pure documentation.
