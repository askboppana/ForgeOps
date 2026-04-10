# ForgeOps

**Enterprise DevSecOps Platform** — GitHub Actions reusable workflows replacing CloudBees Jenkins. No Docker anywhere. Everything runs on GitHub Actions self-hosted runners on your Linux and Windows servers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Actions                          │
│                  (Workflow Engine)                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Java    │  │  JS/TS   │  │  UiPath  │  │  System   │  │
│  │  WebApp  │  │  WebApp  │  │  RPA     │  │  Integr.  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│       │              │             │              │         │
│       └──────────────┴─────┬───────┴──────────────┘         │
│                            │                                │
│  ┌─────────────────────────┴─────────────────────────────┐  │
│  │            Reusable Workflows                         │  │
│  │  _security-scan.yml          _deploy.yml              │  │
│  │  (SonarQube, Black Duck,     (SSH, ArgoCD, UiPath     │  │
│  │   Gitleaks, Trivy, Syft)      Orchestrator)           │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                   Self-Hosted Runners                       │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  Linux Servers   │  │  Windows Servers  │                │
│  │  [build]         │  │  [uipath]         │                │
│  │  [security]      │  │                   │                │
│  │  [deploy]        │  │                   │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     Integrations                            │
│  Jira  ·  Cherwell ITSM  ·  Splunk  ·  Slack  ·  SonarQube│
│  Black Duck  ·  Gitleaks  ·  Trivy  ·  Syft  ·  OWASP ZAP │
└─────────────────────────────────────────────────────────────┘
```

**Key principle**: GitHub Actions is the orchestration engine. Self-hosted runners execute directly on your servers. No Docker containers, no container registries. Artifacts are deployed via SSH, ArgoCD, or UiPath Orchestrator.

## Pipeline Flow

```
feature/* ──► develop ──► DEV ──► INT ──► QA
                   │
release/* ──────► STAGE ──► DAST ──► PROD ──► Git Tag
                   │
hotfix/*  ──────────────────────► PROD ──► Git Tag
```

Each pipeline includes:
1. **Build** — Compile, test, generate coverage reports
2. **Security Scan** — SAST, SCA, secret scanning, SBOM generation (parallel)
3. **Deploy** — Progressive promotion through environments
4. **DAST** — OWASP ZAP against staging (release branches only)
5. **Release** — Git tag on successful production deployment

## Branching Strategy (GitFlow)

| Branch | Purpose | Deploys To |
|--------|---------|------------|
| `feature/*` | New features | PR → develop |
| `develop` | Integration branch | DEV → INT → QA |
| `release/*` | Release candidates | STAGE → PROD |
| `hotfix/*` | Production fixes | PROD (fast-track) |
| `main` | Production state | Tagged releases |

## Setup

### 1. Create GitHub Environments

In your repository **Settings → Environments**, create:

| Environment | Protection Rules |
|-------------|-----------------|
| `dev` | None |
| `int` | None |
| `qa` | None |
| `stage` | Optional reviewers |
| `prod` | **Required reviewers** (team leads) |

### 2. Add Organization Secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret | Description |
|--------|-------------|
| `SONAR_HOST_URL` | SonarQube server URL |
| `SONAR_TOKEN` | SonarQube authentication token |
| `BLACKDUCK_URL` | Black Duck server URL |
| `BLACKDUCK_API_TOKEN` | Black Duck API token |
| `SPLUNK_HEC_URL` | Splunk HTTP Event Collector URL |
| `SPLUNK_HEC_TOKEN` | Splunk HEC token |
| `SPLUNK_INDEX` | Splunk index name |
| `JIRA_URL` | Jira server URL |
| `JIRA_TOKEN` | Jira API token |
| `JIRA_PROJECT` | Default Jira project key |
| `SSH_PRIVATE_KEY` | SSH key for deployment |
| `SSH_USER` | SSH username |
| `CHERWELL_URL` | Cherwell ITSM URL |
| `CHERWELL_CLIENT_ID` | Cherwell OAuth2 client ID |
| `CHERWELL_CLIENT_SECRET` | Cherwell OAuth2 client secret |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL |
| `UIPATH_ORCHESTRATOR_URL` | UiPath Orchestrator URL |
| `UIPATH_CLIENT_ID` | UiPath external app client ID |
| `UIPATH_CLIENT_SECRET` | UiPath external app client secret |

### 3. Install Self-Hosted Runners

**Linux runners** (build, security, deploy):
```bash
sudo ./scripts/setup-runner.sh \
  --url https://github.com/YOUR_ORG \
  --token RUNNER_REG_TOKEN \
  --labels "linux,build,security,deploy" \
  --name runner-linux-01
```

**Windows runners** (UiPath):
```powershell
.\scripts\setup-runner-windows.ps1 `
  -Url https://github.com/YOUR_ORG `
  -Token RUNNER_REG_TOKEN `
  -Labels "windows,uipath" `
  -Name runner-win-01
```

### 4. Copy Workflows to App Repositories

Copy the `.github/workflows/` directory and `scripts/` directory into each application repository. Choose the appropriate pipeline:

- **Java web apps**: Use `java-webapp.yml`
- **JavaScript/React/Angular apps**: Use `javascript-webapp.yml`
- **UiPath RPA processes**: Use `uipath-rpa.yml`
- **Backend services (Java)**: Use `system-integration.yml`

## Approval Process

Production deployments use **GitHub Environment Protection Rules**:

1. Pipeline reaches the `prod` deployment job
2. GitHub pauses the workflow and notifies required reviewers
3. Reviewers approve or reject in the GitHub Actions UI
4. On approval, deployment proceeds automatically
5. Cherwell Change Request is created/updated automatically

No manual Jenkins approvals. No separate approval systems. Everything lives in GitHub.

## Security Pipeline

All pipelines run 5 parallel security scans:

| Tool | Scan Type | What It Does |
|------|-----------|-------------|
| **SonarQube** | SAST | Static code analysis, quality gates |
| **Black Duck** | SCA | Open-source vulnerability & license compliance |
| **Gitleaks** | Secrets | Detects exposed secrets in git history |
| **Trivy** | Container | Container image vulnerability scan (optional) |
| **Syft** | SBOM | Software bill of materials generation |

A **Security Gate** job aggregates all results. If any CRITICAL or HIGH findings are detected, the pipeline fails and blocks deployment.

SCA failures automatically create Jira tickets for tracking.

## Observability

All pipeline events are logged to **Splunk** via the `scripts/splunk-log.sh` helper:
- Build start/end
- Security scan results
- Deployment start/end/rollback
- DAST scan results

Events use sourcetype `forgeops:pipeline` and include full GitHub context (repo, run ID, SHA, actor).

## Feature Origin Map

| ForgeOps Feature | Previous Tool |
|-----------------|---------------|
| Reusable workflows | CloudBees Jenkins shared libraries |
| Self-hosted runners | Jenkins agents on VMs |
| Environment protection rules | Jenkins input step approvals |
| GitHub Secrets | Jenkins credentials store |
| Splunk logging | Jenkins → Splunk plugin |
| Jira integration | Jenkins Jira plugin |
| Cherwell CR automation | Jenkins Cherwell plugin |
| SonarQube SAST | Jenkins SonarQube plugin |
| Black Duck SCA | Jenkins Synopsys plugin |
| OWASP ZAP DAST | Jenkins ZAP plugin |
| Artifact upload/download | Jenkins stash/unstash |
| Branch-based deployment | Jenkins multibranch pipeline |

## Repository Structure

```
ForgeOps/
├── .github/workflows/
│   ├── _security-scan.yml      # Reusable: 5 parallel security scans
│   ├── _deploy.yml             # Reusable: multi-method deployment
│   ├── java-webapp.yml         # Full pipeline for Java web apps
│   ├── javascript-webapp.yml   # Full pipeline for JS web apps
│   ├── uipath-rpa.yml          # Full pipeline for UiPath RPA
│   └── system-integration.yml  # Full pipeline for backend services
├── scripts/
│   ├── splunk-log.sh           # Splunk HEC event logging
│   ├── jira-integration.py     # Jira ticket/transition automation
│   ├── cherwell-integration.py # Cherwell CR automation
│   ├── setup-runner.sh         # Linux runner setup
│   └── setup-runner-windows.ps1# Windows runner setup
├── docs/
│   └── ENVIRONMENTS.md         # Environment documentation
├── .gitignore
└── README.md
```
