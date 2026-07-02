variable "name" {
  type        = string
  description = "Function App name (globally unique)."
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

# Shared, pre-existing storage account used for AzureWebJobsStorage.
variable "storage_account_name" {
  type = string
}

variable "storage_account_access_key" {
  type      = string
  sensitive = true
}

variable "runtime" {
  type        = string
  description = "\"node\" or \"python\"."
  validation {
    condition     = contains(["node", "python"], var.runtime)
    error_message = "runtime must be \"node\" or \"python\"."
  }
}

variable "runtime_version" {
  type        = string
  description = "Language version, e.g. \"20\" (node) or \"3.11\" (python)."
}

variable "app_settings" {
  type        = map(string)
  description = "App settings (plain values + @Microsoft.KeyVault references)."
  default     = {}
}
