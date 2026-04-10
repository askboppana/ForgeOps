# ForgeOps Environments

## Environment Matrix

| Environment | Branch | Auto-deploy | Approval | Jira Status After Deploy | Email To | Teams Channel |
|-------------|--------|------------|----------|------------------------|----------|---------------|
| INT | int | Yes (on merge) | None | Ready for Unit Testing | Developer | dev-channel |
| QA | qa | Yes (on merge) | None | Ready for SIT | QA Team | qa-channel |
| STAGE | stage | Yes (on merge) | Optional (1) | Ready for UAT | UAT Team | uat-channel |
| PROD | main | Yes (on merge) | Required (2) | Deployed to Production | All Stakeholders | releases |

## Jira Status Flow

```
Backlog
  → In Development (developer picks up ticket)
    → Ready for Unit Testing (merged to INT)
      → Unit Testing Complete (developer marks done)
        → Ready for SIT (merged to QA)
          → SIT Complete (QA marks done)
            → Ready for UAT (merged to STAGE)
              → UAT Complete (UAT marks done)
                → Deployed to Production (merged to main)
```

**Note:** "Unit Testing Complete", "SIT Complete", and "UAT Complete" are set **manually** by the testing teams from the ForgeOps dashboard Environments page.

## GitHub Environment Setup

Create these in **Settings → Environments**:

| Environment | Required Reviewers | Deployment Branches |
|-------------|-------------------|---------------------|
| `int` | None | `int` |
| `qa` | None | `qa` |
| `stage` | 1 reviewer (optional) | `stage` |
| `prod` | 2 reviewers (required) | `main` |

## Notification Groups

| Environment | Email Group | Purpose |
|-------------|------------|---------|
| INT | developers | Notify dev that INT is deployed |
| QA | qa_team | Notify QA that build is ready for SIT |
| STAGE | uat_team | Notify UAT that build is ready for testing |
| PROD | all_stakeholders | Notify everyone of production release |

Configure email groups and Teams webhooks in GitHub Secrets:
- `TEAMS_WEBHOOK_DEV` — Microsoft Teams webhook for dev channel
- `TEAMS_WEBHOOK_QA` — webhook for QA channel
- `TEAMS_WEBHOOK_UAT` — webhook for UAT channel
- `TEAMS_WEBHOOK_RELEASES` — webhook for releases channel
- `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` — for email notifications
