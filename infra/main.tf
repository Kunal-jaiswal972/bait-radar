# Core infrastructure: resource group, data + messaging, the two Function Apps
# (via the reusable module), and the Static Web App.
# Key Vault + secrets live in keyvault.tf; APIM lives in apim.tf.

resource "azurerm_resource_group" "this" {
  name     = var.resource_group_name
  location = var.location
  tags     = local.tags
}

# Storage account for both Function Apps' AzureWebJobsStorage (shared; each app
# gets a distinct host id + content share so they don't collide).
resource "azurerm_storage_account" "this" {
  name                     = local.storage_name
  resource_group_name      = azurerm_resource_group.this.name
  location                 = azurerm_resource_group.this.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
  tags                     = local.tags
}

# ── Azure AI Language (provisioned fresh) ────────────────────────────────────
# Comment/transcript sentiment, opinion mining, key phrases, summarization.
# Key → Key Vault, endpoint → app settings. (Thumbnail analysis is handled by the
# multimodal Gemini call, so no separate Azure Vision account is needed.)
resource "azurerm_cognitive_account" "language" {
  name                  = local.language_name
  resource_group_name   = azurerm_resource_group.this.name
  location              = var.ai_services_location
  kind                  = "TextAnalytics"
  sku_name              = var.language_sku
  custom_subdomain_name = local.language_name
  tags                  = local.tags
}

# ── Cosmos DB (serverless) ───────────────────────────────────────────────────
resource "azurerm_cosmosdb_account" "this" {
  name                = local.cosmos_name
  resource_group_name = azurerm_resource_group.this.name
  location            = var.cosmos_location # US — Students sub can't provision Cosmos in Central India
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  capabilities {
    name = "EnableServerless"
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = var.cosmos_location
    failover_priority = 0
  }

  tags = local.tags
}

resource "azurerm_cosmosdb_sql_database" "this" {
  name                = var.cosmos_database
  resource_group_name = azurerm_cosmosdb_account.this.resource_group_name
  account_name        = azurerm_cosmosdb_account.this.name
}

resource "azurerm_cosmosdb_sql_container" "channels" {
  name                  = "Channels"
  resource_group_name   = azurerm_cosmosdb_account.this.resource_group_name
  account_name          = azurerm_cosmosdb_account.this.name
  database_name         = azurerm_cosmosdb_sql_database.this.name
  partition_key_paths   = ["/channelId"]
  partition_key_version = 2
}

resource "azurerm_cosmosdb_sql_container" "video_insights" {
  name                  = "VideoInsights"
  resource_group_name   = azurerm_cosmosdb_account.this.resource_group_name
  account_name          = azurerm_cosmosdb_account.this.name
  database_name         = azurerm_cosmosdb_sql_database.this.name
  partition_key_paths   = ["/channelId"]
  partition_key_version = 2
}

# ── Processing queues ────────────────────────────────────────────────────────
# Storage Queues on the shared account (replaces the always-on Event Hub namespace
# — queues have no fixed hourly cost). Both publishers and triggers use the
# AzureWebJobsStorage connection the Function App already has. The video stage and
# the comment stage each get their own queue so they scale + retry independently.
resource "azurerm_storage_queue" "ingestion" {
  name               = var.ingestion_queue_name
  storage_account_id = azurerm_storage_account.this.id
}

resource "azurerm_storage_queue" "comments" {
  name               = var.comment_queue_name
  storage_account_id = azurerm_storage_account.this.id
}

# ── Function Apps ────────────────────────────────────────────────────────────
module "node_app" {
  source = "./modules/function_app"

  name                = local.node_app_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  tags                = local.tags

  storage_account_name       = azurerm_storage_account.this.name
  storage_account_access_key = azurerm_storage_account.this.primary_access_key

  runtime         = "node"
  runtime_version = "22"

  app_settings = {
    FUNCTIONS_WORKER_RUNTIME       = "node"
    SCM_DO_BUILD_DURING_DEPLOYMENT = "false" # deploy.sh ships pre-built dist/ + node_modules
    ENABLE_ORYX_BUILD              = "false"
    AzureFunctionsWebHost__hostId  = substr("${local.compact}appapi", 0, 32)

    # Non-secret config
    COSMOS_DATABASE             = var.cosmos_database
    INGESTION_QUEUE_NAME        = var.ingestion_queue_name
    COMMENT_QUEUE_NAME          = var.comment_queue_name
    MIN_VIDEO_SECONDS_THRESHOLD = tostring(var.min_video_seconds_threshold)
    PUBSUBHUBBUB_HUB_URL        = var.pubsubhubbub_hub_url
    PUBSUBHUBBUB_LEASE_SECONDS  = tostring(var.pubsubhubbub_lease_seconds)
    PUBSUBHUBBUB_CALLBACK_URL   = local.webhook_callback_url
    LANGUAGE_ENDPOINT           = azurerm_cognitive_account.language.endpoint
    TRANSCRIPT_FUNCTION_URL     = local.python_transcript_url

    # Secrets via Key Vault references (identity granted read access in keyvault.tf).
    COSMOS_CONNECTION_STRING  = local.kv_ref["cosmos-connection-string"]
    YOUTUBE_API_KEY           = local.kv_ref["youtube-api-key"]
    GEMINI_API_KEY            = local.kv_ref["gemini-api-key"]
    LANGUAGE_KEY              = local.kv_ref["language-key"]
    PUBSUBHUBBUB_VERIFY_TOKEN = local.kv_ref["pubsubhubbub-verify-token"]
    TRANSCRIPT_FUNCTION_KEY   = local.kv_ref["transcript-function-key"]
  }
}

module "python_app" {
  source = "./modules/function_app"

  name                = local.python_app_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  tags                = local.tags

  storage_account_name       = azurerm_storage_account.this.name
  storage_account_access_key = azurerm_storage_account.this.primary_access_key

  runtime         = "python"
  runtime_version = "3.11"

  app_settings = {
    FUNCTIONS_WORKER_RUNTIME       = "python"
    SCM_DO_BUILD_DURING_DEPLOYMENT = "true" # remote Oryx pip install from requirements.txt
    ENABLE_ORYX_BUILD              = "true"
    AzureFunctionsWebHost__hostId  = substr("${local.compact}transcriptapi", 0, 32)
  }
}

# ── Static Web App (the web/ SPA) ────────────────────────────────────────────
resource "azurerm_static_web_app" "this" {
  name                = local.swa_name
  resource_group_name = azurerm_resource_group.this.name
  location            = var.static_web_app_location
  sku_tier            = "Free"
  sku_size            = "Free"
  tags                = local.tags
}
