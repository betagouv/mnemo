#!/bin/sh
set -eu

: "${IFC_SERVER_API_TOKEN:?IFC_SERVER_API_TOKEN must be set before exposing the IFC server}"
: "${PORT:?PORT must be provided by Scalingo}"

export CACHE_DIR="${CACHE_DIR:-/tmp/mnemo-ifc-lite-cache}"
export CORS_ORIGINS="${CORS_ORIGINS-}"
export IFC_MAX_CONCURRENT_PARSES="${IFC_MAX_CONCURRENT_PARSES:-1}"

exec ./node_modules/.bin/ifc-lite-server
