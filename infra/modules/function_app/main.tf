# A Linux Consumption Function App with its own service plan and a system-assigned
# managed identity. Storage is passed in (shared) rather than provisioned here.
# No Application Insights — kept intentionally minimal.

terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
  }
}

resource "azurerm_service_plan" "this" {
  name                = "${var.name}-plan"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = "Y1" # Consumption
  tags                = var.tags
}

resource "azurerm_linux_function_app" "this" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.this.id

  storage_account_name       = var.storage_account_name
  storage_account_access_key = var.storage_account_access_key

  https_only                    = true
  functions_extension_version   = "~4"
  public_network_access_enabled = true

  site_config {
    application_stack {
      # Exactly one of these is non-null for a given runtime.
      node_version   = var.runtime == "node" ? var.runtime_version : null
      python_version = var.runtime == "python" ? var.runtime_version : null
    }
  }

  app_settings = var.app_settings

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags

  lifecycle {
    # func/CLI deployment toggles this content share setting; don't fight it.
    ignore_changes = [app_settings["WEBSITE_CONTENTSHARE"]]
  }
}
