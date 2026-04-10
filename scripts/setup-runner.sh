#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# setup-runner.sh — Linux self-hosted runner provisioning for GitHub Actions
#
# Installs and configures:
#   - GitHub Actions runner agent
#   - Trivy (container/filesystem scanner)
#   - Gitleaks (secret scanner)
#   - Syft (SBOM generator)
#
# Usage:
#   setup-runner.sh --url <repo_url> --token <reg_token> \
#                   --labels <label1,label2> --name <runner_name>
###############################################################################

readonly SCRIPT_NAME="setup-runner"
readonly RUNNER_VERSION="${RUNNER_VERSION:-"2.321.0"}"
readonly RUNNER_USER="${RUNNER_USER:-"ghrunner"}"
readonly RUNNER_HOME="/home/${RUNNER_USER}"
readonly RUNNER_DIR="${RUNNER_HOME}/actions-runner"
readonly RUNNER_ARCH="$(uname -m)"

log()  { echo "[${SCRIPT_NAME}] $*"; }
warn() { echo "[${SCRIPT_NAME}] WARNING: $*" >&2; }
fail() { echo "[${SCRIPT_NAME}] FATAL: $*" >&2; exit 1; }

# ─── Parse arguments ─────────────────────────────────────────────────────────
URL=""
TOKEN=""
LABELS="self-hosted,linux"
RUNNER_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)    URL="$2";         shift 2 ;;
    --token)  TOKEN="$2";       shift 2 ;;
    --labels) LABELS="$2";      shift 2 ;;
    --name)   RUNNER_NAME="$2"; shift 2 ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

# ─── Validation ──────────────────────────────────────────────────────────────
if [[ -z "${URL}" ]]; then
  fail "Missing required argument: --url <repository_or_org_url>"
fi
if [[ -z "${TOKEN}" ]]; then
  fail "Missing required argument: --token <registration_token>"
fi
if [[ -z "${RUNNER_NAME}" ]]; then
  RUNNER_NAME="$(hostname)-runner"
  log "No --name provided, defaulting to: ${RUNNER_NAME}"
fi

# Must run as root
if [[ "$(id -u)" -ne 0 ]]; then
  fail "This script must be run as root (use sudo)"
fi

# Determine runner architecture
case "${RUNNER_ARCH}" in
  x86_64)  RUNNER_PKG_ARCH="x64" ;;
  aarch64) RUNNER_PKG_ARCH="arm64" ;;
  arm64)   RUNNER_PKG_ARCH="arm64" ;;
  *)       fail "Unsupported architecture: ${RUNNER_ARCH}" ;;
esac

# ─── System dependencies ─────────────────────────────────────────────────────
log "Installing system dependencies..."
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq \
  curl \
  jq \
  git \
  unzip \
  tar \
  wget \
  apt-transport-https \
  ca-certificates \
  gnupg \
  lsb-release \
  software-properties-common \
  > /dev/null

# ─── Create runner user ──────────────────────────────────────────────────────
if ! id "${RUNNER_USER}" &>/dev/null; then
  log "Creating user: ${RUNNER_USER}"
  useradd -m -s /bin/bash "${RUNNER_USER}"
else
  log "User ${RUNNER_USER} already exists"
fi

# Add to docker group if it exists
if getent group docker &>/dev/null; then
  usermod -aG docker "${RUNNER_USER}" || true
fi

# ─── Install GitHub Actions Runner ───────────────────────────────────────────
log "Installing GitHub Actions runner v${RUNNER_VERSION} (${RUNNER_PKG_ARCH})..."
RUNNER_TAR="actions-runner-linux-${RUNNER_PKG_ARCH}-${RUNNER_VERSION}.tar.gz"
RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TAR}"

mkdir -p "${RUNNER_DIR}"
cd "${RUNNER_DIR}"

if [[ ! -f "${RUNNER_TAR}" ]]; then
  curl -sL -o "${RUNNER_TAR}" "${RUNNER_URL}"
fi

