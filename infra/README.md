# Infrastructure (Terraform)

Modular Terraform for the BaitRadar pipeline on Azure. One resource group
(`BaitRadar`) holds everything; local dev and prod share it.

## What it provisions

| Resource | Notes |
|---|---|
| Resource Group `BaitRadar` | single RG for all infra |
| Log Analytics + App Insights (×2) | one workspace, one App Insights per app |
| Cosmos DB (serverless) | `ytanalytics` → `Channels`, `VideoInsights` (PK `/channelId`) |
| Event Hubs (Basic) | `video-ingestion-hub` + a send/listen auth rule |
| **Node** Function App | Linux, Node 20, Consumption — the public app |
| **Python** Function App | Linux, 3.11, Consumption — internal transcript API |
| API Management (Consumption) | public front door for the Node app only |
| Static Web App (Free) | hosts the `web/` SPA |
| Key Vault | holds all secrets; apps read via Key Vault references |

Not provisioned (reused / external): the existing **Storage account**
(referenced via data source for `AzureWebJobsStorage`), and your **Azure AI
Vision/Language** + **Gemini**/**YouTube** keys (ingested into Key Vault).

## Files

```
provider.tf              providers + local state
variables.tf             public vars + sensitive (Key Vault) vars
locals.tf                naming + tags + random suffix
main.tf                  RG, observability, Cosmos, Event Hubs, Function Apps, SWA
keyvault.tf              Key Vault, access policies, secrets, KV-reference map
apim.tf                  APIM, API, operations, CORS + rate-limit policy
outputs.tf               endpoints + values for the deploy/local scripts
modules/function_app/    reusable Linux Consumption function app (used ×2)
secret.tfvars.example    → copy to secret.tfvars (git-ignored)
terraform.tfvars.example → copy to terraform.tfvars
```

## Usage

```bash
cd infra
cp secret.tfvars.example    secret.tfvars      # fill in the 5 secrets
cp terraform.tfvars.example terraform.tfvars   # subscription_id, storage RG, endpoints…

terraform init
terraform plan  -var-file="secret.tfvars"
terraform apply -var-file="secret.tfvars"
```

Or run the full provision-and-deploy from the repo root: `bash deploy.sh`.

## Secret flow

1. You put secrets in `secret.tfvars` (git-ignored).
2. Terraform writes each into **Key Vault**.
3. The Node app's App Settings reference them as
   `@Microsoft.KeyVault(SecretUri=…)`; its managed identity has *Get/List* on the
   vault. No secret values live in App Settings or source control.
4. `TRANSCRIPT_FUNCTION_KEY` is seeded as a placeholder (the Python function key
   only exists after code deploy) and set for real by `deploy.sh`.

## Local development from Key Vault

`bash gen-local-settings.sh` (repo root) reads the deployed Key Vault + outputs
and writes both `local.settings.json` files with resolved values (KV *references*
don't resolve under a local `func start`). Local `TRANSCRIPT_FUNCTION_URL` points
at `http://localhost:7072`.

## Notes

- **State is local** (`terraform.tfstate`, git-ignored) and contains secrets.
  Move to a remote `azurerm` backend for team use.
- Key Vault has `purge_protection_enabled = false` for easy teardown — set it
  `true` for real production.
```
