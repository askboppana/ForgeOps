# setup-runner-windows.ps1 — Install and configure a GitHub Actions self-hosted runner on Windows.
# Designed for UiPath automation servers.
#
# Usage:
#   .\setup-runner-windows.ps1 -Url https://github.com/ORG -Token RUNNER_TOKEN -Name runner-win-01 -Labels "windows,uipath"
#
# Must be run as Administrator.

param(
    [Parameter(Mandatory=$true)]
    [string]$Url,

    [Parameter(Mandatory=$true)]
    [string]$Token,

    [Parameter(Mandatory=$false)]
    [string]$Name = $env:COMPUTERNAME,

    [Parameter(Mandatory=$false)]
    [string]$Labels = "self-hosted,windows,uipath"
)

$ErrorActionPreference = "Stop"
$RunnerVersion = "2.319.1"
$RunnerDir = "C:\actions-runner"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  ForgeOps Windows Runner Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  URL:    $Url"
Write-Host "  Name:   $Name"
Write-Host "  Labels: $Labels"
Write-Host "=========================================" -ForegroundColor Cyan

# ── Check Administrator ──
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator."
    exit 1
}

# ── Create Runner Directory ──
Write-Host ""
Write-Host "[1/4] Setting up runner directory..." -ForegroundColor Yellow

if (Test-Path $RunnerDir) {
    Write-Host "  Runner directory already exists at $RunnerDir"
} else {
    New-Item -ItemType Directory -Path $RunnerDir -Force | Out-Null
    Write-Host "  Created $RunnerDir"
}

Set-Location $RunnerDir

# ── Download Runner ──
Write-Host ""
Write-Host "[2/4] Downloading GitHub Actions runner v$RunnerVersion..." -ForegroundColor Yellow

$RunnerZip = "actions-runner-win-x64-$RunnerVersion.zip"
if (-not (Test-Path $RunnerZip)) {
    $DownloadUrl = "https://github.com/actions/runner/releases/download/v$RunnerVersion/$RunnerZip"
    Write-Host "  Downloading from $DownloadUrl..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $RunnerZip -UseBasicParsing

    Write-Host "  Extracting..."
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory("$RunnerDir\$RunnerZip", $RunnerDir)
} else {
    Write-Host "  Runner archive already downloaded"
}

# ── Configure Runner ──
Write-Host ""
Write-Host "[3/4] Configuring runner..." -ForegroundColor Yellow

& "$RunnerDir\config.cmd" `
    --url $Url `
    --token $Token `
    --name $Name `
    --labels $Labels `
    --work "_work" `
    --runasservice `
    --unattended `
    --replace

if ($LASTEXITCODE -ne 0) {
    Write-Error "Runner configuration failed with exit code $LASTEXITCODE"
    exit 1
}

# ── Verify Service ──
Write-Host ""
Write-Host "[4/4] Verifying runner service..." -ForegroundColor Yellow

$service = Get-Service -Name "actions.runner.*" -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "  Service: $($service.Name)"
    Write-Host "  Status:  $($service.Status)"

    if ($service.Status -ne "Running") {
        Start-Service -Name $service.Name
        Write-Host "  Service started"
    }
} else {
    Write-Host "  Warning: Service not found. Starting runner manually..."
    Start-Process -FilePath "$RunnerDir\run.cmd" -NoNewWindow
}

# ── Summary ──
Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  Runner: $Name"
Write-Host "  Labels: $Labels"
Write-Host "  Dir:    $RunnerDir"
Write-Host "  Version: $RunnerVersion"
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To check status:" -ForegroundColor Gray
Write-Host "  Get-Service -Name 'actions.runner.*'" -ForegroundColor Gray
