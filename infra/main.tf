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

# ── Azure AI services (provisioned fresh) ────────────────────────────────────
# Two separate accounts; one shared region. Keys → Key Vault, endpoints → app settings.
resource "azurerm_cognitive_account" "vision" {
  name                  = local.vision_name
  resource_group_name   = azurerm_resource_group.this.name
  location              = var.ai_services_location
  kind                  = "ComputerVision"
  sku_name              = var.vision_sku
  custom_subdomain_name = local.vision_name # resource-specific endpoint for Image Analysis 4.0
  tags                  = local.tags
}

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

# ── Event Hubs ───────────────────────────────────────────────────────────────
resource "azurerm_eventhub_namespace" "this" {
  name                = local.ehns_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = "Basic"
  capacity            = 1
  tags                = local.tags
}

resource "azurerm_eventhub" "this" {
  name              = var.eventhub_name
  namespace_id      = azurerm_eventhub_namespace.this.id
  partition_count   = 2
  message_retention = 1
}

# Send+Listen rule (least privilege — no Manage). Its connection string is what
# both the producer and the trigger binding use.
resource "azurerm_eventhub_namespace_authorization_rule" "app" {
  name                = "app-send-listen"
  namespace_name      = azurerm_eventhub_namespace.this.name
  resource_group_name = azurerm_resource_group.this.name
  listen              = true
  send                = true
  manage              = false
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
    EVENTHUB_NAME               = var.eventhub_name
    GEMINI_MODEL                = var.gemini_model
    MIN_VIDEO_SECONDS_THRESHOLD = tostring(var.min_video_seconds_threshold)
    PUBSUBHUBBUB_HUB_URL        = var.pubsubhubbub_hub_url
    PUBSUBHUBBUB_LEASE_SECONDS  = tostring(var.pubsubhubbub_lease_seconds)
    PUBSUBHUBBUB_CALLBACK_URL   = local.webhook_callback_url
    VISION_ENDPOINT             = azurerm_cognitive_account.vision.endpoint
    LANGUAGE_ENDPOINT           = azurerm_cognitive_account.language.endpoint
    TRANSCRIPT_FUNCTION_URL     = local.python_transcript_url

    # Secrets via Key Vault references (identity granted read access in keyvault.tf).
    COSMOS_CONNECTION_STRING   = local.kv_ref["cosmos-connection-string"]
    EVENTHUB_CONNECTION_STRING = local.kv_ref["eventhub-connection-string"]
    EventHubConnection         = local.kv_ref["eventhub-connection-string"]
    YOUTUBE_API_KEY            = local.kv_ref["youtube-api-key"]
    GEMINI_API_KEY             = local.kv_ref["gemini-api-key"]
    VISION_KEY                 = local.kv_ref["vision-key"]
    LANGUAGE_KEY               = local.kv_ref["language-key"]
    PUBSUBHUBBUB_VERIFY_TOKEN  = local.kv_ref["pubsubhubbub-verify-token"]
    TRANSCRIPT_FUNCTION_KEY    = local.kv_ref["transcript-function-key"]
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
