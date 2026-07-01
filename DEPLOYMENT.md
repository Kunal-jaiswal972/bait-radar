# Deployment — Azure

End-to-end guide to run the pipeline in Azure. Two Function Apps:

- **Node Function App** — all public APIs, the WebSub webhook, and the Event Hub
  ingestion worker. Fronted by **API Management (APIM)**.
- **Python Function App** (`transcript-service/`) — a single HTTP endpoint that
  fetches transcripts with `youtube-transcript-api`. It is an **internal API**:
  only the Node worker calls it (over HTTP + a function key). It is *not* exposed
  through APIM.

The SPA runs on **Azure Static Web Apps**; uploads arrive via **pubsubhubbub**
(WebSub).

> Why a separate Python app? Transcripts can't be fetched from Node — YouTube
> gates the caption/timedtext endpoint behind a session PoToken and returns empty
> bodies server-side (verified). `youtube-transcript-api` handles this reliably,
> and a Function App is single-runtime, so Python transcript logic lives in its
> own app. Both apps can share one resource group / App Service Plan.

```
                           ┌─────────────────────────── Azure ───────────────────────────┐
 YouTube WebSub hub ──POST─┤                                                              │
                           │  APIM gateway ──►  Node Function App                         │
 Browser (SPA) ──────────► │ (one public URL)    ├─ POST /api/channels                    │
   Static Web App          │                     ├─ GET|POST /api/webhook/youtube         │
                           │                     ├─ GET /api/dashboard/*                  │
                           │                     └─ eventHub trigger (worker)             │
                           │                            │            │                    │
                           │      Event Hub ◄───────────┘            │ HTTP + key         │
                           │      (video-ingestion-hub)              ▼ (internal)          │
                           │                            Python Function App               │
                           │      Cosmos DB ◄──── worker upserts     └─ GET /api/transcript │
                           │      (ytanalytics)                         (youtube-transcript-api)
                           └──────────────────────────────────────────────────────────────┘
```

**Request flow:** new upload → YouTube WebSub POSTs `/api/webhook/youtube` (via
APIM) → webhook enqueues to Event Hub → `processVideoIngestion` extracts
metadata/comments, calls the **Python transcript app** over HTTP, enriches, and
upserts to Cosmos → the SPA reads `/api/dashboard/*` (via APIM).

---

## 0. Prerequisites

```bash
az login
az account set --subscription "<SUBSCRIPTION_ID>"

az --version           # Azure CLI
func --version         # Azure Functions Core Tools v4
node --version         # 20.x  (Node app runtime)
python --version       # 3.11  (Python app runtime — Azure supports 3.10/3.11/3.12)
bun --version          # or npm
```

Pick names/vars once:

```bash
RG=ytbait-rg
LOCATION=centralindia
FUNCAPP=ytbait-api                 # Node Function App (globally unique)
PYFUNCAPP=ytbait-transcript        # Python Function App (globally unique)
STORAGE=ytbaitstore$RANDOM         # 3-24 lowercase, globally unique
COSMOS=ytbait-cosmos$RANDOM        # globally unique
EHNS=ytbait-eh$RANDOM              # Event Hub namespace, globally unique
EHNAME=video-ingestion-hub
APIM=ytbait-apim$RANDOM            # globally unique
SWA=ytbait-web

az group create -n $RG -l $LOCATION
```

---

## 1. Data + messaging resources

### Cosmos DB

```bash
az cosmosdb create -n $COSMOS -g $RG --default-consistency-level Session
az cosmosdb sql database create -a $COSMOS -g $RG -n ytanalytics
az cosmosdb sql container create -a $COSMOS -g $RG -d ytanalytics -n Channels --partition-key-path /channelId
az cosmosdb sql container create -a $COSMOS -g $RG -d ytanalytics -n VideoInsights --partition-key-path /channelId

COSMOS_CONN=$(az cosmosdb keys list -n $COSMOS -g $RG --type connection-strings \
  --query "connectionStrings[0].connectionString" -o tsv)
```

> Confirm container names/partition keys against `src/db/repositories.ts`.

### Event Hub + Storage

