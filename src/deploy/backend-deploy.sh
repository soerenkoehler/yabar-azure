#!/bin/bash

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)

source "$SCRIPT_DIR/@get-output.sh"

# --------------------
# fix AzureWebJobStorage setting for RBAC
# --------------------
FUNCTION_NAME=$(
    jq -r '.backend_function_name.value // ""' <<<"$OUTPUT"
)
az functionapp config appsettings set \
    --name "$FUNCTION_NAME" \
    --resource-group "$PROJECT_RESOURCE_GROUP" \
    --settings AzureWebJobsStorage=""

# --------------------
# build functions
# --------------------
pushd "$REPO_ROOT/src/backend"
func pack --skip-install # install is done as build step

# --------------------
# deploy function using
# curl for faster deployment
# --------------------
curl \
    -X POST \
    -H "Authorization: Bearer $(az account get-access-token | jq -r '.accessToken')" \
    -H "Content-type: application/zip" \
    --data-binary @./backend.zip \
    "https://$FUNCTION_NAME.scm.azurewebsites.net/api/publish"
popd
