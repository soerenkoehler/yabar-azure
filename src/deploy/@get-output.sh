#!/bin/bash

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TF_DIR=$(cd -- "$SCRIPT_DIR/../tf" && pwd)

# --------------------
# get tofu outputs
# --------------------
pushd "$TF_DIR"
OUTPUT=$(
    tofu output -json 2>/dev/null
)
popd
