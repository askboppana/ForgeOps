# ForgeOps Setup Guide

## Prerequisites
- GitHub organization or personal account
- GitHub Actions enabled
- At least one repository with code to deploy

## Step 1: Clone ForgeOps (5 minutes)
The ForgeOps repo is already set up. All workflow templates, scripts, and the dashboard are here.

## Step 2: Register a repository (10 minutes per repo)
1. In your app repo, create branches: `int`, `qa`, `stage` (`main` already exists)
2. Copy workflow files from ForgeOps:
   - Copy the appropriate technology template (`java-webapp.yml`, `javascript-webapp.yml`, `uipath-rpa.yml`, or `system-integration.yml`) to your repo as `.github/workflows/ci.yml`
   - Copy `_security-scan.yml`, `_deploy.yml`, `_notify.yml` to `.github/workflows/`
   - Copy all files from `scripts/` to your repo's `scripts/` folder
   - Change `APP_NAME` at the top of `ci.yml` to your app name
3. Create GitHub Environments (`int`, `qa`, `stage`, `prod`) with protection rules
4. Push and watch the pipeline run

## Step 3: Configure integrations (as needed)
Add these as GitHub Organization Secrets (Settings → Secrets → Actions):

### Required for email notifications:
| Secret | Where to get it |
|--------|----------------|
| `SMTP_SERVER` | Your company SMTP server (e.g. smtp.office365.com) |
| `SMTP_PORT` | Usually 587 |
| `SMTP_USERNAME` | Service account email |
| `SMTP_PASSWORD` | Service account password |
| `NOTIFY_EMAIL_TO` | Default recipient list (comma-separated) |

### Required for Teams notifications:
| Secret | Where to get it |
|--------|----------------|
| `TEAMS_WEBHOOK` | Teams → channel → Connectors → Incoming Webhook → Create → copy URL |

### Optional — Jira:
| Secret | Where to get it |
|--------|----------------|
| `JIRA_URL` | Your Jira server URL (e.g. https://yourcompany.atlassian.net) |
| `JIRA_TOKEN` | Jira → Profile → Personal Access Tokens → Create |

### Optional — SonarQube (free, self-hosted):
| Secret | Where to get it |
|--------|----------------|
| `SONAR_HOST_URL` | Your SonarQube server (e.g. http://sonar.internal:9000) |
| `SONAR_TOKEN` | SonarQube → My Account → Security → Generate Token |

### Optional — Splunk:
| Secret | Where to get it |
|--------|----------------|
| `SPLUNK_HEC_URL` | Your Splunk HEC endpoint (e.g. https://splunk.internal:8088) |
| `SPLUNK_HEC_TOKEN` | Splunk → Settings → Data Inputs → HEC → New Token |
| `SPLUNK_INDEX` | Index name (default: forgeops_cicd) |

### Optional — Cherwell/ServiceNow:
| Secret | Where to get it |
|--------|----------------|
| `CHERWELL_URL` | Cherwell server URL |
| `CHERWELL_CLIENT_ID` | Cherwell admin → API Client Registration |
| `CHERWELL_CLIENT_SECRET` | Same as above |

## Step 4: Install VS Code extensions (2 minutes)
Tell your developers to install:
1. **GitHub Actions** (by GitHub) — pipeline status + workflow editing
2. **GitHub Copilot** (by GitHub) — AI code suggestions + PR review
3. **GitHub Pull Requests** (by GitHub) — create/review PRs from editor

## Step 5: Access the dashboard
Go to https://askboppana.github.io/ForgeOps

Enter your GitHub PAT and connect. You'll see all your repos' pipelines.

## Setting up environments in GitHub
For each app repo, go to Settings → Environments and create:
1. **int** — no protection rules
2. **qa** — no protection rules
3. **stage** — optional: 1 required reviewer
4. **prod** — required: 2 reviewers, wait timer 15 min, deployment branches: main only
