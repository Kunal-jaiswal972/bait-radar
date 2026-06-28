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

## 4b. Clickbait Scoring Model (v2)

The product's core question: **how likely is a channel to post clickbait, and how clickbait is each video?** Clickbait = a gap between the *promise* (title + thumbnail) and the *payoff* (content + audience reaction). v1 scored only the promise; v2 adds the gap and the reaction. Grounded in current research — see the references in the README ([ThumbnailTruth](https://arxiv.org/html/2509.04714v1), [BaitRadar](https://arxiv.org/html/2505.17448v1)) and YouTube's own "Quality CTR" / satisfaction signals.

### Pillars (each a calibrated 0–1 sub-score)

| Pillar | Weight | Source | Fallback |
|---|---|---|---|
| **Packaging bait** (title + desc + thumbnail, merged) | 0.40 | heuristic **and** Gemini, both fed all of it — incl. the thumbnail *image* sent to Gemini (multimodal) | heuristic only when Gemini is down |
| **Promise–payoff mismatch** | 0.40 | Azure **Extractive Summarization** + **Key Phrase Extraction** (windows **sampled across the whole transcript**) + a head excerpt → a small Gemini judge rates "does the content deliver the title/thumbnail's promise?" | **lexical fallback** (fraction of title content-words present in the transcript) when Gemini is down; pillar excluded & weights renormalized if no transcript |
| **Audience betrayal** | 0.20 | **betrayal lexicon** over comments (`clickbait`, `lied`, `where is the`, `nothing happened`, …) **plus Azure Opinion Mining** — negative aspect-opinions whose target is packaging (`thumbnail`/`title`/`intro`) → betrayal rate | lexicon is offline/free; opinion mining rides the same sentiment call |

Transcript sentiment and comment sentiment are **kept and shown on the dashboard** but are **not** part of the bait score — they measure mood, not deception.

### Tooling decisions (locked)
- **Vision retained.** It supplies structured OCR/tags/objects to the heuristic and is the floor when Gemini is unavailable. The thumbnail image is *also* sent to Gemini for richer visual reasoning (faces, arrows, shock emotion). Removing Vision would leave the heuristic blind during a Gemini outage.
- **Gemini minimized.** Used only for (a) packaging reasoning and (b) the mismatch judgment on a *condensed* representation (head excerpt + extractive summary + key phrases) — never on raw transcripts or comments. Both calls are optional with fallbacks, so a Gemini outage degrades but never blocks.
- **Azure Language does the heavy text work.** Extractive Summarization + Key Phrase Extraction (condense the transcript before Gemini), Sentiment + Opinion Mining (comments + hook). No Gemini for comments or transcripts — avoids the unreliable free tier on the high-volume paths.
- **Lexicons are data-driven.** The sensational-word, betrayal-phrase, and stopword lists live in editable `src/data/*.txt` (loaded by `domain/lexicons.ts`), so they grow to industrial size without code changes; single words match on token boundaries, phrases as substrings.
- **Every fallback's accuracy cost is documented** in the README's *Fallbacks & their weaknesses* table.

### Output (implemented)
- **Per video:** `clickbait_percentage` (0–100, rough estimate) + `likelihood` + the three pillar breakdowns, stored in `insights.clickbait`.
- **Per channel:** recency-weighted mean of its videos' percentages, `% flagged`, `avg_betrayal_rate`, and `trend` — stored on the `Channels` doc (`clickbait`), recomputed once per ingestion batch.
- The percentage maps to a **5-level likelihood scale**:

| Percentage | Label |
|---|---|
| 80–100 | Most Likely |
| 60–80 | Highly Likely |
| 40–60 | Normal |
| 20–40 | Less Likely |
| 0–20 | Least Likely |

