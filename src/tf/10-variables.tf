variable "project_prefix" {
  type=string
}

variable "project_resource_group" {
  type=string
}

variable "auth_google_client_id" {
  type=string
  sensitive = true
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

locals {
  project_name = var.project_prefix
  base_name = "${local.project_name}-${random_string.suffix.result}"
  raw_storage_name = replace("${local.project_name}${random_string.suffix.result}", "/[^a-z0-9]/", "")
  storage_name     = substr(local.raw_storage_name, 0, 24)
}
