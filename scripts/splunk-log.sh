#!/usr/bin/env bash
# splunk-log.sh — Send events to Splunk HEC (HTTP Event Collector)
# Usage: splunk-log.sh <event_type> <json_payload>
# Requires env vars: SPLUNK_HEC_URL, SPLUNK_HEC_TOKEN, SPLUNK_INDEX
# Exits silently if not configured.

set -euo pipefail

EVENT_TYPE="${1:-}"
PAYLOAD="${2:-"{}"}"

# Exit silently if Splunk is not configured
if [ -z "${SPLUNK_HEC_URL:-}" ] || [ -z "${SPLUNK_HEC_TOKEN:-}" ]; then
  exit 0
fi

SPLUNK_INDEX="${SPLUNK_INDEX:-main}"
TIMESTAMP=$(date +%s)
HOSTNAME=$(hostname)

# Build the HEC event payload
HEC_PAYLOAD=$(cat <<EOF
{
  "time": ${TIMESTAMP},
  "host": "${HOSTNAME}",
  "index": "${SPLUNK_INDEX}",
  "sourcetype": "forgeops:pipeline",
  "event": {
    "event_type": "${EVENT_TYPE}",
    "timestamp": "${TIMESTAMP}",
    "hostname": "${HOSTNAME}",
    "github_repository": "${GITHUB_REPOSITORY:-unknown}",
    "github_run_id": "${GITHUB_RUN_ID:-unknown}",
    "github_run_number": "${GITHUB_RUN_NUMBER:-unknown}",
    "github_ref": "${GITHUB_REF:-unknown}",
    "github_sha": "${GITHUB_SHA:-unknown}",
    "github_actor": "${GITHUB_ACTOR:-unknown}",
    "data": ${PAYLOAD}
  }
}
EOF
)

# Send to Splunk HEC
curl -s -k \
  -H "Authorization: Splunk ${SPLUNK_HEC_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${HEC_PAYLOAD}" \
  "${SPLUNK_HEC_URL}" \
  --max-time 10 \
  -o /dev/null \
  -w "" || true