### What we cannot measure
Watch-time / audience retention / "Quality CTR" — the signal YouTube itself uses to throttle clickbait — requires creator OAuth (YouTube Analytics API) and is **out of scope**. The product must state plainly: *"this index estimates clickbait from public packaging, content, and audience reaction; it does not include watch-time, which only the creator can authorize."* (Tracked as a frontend TODO in Phase 7.)

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
  - YouTube Data API v3: `videos` (Title, Description, maxresdefault thumbnail, video URL, PublishedAt, ViewCount, LikeCount, CommentCount, duration) + `commentThreads` (up to 200 newest comments, paginated: text + author).
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

## Phase 7 — React Dashboard Frontend and apis *(Task 7)*

**Deliverables**
- `dashboardRefresh.ts` — `POST /api/dashboard/videos/{videoId}/refresh`: re-run extraction + AI on demand (bypass cron). Likely republishes to hub or calls shared extraction routine.
- `dashboardTranscript.ts` — `POST /api/dashboard/videos/{videoId}/transcript`: accept raw text, set `transcript_status = manual_override`, persist.
- APIM operations for both routes.

**Acceptance:** Refresh re-populates a doc; transcript override replaces transcript and flips status.

---
- Read-only **dashboard API** (HTTP functions) the SPA calls — separate from the Phase 6 write-back endpoints:
  - `GET /api/dashboard/channels` — list channels with rollups (propensity, % flagged, trend).
  - `GET /api/dashboard/channels/{channelId}/videos` — videos for a channel.
  - `GET /api/dashboard/videos/{videoId}` — full insights for one video.
- **React + Vite + TypeScript SPA** in a separate `web/` workspace, consuming those endpoints (typed client, ideally sharing the Zod schemas from `src/types`).
- **Single input bar:** accepts a **channel link only** (URL / `@handle` / id) → `POST /api/channels`. Videos are *not* added directly — they arrive via the webhook (and the backfill script seeds older ones). Detect & reject video links with a helpful message.
- **Write-back actions** wired to Phase 6: a *Refresh* button → `POST /refresh`, and a *Transcript upload* form → `POST /transcript`.
- **TODO — watch-time disclaimer:** show plainly in the UI that *"this index estimates clickbait from public packaging, content, and audience reaction; it does not include watch-time, which only the creator can authorize."*
- CORS + routing via APIM; SPA hosted on Azure Static Web Apps (or served statically).

**Views & visualizations**

*Channel List / Channel detail:*
| Chart | Data | Why |
|---|---|---|
| Clickbait propensity (big number + 5-level label) | channel aggregate | the product metric |
| Clickbait trend over time (line by publish date) | per-video `clickbait_percentage` | is the channel getting baitier? |
| Index distribution (histogram) | per-video percentage | occasional vs systematic baiter |
| % clickbait videos (donut) | threshold count | one-glance summary |
| **Clickbait vs views (scatter)** | percentage × views | *does baiting actually earn views?* |
| **Clickbait vs betrayal/sentiment (scatter)** | percentage × betrayal rate | *does the audience catch on?* |
| Most-clickbait videos (ranked bar) | per-video percentage | worst offenders → drill-down |
| Upload cadence (calendar heatmap) | `publishedAt` | posting behavior |
| Avg sentiment & engagement-rate KPIs | aggregates (likes/views, comments/views) | channel health |

*Individual Video:*
| Chart | Data | Why |
|---|---|---|
| Clickbait gauge (0–100 + label) | `clickbait_percentage` | headline answer |
| Pillar breakdown (radar / stacked bar) | packaging / mismatch / betrayal | *where* the bait comes from |
| Heuristic vs LLM (paired bars) | packaging sub-scores | model transparency |
| View / like / comment timeline (multi-line) | `timeline` (views, likes, comments) | growth & engagement velocity |
| Sentiment over time (stacked area) | `timeline.aggregate_sentiment` | does mood sour as more watch? |
| Comment sentiment donut | `comment_sentiment` | audience mood |
| Betrayal meter (% "clickbait!" comments) | betrayal rate | the smoking gun |
| Like-to-view ratio (stat) | likes ÷ views | best public proxy for satisfaction |
| Top comments table (sentiment-colored) | `comments` | qualitative drill-down |

**Commands**
- `bun create vite web --template react-ts` (or equivalent) inside the repo.

