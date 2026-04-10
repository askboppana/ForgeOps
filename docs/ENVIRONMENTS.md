# ForgeOps Environments

## Overview

ForgeOps uses 5 environments in a progressive promotion pipeline. Each environment has specific branch triggers, protection rules, and Jira status mappings.

## Environment Matrix

| Environment | Branch Trigger | Auto-Deploy | Approval Required | Jira Status |
|-------------|---------------|-------------|-------------------|-------------|
| **DEV** | `develop` | Yes | No | `In Development` |
| **INT** | `develop` | Yes (after DEV) | No | `Integration Testing` |
| **QA** | `develop` | Yes (after INT) | No | `QA Testing` |
| **STAGE** | `release/*` | Yes | No | `Staging` |
| **PROD** | `release/*`, `hotfix/*` | No | **Yes** | `Done` |

## Environment Details

### DEV (Development)
- **Purpose**: First deployment target for feature integration
- **Branch**: `develop`
- **Trigger**: Automatic on push to `develop`
- **Protection**: None
- **URL Pattern**: `https://<app>.dev.internal`
- **Jira Transition**: → `In Development`

### INT (Integration)
- **Purpose**: Integration testing between services
- **Branch**: `develop`
- **Trigger**: Automatic after successful DEV deployment
- **Protection**: None
- **URL Pattern**: `https://<app>.int.internal`
- **Jira Transition**: → `Integration Testing`

### QA (Quality Assurance)
- **Purpose**: Manual and automated QA testing
- **Branch**: `develop`
- **Trigger**: Automatic after successful INT deployment
- **Protection**: None (QA team notified via Slack)
- **URL Pattern**: `https://<app>.qa.internal`
- **Jira Transition**: → `QA Testing`

### STAGE (Staging)
- **Purpose**: Pre-production validation, DAST scanning, UAT
- **Branch**: `release/*`
- **Trigger**: Automatic on push to `release/*`
- **Protection**: Cherwell Change Request created automatically
- **URL Pattern**: `https://<app>.stage.internal`
- **Jira Transition**: → `Staging`
- **Notes**: OWASP ZAP DAST scan runs against this environment

### PROD (Production)
- **Purpose**: Live production environment
- **Branch**: `release/*`, `hotfix/*`
- **Trigger**: Manual approval required
- **Protection**:
  - GitHub Environment protection rules (required reviewers)
  - Cherwell Change Request (auto-created, must be approved)
  - All security scans must pass
  - DAST scan on staging must pass
- **URL Pattern**: `https://<app>.internal`
- **Jira Transition**: → `Done`
- **Notes**: Git tag created on successful deployment

## Branch → Environment Mapping

```
feature/* ──► develop ──► DEV ──► INT ──► QA
                              │
release/* ──────────────────► STAGE ──► PROD
                              │
hotfix/*  ──────────────────────────────► PROD
```

## GitHub Environment Setup

Each environment must be created in GitHub repository settings:

### Required GitHub Environments
1. `dev` — No protection rules
2. `int` — No protection rules
3. `qa` — No protection rules
4. `stage` — Optional: required reviewers for release approval
5. `prod` — **Required**: At least 1 required reviewer

### Environment Protection Rules (prod)
- **Required reviewers**: Add team leads or release managers
- **Wait timer**: Optional (e.g., 15 minutes for change window)
- **Deployment branches**: Restrict to `release/*` and `hotfix/*`

## Jira Status Flow

```
Open → In Development → Integration Testing → QA Testing → Staging → Done
```

Each pipeline stage automatically transitions linked Jira issues (extracted from commit messages using the pattern `[A-Z]+-\d+`).

## Cherwell Change Requests

Change Requests are automatically created for **stage** and **prod** deployments:
- **Stage**: CR created with status "New"
- **Prod Success**: CR updated to "Implemented"
- **Prod Failure**: CR updated to "Failed"
