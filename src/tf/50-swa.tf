# --------------------------------------------------------------------------
# Static Web App (Free tier)
# --------------------------------------------------------------------------

resource "azurerm_static_web_app" "swa" {
  name                = var.project_prefix
  resource_group_name = data.azurerm_resource_group.yabar.name
  location            = data.azurerm_resource_group.yabar.location

  sku_tier = "Free"
  sku_size = "Free"

  app_settings = {
    "backend_hostname": "https://${local.base_name}.azurewebsites.net"
  }

  lifecycle {
    ignore_changes = [
      app_settings["backend_hostname"],
    ]
  }
}

# --------------------------------------------------------------------------
# Outputs
# --------------------------------------------------------------------------

output "swa_hostname" {
  value = azurerm_static_web_app.swa.default_host_name
}

output "swa_deployment_token" {
  value     = azurerm_static_web_app.swa.api_key
  sensitive = true
}
