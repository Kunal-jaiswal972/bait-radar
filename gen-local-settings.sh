#!/usr/bin/env bash
#
# gen-local-settings.sh — generate local.settings.json for both apps from the
# DEPLOYED Key Vault, so local dev uses the same secrets as Azure without
# hand-maintaining them. The generated files are git-ignored.
#
# Config discovery: prefers **Terraform outputs** (fully dynamic — names, DB,
# endpoints all read from state), and falls back to **az discovery** if terraform
# isn't on PATH (e.g. a shell opened before it was installed). Either way secret
# VALUES come from Key Vault (KV *references* only resolve on the Azure platform,
# not under a local `func start`).
#
# Prereqs: `az login` as an identity with Key Vault get access on the vault.
# (Terraform is optional here — if missing, az discovery is used.)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RG="${RESOURCE_GROUP:-BaitRadar}"
TF="terraform -chdir=$ROOT/infra"

command -v az >/dev/null || { echo "az CLI not found" >&2; exit 1; }
az account show >/dev/null 2>&1 || { echo "Run 'az login' first (see DEPLOYMENT.md §1)" >&2; exit 1; }

# Prefer Terraform outputs (dynamic); fall back to az discovery if terraform is
# unavailable or its state isn't readable.
# az/terraform output on Windows carries a trailing CR (\r) that corrupts values
# (breaks the vault-name lookup and injects CRs into the JSON). Strip CR/LF.
clean() { tr -d '\r\n'; }

if command -v terraform >/dev/null 2>&1 && $TF output -raw key_vault_name >/dev/null 2>&1; then
  echo "config source: terraform outputs"
  KV=$($TF output -raw key_vault_name | clean)
  COSMOS_DB=$($TF output -raw cosmos_database | clean)
  EVENTHUB_NAME=$($TF output -raw eventhub_name | clean)
  VISION_ENDPOINT=$($TF output -raw vision_endpoint | clean)
  LANGUAGE_ENDPOINT=$($TF output -raw language_endpoint | clean)
else
  echo "config source: az discovery (terraform not on PATH — see DEPLOYMENT.md if you'd prefer it)"
  KV=$(az keyvault list -g "$RG" --query "[0].name" -o tsv | clean)
  VISION_ENDPOINT=$(az cognitiveservices account list -g "$RG" --query "[?kind=='ComputerVision'].properties.endpoint | [0]" -o tsv | clean)
  LANGUAGE_ENDPOINT=$(az cognitiveservices account list -g "$RG" --query "[?kind=='TextAnalytics'].properties.endpoint | [0]" -o tsv | clean)
  COSMOS_DB="ytanalytics" # infra defaults
  EVENTHUB_NAME="video-ingestion-hub"
fi

[ -n "$KV" ] || { echo "Could not resolve the Key Vault name" >&2; exit 1; }

# Read a secret from Key Vault, stripping the Windows trailing CR.
kv() { az keyvault secret show --vault-name "$KV" --name "$1" --query value -o tsv 2>/dev/null | clean; }

STORAGE_CONN=$(kv storage-connection-string)
COSMOS_CONN=$(kv cosmos-connection-string)
EH_CONN=$(kv eventhub-connection-string)
YOUTUBE=$(kv youtube-api-key)
GEMINI=$(kv gemini-api-key)
VISION=$(kv vision-key)
LANGUAGE=$(kv language-key)
VERIFY=$(kv pubsubhubbub-verify-token)

# ── root local.settings.json (Node app) ─────────────────────────────────────
cat <<JSON | tr -d '\r' > "$ROOT/local.settings.json"
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "$STORAGE_CONN",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "COSMOS_CONNECTION_STRING": "$COSMOS_CONN",
    "COSMOS_DATABASE": "$COSMOS_DB",
    "EVENTHUB_CONNECTION_STRING": "$EH_CONN",
    "EVENTHUB_NAME": "$EVENTHUB_NAME",
    "EventHubConnection": "$EH_CONN",
    "YOUTUBE_API_KEY": "$YOUTUBE",
    "GEMINI_API_KEY": "$GEMINI",
    "VISION_ENDPOINT": "$VISION_ENDPOINT",
    "VISION_KEY": "$VISION",
    "LANGUAGE_ENDPOINT": "$LANGUAGE_ENDPOINT",
    "LANGUAGE_KEY": "$LANGUAGE",
    "PUBSUBHUBBUB_VERIFY_TOKEN": "$VERIFY",
    "TRANSCRIPT_FUNCTION_URL": "http://localhost:7072/api/transcript",
    "MIN_VIDEO_SECONDS_THRESHOLD": "60"
  },
  "Host": { "CORS": "*" }
}
JSON
echo "wrote local.settings.json (Node) from Key Vault '$KV'"

# ── transcript-service/local.settings.json (Python app) ──────────────────────
cat <<'JSON' | tr -d '\r' > "$ROOT/transcript-service/local.settings.json"
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "python"
  }
}
JSON
echo "wrote transcript-service/local.settings.json (Python)"

echo "Done. Start locally: (1) cd transcript-service && func start --port 7072  (2) bun run start  (3) cd web && bun run dev"
