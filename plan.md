# YouTube Analytics Pipeline — Implementation Plan

> **Status:** Pipeline (Phases 0–4, 8 + tooling) shipped and verified live. Current work: the React dashboard + read-only API (Phase 7). Deployment and the daily timer (Phase 5) follow.

## 1. Goal

A serverless, event-driven pipeline that ingests YouTube channel uploads via webhook, extracts metadata/comments/transcripts, runs AI clickbait + sentiment analysis, persists to Cosmos DB, tracks engagement over time, and exposes the data to a React dashboard.

## 2. Architecture at a Glance

```
                                    ┌─────────────────────────────────┐
   YouTube PubSubHubbub ──webhook──▶│  APIM (public front door)       │
                                    └───────────────┬─────────────────┘
                                                    │
        ┌───────────────────────────┬───────────────┼──────────────────────────┐
        ▼                           ▼               ▼                          ▼
  POST /channels            /webhook/youtube   GET /dashboard/*           (write-back, later)
  (HTTP fn)                 (HTTP fn)          (read-only HTTP fns)
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
                          TimerTrigger (daily 23:30 IST) ───────┘  (append timeline + new comments) [Phase 5, later]

                          Cosmos ──read──▶ Dashboard API (GET HTTP fns) ──▶ React SPA (web/)
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
| NLP | Azure AI Language (sentiment, opinion mining, summarization, key phrases) |
| Transcripts | Python `youtube-transcript-api` via `child_process.spawn()` |
| Frontend | React + Vite + TS SPA (`web/`), neobrutalism UI, **TanStack Query**, Recharts |
| OUT OF SCOPE | FFmpeg / video frame extraction / blob / S3 |

## 4. Backend Layout (as built)

```
src/
├─ config/        env.ts (validated env, loaded once)
├─ types/         zod schemas + inferred types (common, channel, video, insights, ingestion, dashboard)
├─ domain/        pure modules (clickbait, lexicons, atom, dashboardMappers) — no framework/IO
├─ clients/       cosmosClient, youtubeClient, geminiClient (SDK/transport only)
├─ db/            repositories.ts (container ↔ schema map)
├─ services/      business workflows (channel, video, transcript, sentiment, vision,
│                 clickbait, mismatch, gemini, enrichment, cosmoRepo, dashboard)
├─ functions/     thin controllers, grouped by surface:
│                 apis/ (registerChannel) · webhook/ (youtubeWebhook) ·
│                 dashboard/ (dashboardApi) · triggers/ (processVideoIngestion)
├─ data/          editable lexicon .txt files
└─ scripts/       fetch_transcript.py, backfill.ts
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