```bash
az eventhubs namespace create -n $EHNS -g $RG -l $LOCATION --sku Basic
az eventhubs eventhub create -n $EHNAME --namespace-name $EHNS -g $RG \
  --partition-count 2 --message-retention 1
EH_CONN=$(az eventhubs namespace authorization-rule keys list \
  --namespace-name $EHNS -g $RG -n RootManageSharedAccessKey \
  --query primaryConnectionString -o tsv)

az storage account create -n $STORAGE -g $RG -l $LOCATION --sku Standard_LRS
```

---

## 2. Python transcript Function App (internal)

Deploy this first so we have its URL + key to give the Node app. **Linux only**
(Python Functions require Linux).

```bash
az functionapp create -n $PYFUNCAPP -g $RG \
  --storage-account $STORAGE \
  --consumption-plan-location $LOCATION \
  --runtime python --runtime-version 3.11 --functions-version 4 \
  --os-type Linux

cd transcript-service
func azure functionapp publish $PYFUNCAPP          # builds remotely, installs requirements.txt
cd ..
```

Grab the endpoint + function key (the `transcript` function is
`auth_level=FUNCTION`, so the Node app authenticates with this key):

```bash
TRANSCRIPT_URL="https://$PYFUNCAPP.azurewebsites.net/api/transcript"
TRANSCRIPT_KEY=$(az functionapp function keys list -g $RG -n $PYFUNCAPP \
  --function-name transcript --query default -o tsv)

# Smoke-test it directly
curl -s "$TRANSCRIPT_URL?videoId=UF8uR6Z6KLc&code=$TRANSCRIPT_KEY" | head -c 200
# -> {"segments":[{"text":"...","start":7.47,"duration":2.9}, ...]}
```

> Contract: `200` = segments, `404` = permanently unavailable (no captions),
> `503` = transient (retry). The Node client maps these to
> `TranscriptUnavailableError` / `TranscriptFetchError`.

---

## 3. Node Function App

```bash
az functionapp create -n $FUNCAPP -g $RG \
  --storage-account $STORAGE \
  --consumption-plan-location $LOCATION \
  --runtime node --runtime-version 20 --functions-version 4 \
  --os-type Linux
```

### App settings

Maps to `src/config/env.ts` plus the Functions bindings. **Set the Event Hub
connection under _both_ names** — `EVENTHUB_CONNECTION_STRING` (producer SDK) and
`EventHubConnection` (the `eventHub` trigger binding) — and wire the transcript
app from §2:

```bash
az functionapp config appsettings set -n $FUNCAPP -g $RG --settings \
  COSMOS_CONNECTION_STRING="$COSMOS_CONN" \
  COSMOS_DATABASE="ytanalytics" \
  EVENTHUB_CONNECTION_STRING="$EH_CONN" \
  EVENTHUB_NAME="$EHNAME" \
  EventHubConnection="$EH_CONN" \
  YOUTUBE_API_KEY="<YOUTUBE_DATA_API_KEY>" \
  MIN_VIDEO_SECONDS_THRESHOLD="60" \
  TRANSCRIPT_FUNCTION_URL="$TRANSCRIPT_URL" \
  TRANSCRIPT_FUNCTION_KEY="$TRANSCRIPT_KEY"

# Optional AI features (each degrades gracefully if omitted)
az functionapp config appsettings set -n $FUNCAPP -g $RG --settings \
  GEMINI_API_KEY="<...>" GEMINI_MODEL="gemini-2.5-flash" \
  VISION_ENDPOINT="<...>" VISION_KEY="<...>" \
  LANGUAGE_ENDPOINT="<...>" LANGUAGE_KEY="<...>"
```