tar -xzf "${RUNNER_TAR}"
chown -R "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_DIR}"

# Install runner dependencies
"${RUNNER_DIR}/bin/installdependencies.sh" || warn "Some runner dependencies may not have installed"

# ─── Install Trivy ────────────────────────────────────────────────────────────
log "Installing Trivy..."
TRIVY_VERSION="${TRIVY_VERSION:-"0.58.0"}"
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | \
  sh -s -- -b /usr/local/bin "v${TRIVY_VERSION}" 2>/dev/null || {
    warn "Trivy install via script failed, trying apt..."
    wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | \
      gpg --dearmor -o /usr/share/keyrings/trivy.gpg 2>/dev/null
    echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" \
      > /etc/apt/sources.list.d/trivy.list
    apt-get update -qq && apt-get install -y -qq trivy > /dev/null
  }
log "Trivy: $(trivy --version 2>/dev/null | head -1 || echo 'installed')"

# ─── Install Gitleaks ─────────────────────────────────────────────────────────
log "Installing Gitleaks..."
GITLEAKS_VERSION="${GITLEAKS_VERSION:-"8.21.2"}"
case "${RUNNER_PKG_ARCH}" in
  x64)   GL_ARCH="x64" ;;
  arm64) GL_ARCH="arm64" ;;
esac
curl -sL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GL_ARCH}.tar.gz" | \
  tar -xzf - -C /usr/local/bin gitleaks 2>/dev/null || warn "Gitleaks install failed"
chmod +x /usr/local/bin/gitleaks 2>/dev/null || true
log "Gitleaks: $(gitleaks version 2>/dev/null || echo 'installed')"

# ─── Install Syft ─────────────────────────────────────────────────────────────
log "Installing Syft..."
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | \
  sh -s -- -b /usr/local/bin 2>/dev/null || warn "Syft install failed"
log "Syft: $(syft version 2>/dev/null | head -1 || echo 'installed')"

# ─── Configure runner ────────────────────────────────────────────────────────
log "Configuring GitHub Actions runner..."
cd "${RUNNER_DIR}"
su - "${RUNNER_USER}" -c "
  cd '${RUNNER_DIR}' && \
  ./config.sh \
    --unattended \
    --url '${URL}' \
    --token '${TOKEN}' \
    --name '${RUNNER_NAME}' \
    --labels '${LABELS}' \
    --replace \
    --work '_work'
"

# ─── Create systemd service ──────────────────────────────────────────────────
log "Creating systemd service..."
cat > /etc/systemd/system/github-runner.service <<EOSERVICE
[Unit]
Description=GitHub Actions Runner (${RUNNER_NAME})
After=network.target

[Service]
Type=simple
User=${RUNNER_USER}
WorkingDirectory=${RUNNER_DIR}
ExecStart=${RUNNER_DIR}/run.sh
Restart=always
RestartSec=10
KillSignal=SIGTERM
TimeoutStopSec=60

Environment="RUNNER_ALLOW_RUNASROOT=0"
Environment="DOTNET_CLI_TELEMETRY_OPTOUT=1"

[Install]
WantedBy=multi-user.target
EOSERVICE

systemctl daemon-reload
systemctl enable github-runner.service
systemctl start github-runner.service

# ─── Verify ──────────────────────────────────────────────────────────────────
log "────────────────────────────────────────"
log "Runner setup complete!"
log "  Name:   ${RUNNER_NAME}"
log "  Labels: ${LABELS}"
log "  User:   ${RUNNER_USER}"
log "  Dir:    ${RUNNER_DIR}"
log ""
log "Installed tools:"
log "  Trivy:    $(trivy --version 2>/dev/null | head -1 || echo 'N/A')"
log "  Gitleaks: $(gitleaks version 2>/dev/null || echo 'N/A')"
log "  Syft:     $(syft version 2>/dev/null | head -1 || echo 'N/A')"
log ""
log "Service status:"
systemctl is-active github-runner.service || true
log "────────────────────────────────────────"
