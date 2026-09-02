# --------------------------------------------------------------------------
# Storage account
# --------------------------------------------------------------------------

resource "azurerm_storage_account" "yabar" {
  name                = local.storage_name
  resource_group_name = data.azurerm_resource_group.yabar.name
  location            = data.azurerm_resource_group.yabar.location

  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"

  min_tls_version = "TLS1_2"

  shared_access_key_enabled       = false
  allow_nested_items_to_be_public = false
  public_network_access_enabled   = true
  default_to_oauth_authentication = true
}

# --------------------------------------------------------------------------
# Message Storage Table
# --------------------------------------------------------------------------
resource "azapi_resource" "messages" {
  type      = "Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01"
  name      = "messages"
  parent_id = "${azurerm_storage_account.yabar.id}/tableServices/default"
  body      = {}
}

# --------------------------------------------------------------------------
# App Data Blob Container + Seed Blobs
# --------------------------------------------------------------------------

resource "azurerm_storage_container" "appData" {
  name                  = "appdata"
  storage_account_id    = azurerm_storage_account.yabar.id
  container_access_type = "private"
}

resource "azurerm_storage_blob" "config" {
  name                 = "config"
  storage_container_id = azurerm_storage_container.appData.id
  type                 = "Block"
  content_type         = "application/json"

  source_content = <<-EOT
    {
      "auth_google_client_id": "${var.auth_google_client_id}",
      "expiration_options": [
        {
            "value": "PT5M",
            "label": "5min",
            "allowOneClick": true
        },
        {
            "value": "PT15M",
            "label": "15min",
            "allowOneClick": false
        },
        {
            "value": "PT1H",
            "label": "1 Hour",
            "allowOneClick": false
        },
        {
            "value": "P1D",
            "label": "1 Day",
            "allowOneClick": false
        },
        {
            "value": "P1W",
            "label": "1 Week",
            "allowOneClick": false
        }
      ]
    }
  EOT

  lifecycle {
    ignore_changes = [
      source_content,
      content_md5,
    ]
  }
}

resource "azurerm_storage_blob" "users" {
  name                 = "users"
  storage_container_id = azurerm_storage_container.appData.id
  type                 = "Block"
  content_type         = "application/json"

  source_content = <<-EOT
    {
      "test-user@example.com": ["admin", "write"]
    }
  EOT

  lifecycle {
    ignore_changes = [
      source_content,
      content_md5,
    ]
  }
}

# --------------------------------------------------------------------------
# Function App Deployment Container
# --------------------------------------------------------------------------

resource "azurerm_storage_container" "backendDeployment" {
  name                  = "deploymentpackage"
  storage_account_id    = azurerm_storage_account.yabar.id
  container_access_type = "private"
}