| Setting | Required | Notes |
|---|---|---|
| `COSMOS_CONNECTION_STRING` | ✅ | |
| `COSMOS_DATABASE` | default `ytanalytics` | |
| `EVENTHUB_CONNECTION_STRING` | ✅ | producer (send) |
| `EVENTHUB_NAME` | default `video-ingestion-hub` | |
| `EventHubConnection` | ✅ | trigger binding (same conn string) |
| `YOUTUBE_API_KEY` | ✅ | YouTube Data API v3 |
| `TRANSCRIPT_FUNCTION_URL` | ✅ | Python app endpoint (from §2) |
| `TRANSCRIPT_FUNCTION_KEY` | ✅ | Python function key (sent as `x-functions-key`) |
| `MIN_VIDEO_SECONDS_THRESHOLD` | default `60` | Shorts skipped below this |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | optional | packaging + mismatch LLM |
| `VISION_ENDPOINT` / `VISION_KEY` | optional | thumbnail OCR/tags |
| `LANGUAGE_ENDPOINT` / `LANGUAGE_KEY` | optional | comment sentiment/opinion mining |
| `PUBSUBHUBBUB_CALLBACK_URL` | set in §6 | the APIM webhook URL |
| `PUBSUBHUBBUB_VERIFY_TOKEN` | optional | shared secret for WebSub verify |
| `LEXICON_DIR` | optional | defaults to bundled lexicons |

> `TRANSCRIPT_FUNCTION_URL` is optional in code — if unset, transcript fetches
> fail as `failed_retryable` (non-fatal; the video still scores on packaging +
> comments). Set it so the mismatch pillar and transcript panel work.

### Deploy

```bash
bun run build
func azure functionapp publish $FUNCAPP --javascript

curl "https://$FUNCAPP.azurewebsites.net/api/dashboard/channels"   # -> [] initially
```