**Acceptance:** The SPA lists channels with propensity, drills into a video's full insight charts, and both write-back actions succeed against the deployed API.

---

## Phase 8 — Clickbait Model v2 *(see §4b)* — ✅ Done

Implements the multi-factor index; replaced the v1 single clickbait score in `insights`.

**Deliverables (all implemented)**
- **Packaging pillar** — `clickbaitService` + `geminiService` send the thumbnail image to Gemini alongside title/desc/tags/objects/OCR; heuristic runs on the same evidence; merged `score = 0.3·heuristic + 0.7·llm`. Vision stays as OCR/tags/objects provider + fallback.
- **Mismatch pillar** — `mismatchService`: Azure **Extractive Summarization + Key Phrase Extraction** over windows **sampled across the whole transcript** + a head excerpt → small Gemini judge. Fallback: lexical title-word presence (stopword-filtered); `available:false` + weights renormalized when no transcript.
- **Betrayal pillar** — `domain/clickbait.betrayalFromComments`: data-driven lexicon classifier **plus Azure Opinion Mining** (negative aspect-opinions on packaging targets) over the 200 comments → `betrayal_rate`, scaled to a 0–1 score.
- **Aggregation** — `domain/clickbait.ts` computes `clickbait_percentage` (weighted blend, renormalized for missing pillars) + 5-level `likelihood`. **Channel rollup** (`channelService.updateChannelClickbait`, recency-weighted mean + % flagged + trend) recomputed once per batch via a projected query and stored on the `Channels` doc.
- **Schema** — `insights.clickbait` reworked to the pillar breakdown + `clickbait_percentage` + `likelihood` + `weights`; `Channels.clickbait` rollup added; comments carry `opinions`.

**Acceptance (met):** each video gets a `clickbait_percentage` + likelihood from available pillars; a Gemini outage falls back to heuristic packaging + lexical mismatch without blocking (verified live against MrBeast under Gemini 503s); each channel shows a propensity label.

---

## Tooling — Backfill, Shorts filter & extended data (done)

- `src/scripts/backfill.ts` (`bun run src/scripts/backfill.ts [count] [channelId]`) pushes the N most recent uploads of tracked channels (optionally one channel) through the ingestion hub — same path as the webhook. **Videos only ever enter via the webhook or this backfill**; a channel must exist first.
- **Shorts are filtered out entirely** in the worker: videos shorter than `MIN_VIDEO_SECONDS_THRESHOLD` (default 60) are skipped — not enriched, not persisted. Covers webhook and backfill alike.
- Extraction collects `likeCount`, `commentCount`, `duration`, `channelTitle`, and up to **200 newest comments** (paginated); the Event Hub trigger processes in **batches of up to 20** (`host.json`).
- **Lexicons are editable data files** in `src/data/` (`clickbait-words.txt`, `betrayal-phrases.txt`, `stopwords.txt`), loaded once at startup by `domain/lexicons.ts` (override dir via `LEXICON_DIR`); expand them freely without touching code.

---

## 5. Cross-Cutting Decisions to Confirm During Review

1. **Cosmos partition key** — proposing `/channelId` for `VideoInsights`. Confirm.
2. **YouTube client** — `googleapis` SDK vs raw `axios` REST calls.
3. **Refresh mechanism (Phase 6)** — republish to Event Hub (reuses worker, async) vs synchronous shared extraction function (immediate response). Proposing republish for consistency.
4. **Secrets** — all via `local.settings.json` locally → App Settings / Key Vault in Azure. No secrets committed.
5. **Bun + Azure Functions** — Bun for local dev/build/deps; Azure Functions host runs Node at runtime. Confirm acceptable.

## 6. Suggested Build Order

`Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 8 → 7`

(Phase 8 — the v2 clickbait model — comes before the frontend, since the dashboard renders its `clickbait_percentage` + labels.)

Phases 2–4 are tightly coupled (extraction → AI → persist) and may be reviewed together if you prefer larger increments. Phases 1, 5, 6 are independent slices. Phase 7 is pure documentation.
