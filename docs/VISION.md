# ForgeOps — Vision

## What is ForgeOps?
ForgeOps is an enterprise DevSecOps platform built on GitHub Actions. It replaces CloudBees Jenkins with a modern, automated, and secure CI/CD pipeline framework that requires zero scripting knowledge from its users.

## Mission
Make every software release fast, safe, and auditable — without requiring developers or release engineers to write scripts or touch a command line.

## Core Principles
1. **GitHub is the platform** — no external servers, no Docker, no databases. GitHub Actions is the engine, GitHub Pages hosts the dashboard, GitHub API stores all data.
2. **Click, don't type** — release engineers promote code through environments using buttons, not git commands.
3. **Secure by default** — every commit is scanned (SAST, SCA, secrets, SBOM). Security gates block unsafe code automatically.
4. **Skip gracefully** — every integration (Jira, Splunk, Teams, Cherwell, SonarQube, Black Duck) works when configured and skips silently when not. Pipelines never fail because a tool isn't set up yet.
5. **Dual logging** — every event is logged to GitHub Actions Job Summary (always free) AND Splunk (when configured).
6. **One workflow, all technologies** — Java, JavaScript, UiPath, system integrations all follow the same flow: build → scan → INT → QA → STAGE → PROD.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          GitHub Repository                          │
│                                                                     │
│  Reusable Workflows          Technology Pipelines                   │
│  ├── _security-scan.yml      ├── java-webapp.yml                    │
│  ├── _deploy.yml             ├── javascript-webapp.yml              │
│  ├── _notify.yml             ├── uipath-rpa.yml                     │
│  └── _validate-secrets.yml   └── system-integration.yml             │
│                                                                     │
│  Dashboard (GitHub Pages)    Scripts                                 │
│  └── dashboard/index.html    ├── forgeops-log.sh                    │
│                              ├── jira-integration.py                │
│                              └── cherwell-integration.py            │
├─────────────────────────────────────────────────────────────────────┤
│                     GitHub-Hosted Runners                           │
│              (ubuntu-latest / windows-latest)                       │
├─────────────────────────────────────────────────────────────────────┤
│                        Integrations                                 │
│  SonarQube · Black Duck · Gitleaks · Trivy · Syft · Jira           │
│  Splunk · Microsoft Teams · Email (SMTP) · Cherwell/ServiceNow     │
│  (All optional — skip gracefully if not configured)                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Workflow

```
feature/* ──PR──► int ──PR──► qa ──PR──► stage ──PR──► main (prod)
              Tech Lead     Release Eng    Release Eng    2 Approvals
```

Each promotion triggers: build → security scan → deploy → Jira update → email → Teams → Splunk.

## Integrations

| Tool | Purpose | Status |
|---|---|---|
| GitHub Actions | CI/CD engine | Core (always active) |
| GitHub Copilot | AI code review, failure analysis | Enable at org level |
| SonarQube | SAST scanning | Optional (free, self-hosted) |
| Black Duck / OWASP DC | SCA scanning | Optional (OWASP DC is free) |
| Gitleaks | Secret detection | Always active (free) |
| Trivy | Container scanning | Optional |
| Syft | SBOM generation | Always active (free) |
| Jira | ALM / ticket tracking | Optional |
| Splunk | Centralized logging | Optional |
| Microsoft Teams | Chat notifications | Optional |
| Email (SMTP) | Job notifications | Optional |
| Cherwell / ServiceNow | Change management (ITSM) | Optional |

## Roadmap

### Phase 1 (Current): Foundation
- GitHub Actions reusable workflows
- 4 technology pipeline templates
- 6-page dashboard on GitHub Pages
- Email + Teams + Splunk notifications
- Jira status sync

### Phase 2: Self-Hosted Runners
- Install runners on corporate network
- Enable Cherwell integration
- Enable SSH deployments to actual servers
- Faster builds, more control

### Phase 3: Advanced Security
- SonarQube SAST with quality gates
- Black Duck SCA with policy enforcement
- DAST scanning against staging
- Compliance evidence collection

### Phase 4: Self-Healing
- GitHub Copilot Autofix for security vulnerabilities
- Dependabot for dependency updates
- Scheduled health checks with auto-remediation
- Drift detection with auto-correction

### Phase 5: Enterprise Scale
- Multi-org support
- Custom dashboard per team
- Advanced RBAC
- Audit log export for compliance
