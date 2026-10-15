#!/bin/sh
set -eu

: "${IFC_SERVER_API_TOKEN:?IFC_SERVER_API_TOKEN must be set before exposing the IFC server}"
: "${PORT:?PORT must be provided by Scalingo}"
: "${S3_ENDPOINT:?S3_ENDPOINT must be configured for IFC sources}"
: "${S3_BUCKET:?S3_BUCKET must be configured for IFC sources}"

export CACHE_DIR="${CACHE_DIR:-/tmp/mnemo-ifc-lite-cache}"
export CORS_ORIGINS="${CORS_ORIGINS-}"
export IFC_MAX_CONCURRENT_PARSES="${IFC_MAX_CONCURRENT_PARSES:-1}"
export IFC_ADMISSION_QUEUE_TIMEOUT_SECS="${IFC_ADMISSION_QUEUE_TIMEOUT_SECS:-120}"
export MAX_FILE_SIZE_MB="${MAX_FILE_SIZE_MB:-1024}"
export REQUEST_TIMEOUT_SECS="${REQUEST_TIMEOUT_SECS:-900}"
export INITIAL_BATCH_SIZE="${INITIAL_BATCH_SIZE:-10}"
export MAX_BATCH_SIZE="${MAX_BATCH_SIZE:-10}"

exec node scripts/gateway.mjs