All HTTP functions are `authLevel: anonymous` (APIM does auth/throttling; the
WebSub hub can't send keys).

---

## 4. API Management (fronts the Node app only)

The Python app stays private — do **not** import it into APIM.

```bash
az apim create -n $APIM -g $RG -l $LOCATION \
  --publisher-email "you@example.com" --publisher-name "YT Bait" \
  --sku-name Consumption
```

Import the **Node** Function App: portal → **APIM → APIs → + Add API → Function
App → Browse → `$FUNCAPP`**, set **API URL suffix** = `api`. It imports every
HTTP function with correct routes and wires the function key automatically.

Public base URL: `https://$APIM.azure-api.net/api`

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/channels` | register/track a channel |
| GET, POST | `/api/webhook/youtube` | WebSub verify (GET) + notifications (POST) |
| GET | `/api/dashboard/channels` | channel list |
| GET | `/api/dashboard/videos` | video list |
| GET | `/api/dashboard/channels/{channelId}/videos` | per-channel videos |
| GET | `/api/dashboard/videos/{videoId}` | video detail |

**CORS** (API-level inbound policy) so the SPA can call APIM:

```xml
<cors allow-credentials="false">
  <allowed-origins>
    <origin>https://<SWA>.azurestaticapps.net</origin>
    <origin>http://localhost:5173</origin>
  </allowed-origins>
  <allowed-methods><method>GET</method><method>POST</method><method>OPTIONS</method></allowed-methods>
  <allowed-headers><header>*</header></allowed-headers>
</cors>
```

**Make `webhook/youtube` key-free** (uncheck *Subscription required* on the API
or that operation) — the WebSub hub can't send a subscription key. Optionally
rate-limit `POST /api/channels`.

---

## 5. Web app (Azure Static Web Apps)

The SPA reads `VITE_API_BASE_URL` at build time (defaults to relative `/api`).
Point it at APIM.

```bash
cd web
echo 'VITE_API_BASE_URL=https://<APIM>.azure-api.net/api' > .env.production
bun install && bun run build          # -> web/dist

az staticwebapp create -n $SWA -g $RG -l $LOCATION --sku Free
SWA_TOKEN=$(az staticwebapp secrets list -n $SWA -g $RG --query "properties.apiKey" -o tsv)
npx @azure/static-web-apps-cli deploy ./dist --deployment-token "$SWA_TOKEN" --env production
cd ..
```

SPA-route fallback — `web/staticwebapp.config.json`:

```json
{ "navigationFallback": { "rewrite": "/index.html" } }
```

Ensure `https://<SWA>.azurestaticapps.net` is in the APIM CORS origins (§4).

---

## 6. WebSub (pubsubhubbub) webhook

The callback **must be the APIM URL** (the publicly reachable one):

```bash
az functionapp config appsettings set -n $FUNCAPP -g $RG --settings \
  PUBSUBHUBBUB_CALLBACK_URL="https://$APIM.azure-api.net/api/webhook/youtube" \
  PUBSUBHUBBUB_VERIFY_TOKEN="<random-shared-secret>"
```

1. Register a channel → the app subscribes to its uploads feed with that callback.
2. The hub GETs `/api/webhook/youtube` with a `hub.challenge`; the webhook echoes
   it → status flips **pending → verified**.
3. On each upload the hub POSTs the Atom entry → an ingestion message is enqueued.

```bash
curl -X POST "https://$APIM.azure-api.net/api/channels" \
  -H "Content-Type: application/json" -d '{"channel":"https://www.youtube.com/@MrBeast"}'
curl "https://$APIM.azure-api.net/api/dashboard/channels"   # hubSubscriptionStatus -> "verified"
```

> Stuck on `pending`? The hub can't reach the callback: confirm
> `webhook/youtube` is key-free in APIM (§4), that `PUBSUBHUBBUB_CALLBACK_URL`
> matches the APIM route exactly, and check `func azure functionapp logstream $FUNCAPP`.

---

## 7. Local development

Run **both** hosts; the Node app calls the Python app locally exactly like in Azure.

**Python transcript app** (port 7072):

```bash
cd transcript-service
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Windows; use .venv/bin/pip on macOS/Linux
# create local.settings.json:
#   { "IsEncrypted": false, "Values": { "AzureWebJobsStorage": "", "FUNCTIONS_WORKER_RUNTIME": "python" } }
func start --port 7072
# transcript: [GET,POST] http://localhost:7072/api/transcript
```

**Node app** (port 7071) — add the transcript URL to its `local.settings.json`
(no key needed locally; the local host serves function-auth endpoints without one):

```jsonc
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "COSMOS_CONNECTION_STRING": "...",
    "EVENTHUB_CONNECTION_STRING": "...",
    "EventHubConnection": "...",
    "YOUTUBE_API_KEY": "...",
    "TRANSCRIPT_FUNCTION_URL": "http://localhost:7072/api/transcript"
  }
}
```

```bash
bun run build && func start          # Node host on :7071
# Web: cd web && bun run dev  (Vite proxies /api -> http://localhost:7071)
```

---

## 8. End-to-end smoke test

```bash
open https://$SWA.azurestaticapps.net       # 1. SPA loads
# 2. Track a channel (UI or curl §6) -> "verified"
# 3. Wait for an upload, or run the backfill locally:
COSMOS_CONNECTION_STRING=... EVENTHUB_CONNECTION_STRING=... YOUTUBE_API_KEY=... \
TRANSCRIPT_FUNCTION_URL=... bun run backfill
# 4. A video appears at /videos with bait score, transcript, comments, timeline

func azure functionapp logstream $FUNCAPP    # watch ingestion logs
```

---

## 9. Hardening (optional)

- **Lock the Node app to APIM** (access restriction to APIM's outbound IP);
  keep the webhook reachable only through APIM.
- **Lock the Python app to the Node app** — it's internal; restrict inbound to
  the Node app's outbound IPs, or put both in a VNet (Premium tier) so the
  transcript call never leaves Azure's backbone.
- **Key Vault** for secrets via `@Microsoft.KeyVault(SecretUri=...)` references
  + a managed identity.
- **Application Insights** on both apps for traces/metrics.

---

## Deployment checklist

- [ ] Cosmos DB + `ytanalytics` + `Channels`/`VideoInsights` containers
- [ ] Event Hub namespace + `video-ingestion-hub`; Storage account
- [ ] **Python** app deployed; `GET /api/transcript?videoId=…&code=…` returns segments
- [ ] **Node** app deployed with all settings incl. **both** Event Hub names and `TRANSCRIPT_FUNCTION_URL`/`KEY`
- [ ] `/api/dashboard/channels` returns `[]`
- [ ] APIM fronts the Node app under `/api`; CORS set; `webhook/youtube` key-free; Python app NOT in APIM
- [ ] SPA built with `VITE_API_BASE_URL=<APIM>/api` and deployed to Static Web Apps
- [ ] `PUBSUBHUBBUB_CALLBACK_URL` = APIM webhook URL; a registered channel flips to `verified`
- [ ] End-to-end: upload/backfill → video scored (with transcript) and visible in the SPA
```
