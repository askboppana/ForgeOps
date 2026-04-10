# ForgeOps - Enterprise DevSecOps Platform

ForgeOps is a centralized DevSecOps platform built entirely on GitHub Actions. It manages CI/CD pipelines across multiple technology stacks (Java, JavaScript, UiPath, System Integration), provides a real-time dashboard, integrates with Jira for status tracking, and delivers notifications via email and Microsoft Teams. One platform to build, test, secure, deploy, and monitor all your applications.

## Quick Start

1. Clone: `git clone https://github.com/askboppana/ForgeOps.git`
2. Add secrets: configure SMTP, Teams, Jira, SonarQube tokens in GitHub Organization Secrets (see docs/SETUP.md)
3. Register repos: add your projects to forgeops-config.json
4. Enable workflows: push to your org -- workflows activate on first push
5. Open dashboard: visit the GitHub Pages URL to see pipeline status

## Architecture

```
+-----------------------------------------------------------+
|                    ForgeOps Command Center                 |
|                   (forgeops-config.json)                   |
+----------+----------+-----------+-------------------------+
           |          |           |
     +-----+--+ +----+---+ +-----+------+ +----------------+
     |  Java  | |  JS/TS | |  UiPath    | | Sys Integration|
     +-----+--+ +----+---+ +-----+------+ +-------+--------+
           |          |           |                |
     +-----+----------+-----------+----------------+
     |           Reusable Workflows (7)            |
     |  build | test | scan | deploy | notify |    |
     |  jira-update | health-check                 |
     +---------+-----------+-----------+-----------+
               |           |           |           |
          +----+--+  +-----+-+  +------+-+  +-----+-+
          |  INT  |  |  QA   |  | STAGE  |  | PROD  |
          +-------+  +-------+  +--------+  +-------+
```

## Workflow

```
feature/* --PR--> develop --merge--> INT
                      |
              release/* --merge--> QA
                      |
                   main --merge--> STAGE
                      |
                  tag v* --dispatch--> PROD
```

Each stage updates Jira, sends email/Teams notifications, and logs to Splunk.

## Command Center

- **Project Registry**: forgeops-config.json defines all projects, repos, teams, and templates
- **Dashboard**: generate-dashboard-data.yml runs every 15 min, populates the dashboard
- **Bulk Operations**: create an issue titled `[FORGEOPS] deploy java-backend qa` to deploy all repos in a project
- **Self-Healing**: health checks run every 6 hours to detect and repair drift

## Dashboard

Hosted on GitHub Pages. Light theme by default with 4 switchable themes.
Shows real-time pipeline status for all registered repos.

URL: `https://askboppana.github.io/ForgeOps/`

## File Structure

```
ForgeOps/
  .github/
    dependabot.yml
    PULL_REQUEST_TEMPLATE.md
    ISSUE_TEMPLATE/
      support-request.md
      feature-request.md
      bug-report.md
      security-vulnerability.md
      config.yml
  docs/
    VISION.md
    WORKFLOW.md
    ENVIRONMENTS.md
    SETUP.md
    ROLLBACK.md
    TROUBLESHOOTING.md
    MIGRATION-TO-SELF-HOSTED.md
    CHERWELL-SETUP.md
    COMMAND-CENTER.md
    BACKLOG.md
    knowledge/
      (12 articles)
  templates/
    CODEOWNERS.template
  dashboard/
    (static site files)
  scripts/
    (automation scripts)
  forgeops-config.json
  CODEOWNERS
  SECURITY.md
  CHANGELOG.md
  LICENSE
  README.md
```

## Integrations

| Integration | Purpose                          | Config                    |
|-------------|----------------------------------|---------------------------|
| Jira        | Status sync per environment      | JIRA_BASE_URL + API token |
| Email/SMTP  | Build and deploy notifications   | SMTP_SERVER + credentials |
| MS Teams    | Webhook alerts for prod/critical | TEAMS_WEBHOOK_URL         |
| SonarQube   | Code quality and security gates  | SONAR_TOKEN + host URL    |
| Splunk      | Pipeline log forwarding          | SPLUNK_HEC_URL + token    |
| Dependabot  | Auto-update Actions dependencies | .github/dependabot.yml    |
| Cherwell    | ITSM change management (opt-in)  | CHERWELL_BASE_URL + key   |

## Support

- **Knowledge Base**: docs/knowledge/ (12 articles covering common tasks)
- **Troubleshooting**: docs/TROUBLESHOOTING.md (10 common issues with fixes)
- **File an Issue**: use the issue templates (Support, Bug, Feature, Security)
- **Contact**: @askboppana

## License

MIT License. See LICENSE file.
