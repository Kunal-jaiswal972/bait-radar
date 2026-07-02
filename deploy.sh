#!/usr/bin/env bash
#
# deploy.sh — provision infra with Terraform, then build + deploy all code.
#
# Sequence:
#   1. terraform init / plan / apply           (infra/)
#   2. Node Function App   — npm install, build, prune dev deps, func publish
#   3. Python Function App — func publish (remote pip build from requirements.txt)
#   4. Wire the Python function key into Key Vault, restart the Node app
#   5. Web SPA             — npm install, build against APIM, deploy to Static Web Apps
#
# Prereqs: az login (correct subscription), terraform, func core tools v4, node/npm.
# Deps are NOT committed — this script installs them fresh at deploy time.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA="$ROOT/infra"
TF="terraform -chdir=$INFRA"

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Preconditions ────────────────────────────────────────────────────────────
command -v terraform >/dev/null || die "terraform not found"
command -v func       >/dev/null || die "Azure Functions Core Tools (func) not found"
command -v az         >/dev/null || die "Azure CLI (az) not found"
command -v npm        >/dev/null || die "npm not found"
az account show >/dev/null 2>&1  || die "Not logged in — run 'az login' and select the subscription"
[ -f "$INFRA/secret.tfvars" ]    || die "Missing infra/secret.tfvars (copy secret.tfvars.example)"
[ -f "$INFRA/terraform.tfvars" ] || die "Missing infra/terraform.tfvars (copy terraform.tfvars.example)"

# ── 1. Provision infrastructure ──────────────────────────────────────────────
log "Terraform init / plan / apply"
$TF init -input=false
$TF plan  -input=false -var-file="secret.tfvars" -out=tfplan
$TF apply -input=false tfplan

# Read outputs
RG=$($TF output -raw resource_group_name)
NODE_APP=$($TF output -raw node_function_app_name)
PY_APP=$($TF output -raw python_function_app_name)
KV=$($TF output -raw key_vault_name)
API_BASE=$($TF output -raw api_base_url)
SWA_TOKEN=$($TF output -raw static_web_app_api_key)
SWA_URL=$($TF output -raw static_web_app_url)

# ── 2. Node Function App ─────────────────────────────────────────────────────
log "Node app: install deps, build, prune, publish → $NODE_APP"
cd "$ROOT"
npm install                       # full deps (tsc/rimraf needed to build)
npm run build                     # rimraf dist && tsc  → dist/
npm prune --omit=dev              # ship production deps only
func azure functionapp publish "$NODE_APP" --javascript
npm install                       # restore dev deps for local work

# ── 3. Python transcript app (remote pip build) ─────────────────────────────
log "Python transcript app: publish (remote build) → $PY_APP"
cd "$ROOT/transcript-service"
func azure functionapp publish "$PY_APP"
cd "$ROOT"

# ── 4. Wire the transcript function key into Key Vault ───────────────────────
log "Fetching transcript function key → Key Vault, restarting Node app"
TRANSCRIPT_KEY=$(az functionapp function keys list \
  --resource-group "$RG" --name "$PY_APP" --function-name transcript \
  --query default -o tsv)
[ -n "$TRANSCRIPT_KEY" ] || die "Could not read the transcript function key"
az keyvault secret set --vault-name "$KV" \
  --name transcript-function-key --value "$TRANSCRIPT_KEY" --output none
# Restart so the Node app re-resolves the updated Key Vault reference.
az functionapp restart --resource-group "$RG" --name "$NODE_APP" --output none

# ── 5. Web SPA → Static Web Apps ─────────────────────────────────────────────
log "Web SPA: build against $API_BASE, deploy to Static Web Apps"
cd "$ROOT/web"
export VITE_API_BASE_URL="$API_BASE"
npm install
npm run build
npx --yes @azure/static-web-apps-cli deploy ./dist \
  --deployment-token "$SWA_TOKEN" --env production
cd "$ROOT"

# ── Done ─────────────────────────────────────────────────────────────────────
log "Deployment complete"
cat <<SUMMARY

  Web (SPA):     $SWA_URL
  API (APIM):    $API_BASE
  Webhook:       $($TF output -raw webhook_callback_url)
  Node app:      $($TF output -raw node_function_app_url)
  Transcript:    $($TF output -raw transcript_function_url)  (internal)

Next: register a channel via POST $API_BASE/channels and confirm it verifies.
SUMMARY
