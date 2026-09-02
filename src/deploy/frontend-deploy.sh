#!/bin/bash

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)

source "$SCRIPT_DIR/@get-output.sh"

# --------------------
# set deployment parameter
# --------------------
DEPLOYMENT_TOKEN=$(
    jq -r '.swa_deployment_token.value // ""' <<<"$OUTPUT"
)

# --------------------
# deploy SWA
# --------------------
pushd "$REPO_ROOT/src"
swa deploy \
    --verbose silly \
    --deployment-token "$DEPLOYMENT_TOKEN"
popd
