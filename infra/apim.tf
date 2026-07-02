# API Management (Consumption) — the single public front door for the Node app.
# The Python transcript app is internal and deliberately NOT exposed here.

resource "azurerm_api_management" "this" {
  name                = local.apim_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  publisher_name      = var.apim_publisher_name
  publisher_email     = var.apim_publisher_email
  sku_name            = "Consumption_0"
  tags                = local.tags
}

# All Node HTTP functions are anonymous, so APIM just forwards to the app's /api
# base. service_url is built from the (deterministic) app name to avoid an
# APIM ⇄ Function App dependency cycle.
resource "azurerm_api_management_api" "dashboard" {
  name                  = "baitradar-api"
  resource_group_name   = azurerm_resource_group.this.name
  api_management_name   = azurerm_api_management.this.name
  revision              = "1"
  display_name          = "BaitRadar API"
  path                  = "api"
  protocols             = ["https"]
  service_url           = "https://${local.node_default_hostname}/api"
  subscription_required = false # public read API + WebSub webhook (hub can't send keys)
}

locals {
  # Explicit operation surface (kept DRY via for_each). Every entry carries the
  # same shape (params = [] when none) so the object unifies to a single type.
  apim_operations = {
    register-channel      = { method = "POST", url = "/channels", params = [] }
    webhook-verify        = { method = "GET", url = "/webhook/youtube", params = [] }
    webhook-notify        = { method = "POST", url = "/webhook/youtube", params = [] }
    dashboard-channels    = { method = "GET", url = "/dashboard/channels", params = [] }
    dashboard-videos      = { method = "GET", url = "/dashboard/videos", params = [] }
    dashboard-chan-videos = { method = "GET", url = "/dashboard/channels/{channelId}/videos", params = ["channelId"] }
    dashboard-video       = { method = "GET", url = "/dashboard/videos/{videoId}", params = ["videoId"] }
  }
}

resource "azurerm_api_management_api_operation" "ops" {
  for_each = local.apim_operations

  operation_id        = each.key
  api_name            = azurerm_api_management_api.dashboard.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  display_name        = each.key
  method              = each.value.method
  url_template        = each.value.url

  dynamic "template_parameter" {
    for_each = each.value.params
    content {
      name     = template_parameter.value
      type     = "string"
      required = true
    }
  }

  response {
    status_code = 200
  }
}

# API-level policy: CORS for the SPA. (rate-limit-by-key is omitted — it isn't
# supported on the APIM Consumption tier; add it if you move to a paid tier.)
resource "azurerm_api_management_api_policy" "dashboard" {
  api_name            = azurerm_api_management_api.dashboard.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name

  xml_content = <<-XML
    <policies>
      <inbound>
        <base />
        <cors allow-credentials="false">
          <allowed-origins>
            <origin>https://${azurerm_static_web_app.this.default_host_name}</origin>
            <origin>http://localhost:5173</origin>
          </allowed-origins>
          <allowed-methods>
            <method>GET</method>
            <method>POST</method>
            <method>OPTIONS</method>
          </allowed-methods>
          <allowed-headers>
            <header>*</header>
          </allowed-headers>
        </cors>
      </inbound>
      <backend><base /></backend>
      <outbound><base /></outbound>
      <on-error><base /></on-error>
    </policies>
  XML
}
