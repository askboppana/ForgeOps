#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# cherwell-health-check.sh — Test ITSM connectivity (Cherwell or ServiceNow)
#
# Reads CHERWELL_URL or SERVICENOW_URL from environment, tests authentication,
# and reports connectivity status.
###############################################################################

readonly SCRIPT_NAME="cherwell-health-check"

log() { echo "[${SCRIPT_NAME}] $*"; }
warn() { echo "[${SCRIPT_NAME}] WARNING: $*" >&2; }
fail() { echo "[${SCRIPT_NAME}] FAILED: $*" >&2; exit 1; }

# ─── Detect platform ─────────────────────────────────────────────────────────
PLATFORM=""
BASE_URL=""

if [[ -n "${CHERWELL_URL:-}" ]]; then
  PLATFORM="cherwell"
  BASE_URL="${CHERWELL_URL}"
elif [[ -n "${SERVICENOW_URL:-}" ]]; then
  PLATFORM="servicenow"
  BASE_URL="${SERVICENOW_URL}"
else
  log "Neither CHERWELL_URL nor SERVICENOW_URL is set — skipping health check"
  exit 0
fi

log "Detected platform: ${PLATFORM}"
log "Base URL: ${BASE_URL}"

# ─── Test basic connectivity ─────────────────────────────────────────────────
log "Testing network connectivity..."
HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 10 \
  --retry 1 \
  "${BASE_URL}" 2>/dev/null || echo "000")"

if [[ "${HTTP_CODE}" == "000" ]]; then
  fail "Cannot reach ${BASE_URL} — connection timeout or DNS failure"
fi
log "Network reachable (HTTP ${HTTP_CODE})"

# ─── Test authentication ─────────────────────────────────────────────────────
if [[ "${PLATFORM}" == "cherwell" ]]; then
  log "Testing Cherwell OAuth2 authentication..."

  # Validate required env vars
  for var in CHERWELL_CLIENT_ID CHERWELL_CLIENT_SECRET CHERWELL_USERNAME CHERWELL_PASSWORD; do
    if [[ -z "${!var:-}" ]]; then
      fail "Required environment variable ${var} is not set"
    fi
  done

  TOKEN_URL="${BASE_URL%/}/CherwellAPI/token"
  TOKEN_RESPONSE="$(curl -s -w "\n%{http_code}" \
    --max-time 15 \
    -X POST "${TOKEN_URL}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password&client_id=${CHERWELL_CLIENT_ID}&client_secret=${CHERWELL_CLIENT_SECRET}&username=${CHERWELL_USERNAME}&password=${CHERWELL_PASSWORD}" \
    2>/dev/null || echo -e "\n000")"

  TOKEN_HTTP_CODE="$(echo "${TOKEN_RESPONSE}" | tail -1)"
  TOKEN_BODY="$(echo "${TOKEN_RESPONSE}" | sed '$d')"

  if [[ "${TOKEN_HTTP_CODE}" == "200" ]]; then
    # Verify we got an access_token
    if echo "${TOKEN_BODY}" | grep -q "access_token"; then
      log "Cherwell OAuth2 authentication: PASSED"
    else
      fail "Cherwell returned 200 but no access_token in response"
    fi
  else
    fail "Cherwell OAuth2 authentication failed (HTTP ${TOKEN_HTTP_CODE})"
  fi

  # Test API access with the token
  ACCESS_TOKEN="$(echo "${TOKEN_BODY}" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)"
  if [[ -n "${ACCESS_TOKEN}" ]]; then
    log "Testing API access..."
    API_CODE="$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time 10 \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      "${BASE_URL%/}/CherwellAPI/api/V1/serviceinfo" \
      2>/dev/null || echo "000")"

    if [[ "${API_CODE}" == "200" ]]; then
      log "Cherwell API access: PASSED"
    else
      warn "Cherwell API returned HTTP ${API_CODE} — token may have limited permissions"
    fi
  fi

elif [[ "${PLATFORM}" == "servicenow" ]]; then
  log "Testing ServiceNow Basic auth..."

  # Validate required env vars
  for var in SERVICENOW_USERNAME SERVICENOW_PASSWORD; do
    if [[ -z "${!var:-}" ]]; then
      fail "Required environment variable ${var} is not set"
    fi
  done

  AUTH_CODE="$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 15 \
    -u "${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}" \
    -H "Accept: application/json" \
    "${BASE_URL%/}/api/now/table/sys_properties?sysparm_limit=1" \
    2>/dev/null || echo "000")"

  case "${AUTH_CODE}" in
    200)
      log "ServiceNow Basic auth: PASSED"
      ;;
    401)
      fail "ServiceNow authentication failed — invalid credentials (HTTP 401)"
      ;;
    403)
      warn "ServiceNow returned HTTP 403 — credentials valid but insufficient permissions"
      ;;
    *)
      fail "ServiceNow authentication test returned HTTP ${AUTH_CODE}"
      ;;
  esac

  # Test change_request table access
  log "Testing change_request table access..."
  CR_CODE="$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 15 \
    -u "${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}" \
    -H "Accept: application/json" \
    "${BASE_URL%/}/api/now/table/change_request?sysparm_limit=1" \
    2>/dev/null || echo "000")"

  if [[ "${CR_CODE}" == "200" ]]; then
    log "ServiceNow change_request access: PASSED"
  else
    warn "ServiceNow change_request table returned HTTP ${CR_CODE}"
  fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
log "────────────────────────────────────────"
log "Health check complete for ${PLATFORM}"
log "Endpoint: ${BASE_URL}"
log "Status: CONNECTED"
log "────────────────────────────────────────"