### Dashboard exposure (internal vs. user-facing)
The dashboard API returns a **user-facing projection** — it hides model internals (`heuristic_score`, `llm_score`, `llm_source`, effective `weights`) and surfaces only the three pillar scores. Mismatch and betrayal carry an **info tooltip** explaining what each measures (and mismatch flags when it's unavailable for want of a transcript).

### What we cannot measure
Watch-time / audience retention / "Quality CTR" — the signal YouTube itself uses to throttle clickbait — requires creator OAuth (YouTube Analytics API) and is **out of scope**. The UI states plainly: *"this index estimates clickbait from public packaging, content, and audience reaction; it does not include watch-time, which only the creator can authorize."*

---

# Phases

## ✅ Done — Pipeline (Phases 0–4, 8 + tooling)

- **Phase 0 — Scaffold & foundations.** Functions v4 + Bun, `host.json`, validated `config/env.ts`, Zod type contracts, Cosmos client.
- **Phase 1 — Channel management & webhook.** `registerChannel` (`POST /api/channels` → resolve id, upsert, PubSubHubbub subscribe), `youtubeWebhook` (GET challenge, POST Atom → publish to hub).
- **Phase 2 — Extraction worker.** `processVideoIngestion` (EventHubTrigger, batch ≤ 20): YouTube Data API metadata + stats + duration, up to 200 newest comments, Python transcript; partial-failure-safe.
- **Phase 3 — AI processing.** Vision (OCR/tags/objects), Gemini packaging, Azure Language sentiment + opinion mining; each degrades independently.
- **Phase 4 — Persistence.** Strict-schema upsert to `VideoInsights` (partition `/channelId`); re-runs merge, never discard.
- **Phase 8 — Clickbait model v2** (see §4b): three-pillar index, channel rollup, 5-level likelihood. Verified live against MrBeast under Gemini 503s (graceful fallback).
- **Tooling.** `scripts/backfill.ts` (seed N recent uploads via the hub), Shorts filter (`MIN_VIDEO_SECONDS_THRESHOLD`, default 60), editable `src/data/*.txt` lexicons loaded by `domain/lexicons.ts`.

---

## ▶ Phase 7 — React Dashboard + Read-only API *(current)*

A neobrutalism React SPA already scaffolded in `web/` (pages, charts, neobrutalism components). This phase replaces its mock data with a real API and the live data shapes.

**Backend — read-only dashboard API (thin controllers → `dashboardService` → repositories, pure `domain/dashboardMappers`):**
- `GET /api/dashboard/channels` — channel summaries with rollups (propensity, % flagged, trend).
- `GET /api/dashboard/videos` — recent video cards across all channels (`limit`/`offset`, validated).
- `GET /api/dashboard/channels/{channelId}/videos` — video cards for one channel.
- `GET /api/dashboard/videos/{videoId}` — full per-video detail (cross-partition lookup).
- Responses are the **user-facing projection** (model internals stripped — see §4b).

**Frontend:**
- **TanStack Query** for all server state (no server data mirrored into local React state); typed API client + query/mutation hooks; centralized API base URL in config.
- **Channel input bar** = channel link only (URL / `@handle` / id) → `POST /api/channels` via a mutation that invalidates the channel list. Detect & reject video links.
- **Real thumbnails** on video cards (`thumbnailUrl`); **embedded YouTube player** on the video detail page.
- **Pillar breakdown** shows packaging / mismatch / betrayal with **info tooltips**; mismatch shows "unavailable" when there's no transcript. Internal sub-scores are never displayed.
- Charts (Recharts, already scaffolded): channel propensity comparison, engagement velocity (timeline), comment-sentiment donut, pillar meters.
- **Watch-time disclaimer** shown plainly (see §4b).
- Loading / empty / error fallbacks for every query; an error boundary around the routes.

**Commands:** `bun add @tanstack/react-query` (in `web/`).

**Acceptance:** SPA lists real tracked channels with propensity, drills into a video's live insights (embedded player, pillar tooltips, sentiment, timeline), and tracking a channel hits the live API and refreshes the list.

---

## ⏭ Deployment *(next, after Phase 7)*

- Deploy the Node Function App (Consumption plan); separate Python Function App for transcripts.
- APIM front door; set `PUBSUBHUBBUB_CALLBACK_URL` to the APIM webhook URL (flips hub status `pending → verified`).
- Host the SPA on Azure Static Web Apps; point `VITE_API_BASE_URL` at APIM.
- Secrets via App Settings / Key Vault — never committed.

## ⏭ Phase 5 — Time-Series Tracking *(later)*

- `timeSeriesTracker.ts` — `TimerTrigger`, cron `0 0 18 * * *` (23:30 IST).
- Query videos published in last 48h; ping YouTube for latest stats + new comments → AI Language sentiment.
- Append new comments to `comments` (dedupe by comment id); append a new `timeline` point.

**Acceptance:** a timer run appends one `timeline` entry and any net-new comments without duplicating existing ones.

## ⏭ Phase 6 — Write-back actions *(later)*

- `POST /api/dashboard/videos/{videoId}/refresh` — re-run extraction + AI on demand (republish to hub).
- `POST /api/dashboard/videos/{videoId}/transcript` — accept raw text, set `transcript_status = manual_override`, persist.

---

## 5. Cross-Cutting Decisions (settled)

1. **Cosmos partition key** — `/channelId` for `VideoInsights`. ✅
2. **YouTube client** — raw REST via `youtubeClient` (no `googleapis` SDK). ✅
3. **Refresh (Phase 6)** — republish to Event Hub (reuses the worker). Proposed.
4. **Secrets** — `local.settings.json` locally → App Settings / Key Vault in Azure. ✅
5. **Bun + Azure Functions** — Bun for local dev/build/deps; the Functions host runs Node at runtime. ✅
