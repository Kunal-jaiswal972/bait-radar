# Endpoints + identifiers consumed by deploy.sh, gen-local-settings.sh, and humans.

output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "location" {
  value = azurerm_resource_group.this.location
}

# ── Function Apps ─────────────────────────────────────────────────────────────
output "node_function_app_name" {
  value = module.node_app.name
}

output "node_function_app_url" {
  value = "https://${module.node_app.default_hostname}"
}

output "python_function_app_name" {
  value = module.python_app.name
}

output "transcript_function_url" {
  value = local.python_transcript_url
}

# ── Public front door + web ──────────────────────────────────────────────────
output "apim_gateway_url" {
  value = azurerm_api_management.this.gateway_url
}

output "api_base_url" {
  description = "Public API base the SPA is built against (VITE_API_BASE_URL)."
  value       = "${azurerm_api_management.this.gateway_url}/api"
}

output "webhook_callback_url" {
  description = "Set as PUBSUBHUBBUB_CALLBACK_URL; the address the WebSub hub calls."
  value       = "${azurerm_api_management.this.gateway_url}/api/webhook/youtube"
}

output "static_web_app_name" {
  value = azurerm_static_web_app.this.name
}

output "static_web_app_url" {
  value = "https://${azurerm_static_web_app.this.default_host_name}"
}

output "static_web_app_api_key" {
  description = "Deployment token for the Static Web App (used by deploy.sh)."
  value       = azurerm_static_web_app.this.api_key
  sensitive   = true
}

# ── Data + secrets (identifiers only; no secret values) ──────────────────────
output "key_vault_name" {
  value = azurerm_key_vault.this.name
}

output "key_vault_uri" {
  value = azurerm_key_vault.this.vault_uri
}

output "cosmos_account_name" {
  value = azurerm_cosmosdb_account.this.name
}

output "cosmos_database" {
  value = var.cosmos_database
}

output "eventhub_name" {
  value = var.eventhub_name
}

output "storage_account_name" {
  value = azurerm_storage_account.this.name
}

output "vision_endpoint" {
  value = azurerm_cognitive_account.vision.endpoint
}

output "language_endpoint" {
  value = azurerm_cognitive_account.language.endpoint
}

