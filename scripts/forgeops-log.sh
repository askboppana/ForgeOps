#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# forgeops-log.sh — Dual logging engine for ForgeOps CI/CD pipelines
#
# Usage:
#   forgeops-log.sh <event_type> <status> <message> [json_payload]
#
# Arguments:
#   event_type    — Category of event (build, test, deploy, scan, etc.)
#   status        — One of: passed, failed, skipped, info
#   message       — Human-readable description
#   json_payload  — Optional JSON string with extra structured data
#
# Outputs:
#   1. Markdown table row appended to GITHUB_STEP_SUMMARY (if set)
#   2. JSON line appended to .forgeops/events.json
#   3. Splunk HEC event sent (if SPLUNK_HEC_URL is set)
###############################################################################

readonly EVENT_TYPE="${1:?Usage: forgeops-log.sh <event_type> <status> <message> [json_payload]}"
readonly STATUS="${2:?Usage: forgeops-log.sh <event_type> <status> <message> [json_payload]}"
readonly MESSAGE="${3:?Usage: forgeops-log.sh <event_type> <status> <message> [json_payload]}"
readonly JSON_PAYLOAD="${4:-"{}"}"

readonly TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
readonly RUN_ID="${GITHUB_RUN_ID:-"local"}"
readonly RUN_NUMBER="${GITHUB_RUN_NUMBER:-"0"}"
readonly REPO="${GITHUB_REPOSITORY:-"unknown/unknown"}"
readonly SHA="${GITHUB_SHA:-"0000000"}"
readonly ACTOR="${GITHUB_ACTOR:-"$(whoami)"}"

# Validate status
case "${STATUS}" in
  passed|failed|skipped|info) ;;
  *)
    echo "::warning::forgeops-log: invalid status '${STATUS}', expected passed|failed|skipped|info"
    ;;
esac

# Status emoji for markdown
status_icon() {
  case "${1}" in
    passed)  echo ":white_check_mark:" ;;
    failed)  echo ":x:" ;;
    skipped) echo ":fast_forward:" ;;
    info)    echo ":information_source:" ;;
    *)       echo ":grey_question:" ;;
  esac
}

# ─── Step 1: Write to GITHUB_STEP_SUMMARY ────────────────────────────────────
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  ICON="$(status_icon "${STATUS}")"
  echo "| ${ICON} | \`${EVENT_TYPE}\` | ${STATUS} | ${MESSAGE} | \`${TIMESTAMP}\` |" >> "${GITHUB_STEP_SUMMARY}"
else
  echo "[forgeops-log] GITHUB_STEP_SUMMARY not set — skipping summary write"
fi

# ─── Step 2: Append JSON line to .forgeops/events.json ───────────────────────
EVENTS_DIR="${GITHUB_WORKSPACE:-.}/.forgeops"
EVENTS_FILE="${EVENTS_DIR}/events.json"
mkdir -p "${EVENTS_DIR}"

# Build the JSON event line (no jq dependency — pure bash + printf)
EVENT_JSON="$(cat <<EOJSON
{"timestamp":"${TIMESTAMP}","event_type":"${EVENT_TYPE}","status":"${STATUS}","message":"${MESSAGE}","run_id":"${RUN_ID}","run_number":"${RUN_NUMBER}","repository":"${REPO}","sha":"${SHA}","actor":"${ACTOR}","payload":${JSON_PAYLOAD}}
EOJSON
)"

echo "${EVENT_JSON}" >> "${EVENTS_FILE}"
echo "[forgeops-log] Event recorded: ${EVENT_TYPE} — ${STATUS}"

# ─── Step 3: Send to Splunk HEC (if configured) ──────────────────────────────
if [[ -n "${SPLUNK_HEC_URL:-}" ]]; then
  SPLUNK_TOKEN="${SPLUNK_HEC_TOKEN:-}"
  if [[ -z "${SPLUNK_TOKEN}" ]]; then
    echo "::warning::forgeops-log: SPLUNK_HEC_URL is set but SPLUNK_HEC_TOKEN is missing — skipping Splunk"
  else
    SPLUNK_PAYLOAD="$(cat <<EOSPLUNK
{"sourcetype":"forgeops:pipeline","event":${EVENT_JSON}}
EOSPLUNK
)"
    HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${SPLUNK_HEC_URL}" \
      -H "Authorization: Splunk ${SPLUNK_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${SPLUNK_PAYLOAD}" \
      --max-time 10 \
      --retry 2 \
      --retry-delay 1 || echo "000")"

    if [[ "${HTTP_CODE}" == "200" ]]; then
      echo "[forgeops-log] Splunk HEC: event sent successfully"
    else
      echo "::warning::forgeops-log: Splunk HEC returned HTTP ${HTTP_CODE}"
    fi
  fi
else
  echo "[forgeops-log] SPLUNK_HEC_URL not set — skipping Splunk"
fi
