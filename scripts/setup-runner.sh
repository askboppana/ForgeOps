#!/usr/bin/env bash
# setup-runner.sh — Install and configure a GitHub Actions self-hosted runner on Linux.
# Also installs: Trivy, Gitleaks, Syft
#
# Usage:
#   ./setup-runner.sh --url https://github.com/ORG --token RUNNER_TOKEN --labels linux,build --name runner-01
#
# Must be run as root.

set -euo pipefail

# ── Parse Arguments ──

RUNNER_URL=""
RUNNER_TOKEN=""
RUNNER_LABELS=""
RUNNER_NAME=""
RUNNER_USER="runner"
RUNNER_DIR="/opt/actions-runner"
RUNNER_VERSION="2.319.1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)      RUNNER_URL="$2";    shift 2 ;;
    --token)    RUNNER_TOKEN="$2";  shift 2 ;;
    --labels)   RUNNER_LABELS="$2"; shift 2 ;;
    --name)     RUNNER_NAME="$2";   shift 2 ;;
    *)          echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "${RUNNER_URL}" ] || [ -z "${RUNNER_TOKEN}" ]; then
  echo "Usage: $0 --url <github-url> --token <runner-token> --labels <labels> --name <name>"
  exit 1
fi

RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux}"

echo "========================================="
echo "  ForgeOps Runner Setup"
echo "========================================="
echo "  URL:    ${RUNNER_URL}"
echo "  Name:   ${RUNNER_NAME}"
echo "  Labels: ${RUNNER_LABELS}"
echo "========================================="

# ── Prerequisites ──

echo "[1/7] Installing system prerequisites..."
apt-get update -qq
apt-get install -y -qq curl jq git unzip apt-transport-https ca-certificates gnupg lsb-release

# ── Create Runner User ──

echo "[2/7] Creating runner user..."
if ! id "${RUNNER_USER}" &>/dev/null; then
  useradd -m -s /bin/bash "${RUNNER_USER}"
  echo "Created user: ${RUNNER_USER}"
else
  echo "User ${RUNNER_USER} already exists"
fi

# ── Install GitHub Actions Runner ──

echo "[3/7] Installing GitHub Actions runner v${RUNNER_VERSION}..."
mkdir -p "${RUNNER_DIR}"
cd "${RUNNER_DIR}"

ARCH=$(uname -m)
case "${ARCH}" in
  x86_64)  RUNNER_ARCH="x64" ;;
  aarch64) RUNNER_ARCH="arm64" ;;
  *)       echo "Unsupported architecture: ${ARCH}"; exit 1 ;;
esac

RUNNER_TAR="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
if [ ! -f "${RUNNER_TAR}" ]; then
  curl -sL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TAR}" -o "${RUNNER_TAR}"
fi
tar xzf "${RUNNER_TAR}"
chown -R "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_DIR}"

# ── Configure Runner ──

echo "[4/7] Configuring runner..."
su - "${RUNNER_USER}" -c "
  cd ${RUNNER_DIR} && \
  ./config.sh \
    --url '${RUNNER_URL}' \
    --token '${RUNNER_TOKEN}' \
    --name '${RUNNER_NAME}' \
    --labels '${RUNNER_LABELS}' \
    --work '_work' \
    --unattended \
    --replace
"

# ── Install as systemd Service ──

echo "[5/7] Installing as systemd service..."
cd "${RUNNER_DIR}"
./svc.sh install "${RUNNER_USER}"
./svc.sh start
echo "Runner service started"

# ── Install Trivy ──

echo "[6/7] Installing security tools..."

echo "  Installing Trivy..."
TRIVY_VERSION="0.56.2"
curl -sL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" | \
  tar xz -C /usr/local/bin trivy
trivy --version

echo "  Installing Gitleaks..."
GITLEAKS_VERSION="8.21.2"
curl -sL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" | \
  tar xz -C /usr/local/bin gitleaks
gitleaks version

echo "  Installing Syft..."
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
syft version

# ── Summary ──

echo ""
echo "[7/7] Setup complete!"
echo "========================================="
echo "  Runner: ${RUNNER_NAME}"
echo "  Labels: ${RUNNER_LABELS}"
echo "  Dir:    ${RUNNER_DIR}"
echo "  User:   ${RUNNER_USER}"
echo "  Status: $(./svc.sh status 2>/dev/null || echo 'running')"
echo "========================================="
echo ""
echo "Tools installed:"
echo "  - GitHub Actions Runner v${RUNNER_VERSION}"
echo "  - Trivy v${TRIVY_VERSION}"
echo "  - Gitleaks v${GITLEAKS_VERSION}"
echo "  - Syft (latest)"
echo ""
echo "To check status: systemctl status actions.runner.*"
