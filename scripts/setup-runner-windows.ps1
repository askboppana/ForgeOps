#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Windows self-hosted runner provisioning for GitHub Actions.

.DESCRIPTION
    Downloads, configures, and installs the GitHub Actions runner as a
    Windows service. Designed for ForgeOps CI/CD infrastructure.

.PARAMETER Url
    Repository or organization URL for runner registration.

.PARAMETER Token
    Runner registration token from GitHub.

.PARAMETER Name
    Runner name (defaults to hostname).

.PARAMETER Labels
    Comma-separated runner labels (defaults to "self-hosted,windows").

.EXAMPLE
    .\setup-runner-windows.ps1 -Url https://github.com/org/repo -Token AXXXX -Name win-runner-01
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Url,

    [Parameter(Mandatory = $true)]
    [string]$Token,

    [Parameter(Mandatory = $false)]
    [string]$Name = $env:COMPUTERNAME,

    [Parameter(Mandatory = $false)]
    [string]$Labels = "self-hosted,windows"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Speed up Invoke-WebRequest

$ScriptName = "setup-runner-windows"
$RunnerVersion = if ($env:RUNNER_VERSION) { $env:RUNNER_VERSION } else { "2.321.0" }
$RunnerDir = "C:\actions-runner"

# ─── Helpers ──────────────────────────────────────────────────────────────────

function Log {
    param([string]$Message)
    Write-Host "[$ScriptName] $Message"
}

function Warn {
    param([string]$Message)
    Write-Warning "[$ScriptName] $Message"
}

function Fail {
    param([string]$Message)
    Write-Error "[$ScriptName] FATAL: $Message"
    exit 1
}

# ─── Validation ──────────────────────────────────────────────────────────────

if ([string]::IsNullOrWhiteSpace($Url)) {
    Fail "Parameter -Url is required"
}
if ([string]::IsNullOrWhiteSpace($Token)) {
    Fail "Parameter -Token is required"
}
if ([string]::IsNullOrWhiteSpace($Name)) {
    $Name = "$env:COMPUTERNAME-runner"
    Log "No -Name provided, defaulting to: $Name"
}

# Check for admin
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail "This script must be run as Administrator"
}

# ─── Determine architecture ──────────────────────────────────────────────────

$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
Log "Detected architecture: $arch"

# ─── Download and extract runner ─────────────────────────────────────────────

$runnerZip = "actions-runner-win-${arch}-${RunnerVersion}.zip"
$runnerUrl = "https://github.com/actions/runner/releases/download/v${RunnerVersion}/${runnerZip}"
$downloadPath = Join-Path $env:TEMP $runnerZip

Log "Creating runner directory: $RunnerDir"
if (Test-Path $RunnerDir) {
    Log "Runner directory already exists — checking for existing installation"
    $existingConfig = Join-Path $RunnerDir ".runner"
    if (Test-Path $existingConfig) {
        Warn "Existing runner configuration found. Removing old configuration..."
        try {
            Push-Location $RunnerDir
            & .\config.cmd remove --token $Token 2>$null
            Pop-Location
        }
        catch {
            Warn "Could not remove old configuration: $_"
        }
    }
}
else {
    New-Item -ItemType Directory -Path $RunnerDir -Force | Out-Null
}

Log "Downloading GitHub Actions runner v${RunnerVersion}..."
try {
    Invoke-WebRequest -Uri $runnerUrl -OutFile $downloadPath -UseBasicParsing
}
catch {
    Fail "Failed to download runner: $_"
}

Log "Extracting runner..."
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($downloadPath, $RunnerDir)
}
catch {
    # Fall back to Expand-Archive for newer PowerShell
    Expand-Archive -Path $downloadPath -DestinationPath $RunnerDir -Force
}

# Clean up download
Remove-Item $downloadPath -Force -ErrorAction SilentlyContinue

# ─── Configure runner ────────────────────────────────────────────────────────

Log "Configuring GitHub Actions runner..."
Push-Location $RunnerDir

try {
    & .\config.cmd `
        --unattended `
        --url $Url `
        --token $Token `
        --name $Name `
        --labels $Labels `
        --replace `
        --work "_work" `
        --runasservice

    if ($LASTEXITCODE -ne 0) {
        Fail "Runner configuration failed with exit code $LASTEXITCODE"
    }
}
catch {
    Fail "Runner configuration failed: $_"
}
finally {
    Pop-Location
}

# ─── Install as Windows service ──────────────────────────────────────────────

$serviceName = "actions.runner.*"
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($existingService) {
    Log "Runner service detected: $($existingService.Name)"
    if ($existingService.Status -ne "Running") {
        Log "Starting runner service..."
        Start-Service -Name $existingService.Name
    }
    Log "Runner service is running"
}
else {
    # If --runasservice didn't create it, install manually
    Log "Installing runner as Windows service..."
    Push-Location $RunnerDir
    try {
        & .\svc.cmd install
        & .\svc.cmd start

        if ($LASTEXITCODE -ne 0) {
            Warn "Service start returned exit code $LASTEXITCODE"
        }
    }
    catch {
        Warn "Service installation encountered an issue: $_"
    }
    finally {
        Pop-Location
    }
}

# ─── Configure firewall (allow outbound for runner) ─────────────────────────

$firewallRule = "GitHub Actions Runner"
$existingRule = Get-NetFirewallRule -DisplayName $firewallRule -ErrorAction SilentlyContinue
if (-not $existingRule) {
    Log "Creating firewall rule for runner..."
    try {
        New-NetFirewallRule `
            -DisplayName $firewallRule `
            -Direction Outbound `
            -Action Allow `
            -Program (Join-Path $RunnerDir "bin\Runner.Listener.exe") `
            -Enabled True | Out-Null
    }
    catch {
        Warn "Could not create firewall rule: $_"
    }
}

# ─── Summary ─────────────────────────────────────────────────────────────────

Log "────────────────────────────────────────"
Log "Runner setup complete!"
Log "  Name:      $Name"
Log "  Labels:    $Labels"
Log "  Directory: $RunnerDir"
Log "  URL:       $Url"
Log ""

# Verify service
$svc = Get-Service -Name "actions.runner.*" -ErrorAction SilentlyContinue
if ($svc) {
    Log "  Service:   $($svc.Name) ($($svc.Status))"
}
else {
    Warn "  Service not found — runner may need manual service setup"
}

Log "────────────────────────────────────────"
