# Naming + tagging conventions, and the derived cross-service settings.

locals {
  base    = var.name_prefix              # e.g. baitradar
  compact = replace(local.base, "-", "") # for names that forbid hyphens

  # Resource names — hostnames are constructed from these (not from resource
  # attributes) so APIM ⇄ Function App references don't form a dependency cycle.
  node_app_name   = "${local.base}-app-api"
  python_app_name = "${local.base}-transcript-api"
  apim_name       = "${local.base}-apim"
  kv_name         = "${local.base}-kv-972" # globally unique (plain baitradar-kv was taken); 972 matches your naming
  cosmos_name     = "${local.base}-cosmos-db"
  ehns_name       = "${local.base}-eventhub"
  swa_name        = "${local.base}-web-app"
  storage_name    = "${local.compact}storage" # ≤24, lowercase, no hyphens
  vision_name     = "${local.base}-vision"
  language_name   = "${local.base}-language"

  # Deterministic public hostnames (Azure public cloud).
  node_default_hostname = "${local.node_app_name}.azurewebsites.net"
  python_transcript_url = "https://${local.python_app_name}.azurewebsites.net/api/transcript"
  apim_gateway_url      = "https://${local.apim_name}.azure-api.net"
  webhook_callback_url  = "${local.apim_gateway_url}/api/webhook/youtube"

  tags = merge({
    project     = "baitradar"
    environment = var.environment
    managed_by  = "terraform"
  }, var.extra_tags)
}
