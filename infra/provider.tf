# Provider + backend initialization.
#
# State: LOCAL (terraform.tfstate on disk, git-ignored). To move to a remote
# Azure Storage backend later, add a `backend "azurerm" { ... }` block here and
# run `terraform init -migrate-state`.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  # azurerm v4 requires an explicit subscription id (or ARM_SUBSCRIPTION_ID env var).
  subscription_id = var.subscription_id

  features {
    key_vault {
      # Non-prod convenience: let `terraform destroy` fully remove the vault.
      # For production, set both to false so deleted secrets are recoverable.
      purge_soft_delete_on_destroy    = true
      recover_soft_deleted_key_vaults = true
    }
  }
}

# The identity running Terraform — used to grant it write access to Key Vault
# and to stamp the Key Vault tenant.
data "azurerm_client_config" "current" {}
