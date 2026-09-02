![](artwork/burn-after-reading-small.png)

# YABAR: Yet Another Burn After Reading

YABAR is a tiny secret-sharing tool that runs on Azure.

**Note**: This is the original prototype running on Azure SWA free tier and
Azure Functions flex consumption plan. It is no longer actively developed.

For the currently maintained project see: https://github.com/soerenkoehler/yabar

## Architecture

![](../artwork/architecture.svg)

## Repository Layout

| Path       | Purpose                                        |
|------------|------------------------------------------------|
| `web`      | Azure frontend application                     |
| `frontend` | Azure Static Web Apps frontend config function |
| `backend`  | Azure Functions backend                        |
| `tf`       | Azure OpenTofu/Terraform configuration         |
| `deploy`   | Azure deployment scripts                       |

## GitHub Actions

The Azure deployment workflow is [`.github/workflows/azure.yml`](../.github/workflows/azure.yml).

### Secrets

| Name                    | Description                                           |
|-------------------------|-------------------------------------------------------|
| `AUTH_GOOGLE_CLIENT_ID` | Google Client ID used for the user side OAuth process |
| `AZURE_CLIENT_ID`       | Azure app registration used for the GitHub workflow   |
| `AZURE_SUBSCRIPTION_ID` | Target Azure subscription                             |
| `AZURE_TENANT_ID`       | Target Azure tenant                                   |

### Variables

| Name                      | Description                                         |
|---------------------------|-----------------------------------------------------|
| `PROJECT_PREFIX`          | Short name used for resource names                  |
| `PROJECT_RESOURCE_GROUP`  | Resource group where the app is deployed            |
| `TFSTATE_RESOURCE_GROUP`  | Resource group where the tfstate storage is located |
| `TFSTATE_STORAGE_ACCOUNT` | Storage account holding the tfstate container       |

## Terraform/Tofu

If you don't have one: create a storage account for the tfstate backend.

The Azure OpenTofu/Terraform configuration lives in `tf`.

## Role Assignments

| Principal           | Role                                    | Scope                      |
|---------------------|-----------------------------------------|----------------------------|
| `<AZURE_CLIENT_ID>` | Terraform Resource Provider Registrar   | `<AZURE_SUBSCRIPTION_ID>`  |
| `<AZURE_CLIENT_ID>` | Reader                                  | `<AZURE_SUBSCRIPTION_ID>`  |
| `<AZURE_CLIENT_ID>` | Contributor                             | `<PROJECT_RESOURCE_GROUP>` |
| `<AZURE_CLIENT_ID>` | Role Based Access Control Administrator | `<PROJECT_RESOURCE_GROUP>` |
| `<AZURE_CLIENT_ID>` | Storage Blob Data Contributor           | `<PROJECT_RESOURCE_GROUP>` |

### Role Definition: Terraform Resource Provider Registrar

```json
{
  "id": "/subscriptions/***/providers/Microsoft.Authorization/roleDefinitions/***",
  "properties": {
    "roleName": "Terraform Resource Provider Registrar",
    "description": "Allows the registration of Azure Resource Providers at the subscription scope.",
    "assignableScopes": [
      "/subscriptions/***"
    ],
    "permissions": [
      {
        "actions": [
          "Microsoft.Resources/subscriptions/providers/read",
          "*/register/action"
        ],
        "notActions": [],
        "dataActions": [],
        "notDataActions": []
      }
    ]
  }
}
```

## Google

1. Open [Google Cloud Console][google-cloud]
2. Create a project.
3. Under [APIs and services][google-cloud-api], select [OAuth consent screen][google-cloud-auth].
4. Set up the general information for your project.
5. Create a [client][google-cloud-clients].
   - For local testing with swa-cli, add the authorized origin `http://localhost:4280`.
   - For production, enter the URL of the deployed app.
   - The client secret is required only when testing with Bruno or other API clients.

[google-cloud]: https://console.cloud.google.com/
[google-cloud-api]: https://console.cloud.google.com/apis/dashboard
[google-cloud-auth]: https://console.cloud.google.com/auth/overview
[google-cloud-clients]: https://console.cloud.google.com/auth/clients