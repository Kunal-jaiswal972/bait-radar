# BaitRadar — Plan (remaining work)

## What it is

A serverless, event-driven pipeline on **Azure Functions** that watches YouTube
channels, ingests each new upload (metadata / comments / transcript), runs **AI
clickbait + sentiment analysis** (Azure Vision + Gemini + Azure Language),
persists insights to **Cosmos DB**, tracks engagement over time, and serves it to
a **React SPA**. Deployed as Terraform in `infra/` to the `BaitRadar` resource
group; a Node Function App (public via APIM) + an internal Python transcript app.

> Architecture, data model, the 3-pillar clickbait model, and deploy steps are
> documented in [`README.md`](README.md) and [`DEPLOYMENT.md`](DEPLOYMENT.md).
> Shipped: ingestion pipeline, clickbait v2, dashboard + read API, full Azure
> deployment, and the hourly time-series tracker.

## Remaining work

### Transcripts in production
YouTube blocks the transcript scraper from Azure datacenter IPs
(`RequestBlocked`), so in prod the transcript + promise–payoff-mismatch pillar are
`unavailable` (the pipeline degrades gracefully; everything else works). To enable:
- **Residential proxy** (recommended) — `youtube-transcript-api` native proxy
  config (e.g. Webshare); add a `TRANSCRIPT_PROXY` setting to the Python app.
- **or PoToken via BotGuard** (`bgutils-js` in a Node path) — what free transcript
  sites do; fragile, needs upkeep, may still be IP-flagged.
- **or audio → Azure AI Speech (Whisper).** Download the video, strip audio and run
  speech-to-text instead of scraping captions. Sidesteps the caption endpoint, but
  the audio pull (yt-dlp) hits the *same* YouTube IP block from Azure and adds
  STT cost + latency — so it still needs a proxy to fetch the audio.
- **YouTube Data API captions — not an option.** `captions.download` only works for
  videos **you own** (creator OAuth); it can't fetch third-party channels' captions.

Bottom line: a **residential proxy is the only low-maintenance fix**. Transcripts
work fine locally (residential IP).


### Optional polish
- **APIM rate-limiting** — omitted (unsupported on the Consumption tier); add if
  moving to a paid APIM tier.
