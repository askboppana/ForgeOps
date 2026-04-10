# ForgeOps — Enterprise DevSecOps Platform

GitHub Actions-based CI/CD replacing CloudBees Jenkins. No Docker, no external servers. GitHub is the platform.

**Dashboard:** [askboppana.github.io/ForgeOps](https://askboppana.github.io/ForgeOps)

## What It Does

Release engineers promote code through environments using **buttons, not scripts**:

```
feature/* ──PR──► int ──PR──► qa ──PR──► stage ──PR──► main (prod)
              Tech Lead     Release Eng    Release Eng    2 Approvals
```

Every promotion triggers: **build → security scan → deploy → Jira update → email → Teams → Splunk**.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      GitHub Repository                        │
│                                                              │
│  Reusable Workflows        Technology Pipelines              │
│  ├── _security-scan.yml    ├── java-webapp.yml               │
│  ├── _deploy.yml           ├── javascript-webapp.yml         │
│  ├── _notify.yml           ├── uipath-rpa.yml                │
│  ├── _validate-secrets.yml └── system-integration.yml        │
│  └── _rollback.yml                                           │
│                                                              │
│  Dashboard (Pages)         Scripts                           │
│  └── index.html            ├── forgeops-log.sh               │
│                            ├── jira-integration.py           │
│                            └── cherwell-integration.py       │
├──────────────────────────────────────────────────────────────┤
│  Runners: ubuntu-latest / windows-latest (self-hosted ready) │
├──────────────────────────────────────────────────────────────┤
│  Integrations (all optional, skip gracefully):               │
│  SonarQube · OWASP DC · Gitleaks · Trivy · Syft · Jira      │
│  Email · Teams · Splunk · Cherwell/ServiceNow                │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start (15 minutes)

1. **Create branches** in your app repo: `int`, `qa`, `stage` (`main` exists)
2. **Copy workflows**: `_security-scan.yml`, `_deploy.yml`, `_notify.yml` + your tech template → `.github/workflows/ci.yml`
3. **Copy scripts/**: all files from this repo's `scripts/` folder
4. **Create environments**: in repo Settings → Environments → `int`, `qa`, `stage`, `prod`
5. **Push code**: pipeline runs automatically

See [docs/SETUP.md](docs/SETUP.md) for full guide.

## Integrations

| Tool | Purpose | Status |
|------|---------|--------|
| GitHub Actions | CI/CD engine | Always active |
| Gitleaks | Secret detection | Always active (free) |
| Syft | SBOM generation | Always active (free) |
| OWASP Dep-Check | SCA scanning | Active when Black Duck not configured (free) |
| SonarQube | SAST scanning | Add `SONAR_HOST_URL` + `SONAR_TOKEN` secrets |
| Black Duck | SCA scanning | Add `BLACKDUCK_URL` + `BLACKDUCK_TOKEN` secrets |
| Jira | Ticket tracking | Add `JIRA_URL` + `JIRA_TOKEN` secrets |
| Email (SMTP) | Notifications | Add `SMTP_SERVER` + credentials |
| Microsoft Teams | Notifications | Add `TEAMS_WEBHOOK` secret |
| Splunk | Centralized logging | Add `SPLUNK_HEC_URL` + `SPLUNK_HEC_TOKEN` |
| Cherwell/ServiceNow | Change management | Add ITSM credentials |

All integrations skip gracefully when not configured.

## File Structure

```
ForgeOps/
├── .github/
│   ├── workflows/
│   │   ├── _security-scan.yml     # 5 parallel scans + gate
│   │   ├── _deploy.yml            # Multi-method deploy + ITSM
│   │   ├── _notify.yml            # Email + Teams + Splunk
│   │   ├── _validate-secrets.yml  # Integration status check
│   │   ├── _rollback.yml          # Manual rollback
│   │   ├── java-webapp.yml        # Java pipeline template
│   │   ├── javascript-webapp.yml  # JS pipeline template
│   │   ├── uipath-rpa.yml         # UiPath pipeline template
│   │   ├── system-integration.yml # Backend service template
│   │   ├── deploy-dashboard.yml   # Dashboard → GitHub Pages
│   │   ├── self-healing.yml       # Auto-fix health checks
│   │   ├── weekly-metrics.yml     # DORA metrics report
│   │   └── secret-health-check.yml
│   ├── ISSUE_TEMPLATE/            # Support/bug/feature/security
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
├── dashboard/
│   └── index.html                 # Preact single-file app
├── scripts/
│   ├── forgeops-log.sh            # Dual logging
│   ├── forgeops-summary.sh        # Pipeline summary
│   ├── jira-integration.py        # Jira automation
│   ├── cherwell-integration.py    # ITSM automation
│   ├── cherwell-health-check.sh   # ITSM connectivity test
│   ├── setup-runner.sh            # Linux runner setup
│   └── setup-runner-windows.ps1   # Windows runner setup
├── docs/
│   ├── VISION.md                  # Mission, principles, roadmap
│   ├── WORKFLOW.md                # 10-step dev-to-prod flow
│   ├── ENVIRONMENTS.md            # INT/QA/STAGE/PROD matrix
│   ├── SETUP.md                   # Complete setup guide
│   ├── ROLLBACK.md                # Rollback procedures
│   ├── TROUBLESHOOTING.md         # Common issues + fixes
│   ├── MIGRATION-TO-SELF-HOSTED.md
│   ├── CHERWELL-SETUP.md          # ITSM guide
│   ├── BACKLOG.md                 # Roadmap
│   └── knowledge/                 # 8 how-to articles
├── CODEOWNERS
├── .gitignore
└── README.md
```

## Documentation

| Doc | Audience |
|-----|---------|
| [Vision](docs/VISION.md) | Everyone — what ForgeOps is and where it's going |
| [Workflow](docs/WORKFLOW.md) | All teams — the 10-step dev-to-prod process |
| [Setup](docs/SETUP.md) | DevOps — how to onboard a repo |
| [Environments](docs/ENVIRONMENTS.md) | Release engineers — branch/env mapping |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Everyone — common issues |
| [Knowledge Base](docs/knowledge/) | Everyone — 8 how-to articles |

## Support

Create a ticket: [New Issue](https://github.com/askboppana/ForgeOps/issues/new/choose) → choose Support Request, Bug Report, Feature Request, or Security Vulnerability.
