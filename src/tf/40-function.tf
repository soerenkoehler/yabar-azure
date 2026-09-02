# --------------------------------------------------------------------------
# App Insights
# --------------------------------------------------------------------------

resource "azurerm_log_analytics_workspace" "logAnalyticsWorkspace" {
  name                = local.base_name
  resource_group_name = data.azurerm_resource_group.yabar.name
  location            = data.azurerm_resource_group.yabar.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_application_insights" "appInsights" {
  name                = local.base_name
  resource_group_name = data.azurerm_resource_group.yabar.name
  location            = data.azurerm_resource_group.yabar.location
  application_type    = "web"
  workspace_id        = azurerm_log_analytics_workspace.logAnalyticsWorkspace.id
}

# --------------------------------------------------------------------------
# Function App
# --------------------------------------------------------------------------

resource "azurerm_service_plan" "backend" {
  name                   = var.project_prefix
  resource_group_name    = data.azurerm_resource_group.yabar.name
  location               = data.azurerm_resource_group.yabar.location
  sku_name               = "FC1"
  os_type                = "Linux"
  zone_balancing_enabled = false
}

locals {
  blobStorageAndContainer = "${azurerm_storage_account.yabar.primary_blob_endpoint}${azurerm_storage_container.backendDeployment.name}"
}

resource "azurerm_function_app_flex_consumption" "backend" {
  name                        = local.base_name
  resource_group_name         = data.azurerm_resource_group.yabar.name
  location                    = data.azurerm_resource_group.yabar.location
  service_plan_id             = azurerm_service_plan.backend.id
  storage_container_type      = "blobContainer"
  storage_container_endpoint  = local.blobStorageAndContainer
  storage_authentication_type = "SystemAssignedIdentity"
  runtime_name                = "node"
  runtime_version             = "24"
  maximum_instance_count      = 1
  instance_memory_in_mb       = 512

  identity {
    type = "SystemAssigned"
  }

  site_config {
    cors {
      allowed_origins = [
        "https://${azurerm_static_web_app.swa.default_host_name}"
      ]
      support_credentials = false
    }
    application_insights_connection_string = azurerm_application_insights.appInsights.connection_string
  }

  app_settings = {
    "AzureWebJobsStorage"              = ""
    "AzureWebJobsStorage__accountName" = azurerm_storage_account.yabar.name
    "TableConnectionString"            = azurerm_storage_account.yabar.primary_table_endpoint
    "BlobConnectionString"             = azurerm_storage_account.yabar.primary_blob_endpoint
  }

  lifecycle {
    ignore_changes = [
      app_settings["AzureWebJobsStorage"],
      site_config[0].cors[0].allowed_origins,
      tags["hidden-link: /app-insights-resource-id"],
    ]
  }
}

# --------------------------------------------------------------------------
# Role Assignment
# --------------------------------------------------------------------------

resource "azurerm_role_assignment" "backend_blob_contributor" {
  scope                = azurerm_storage_account.yabar.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_function_app_flex_consumption.backend.identity.0.principal_id
  principal_type       = "ServicePrincipal"
}

# Role for table data access (managed identity)
resource "azurerm_role_assignment" "backend_table_data_contributor" {
  scope                = azurerm_storage_account.yabar.id
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = azurerm_function_app_flex_consumption.backend.identity.0.principal_id
  principal_type       = "ServicePrincipal"
}

# --------------------------------------------------------------------------
# Outputs
# --------------------------------------------------------------------------

output "backend_function_name" {
  value = azurerm_function_app_flex_consumption.backend.name
}

output "backend_hostname" {
  value = azurerm_function_app_flex_consumption.backend.default_hostname
}
