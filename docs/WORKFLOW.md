# ForgeOps Development Workflow

## Branch Strategy

| Branch | Purpose | Deploys to | Triggered by |
|--------|---------|-----------|-------------|
| feature/* | Developer work | None (CI only) | Developer push |
| int | Integration testing | INT environment | Merge from feature |
| qa | System integration testing | QA environment | Merge from int |
| stage | User acceptance testing | STAGE environment | Merge from qa |
| main | Production | PROD environment | Merge from stage (2 approvals) |

## Step-by-Step Workflow

### Step 1: Developer creates feature branch
- From ForgeOps dashboard → Pull Requests → Create PR → select repo
- Or from VS Code with GitHub extension
- Branch naming: `feature/JIRA-123-short-description`

### Step 2: Developer commits and pushes code
- GitHub Copilot assists with code suggestions in VS Code
- On push: CI pipeline runs automatically
  - Build and unit tests
  - SCA scan (OWASP Dependency-Check or Black Duck)
  - SAST scan (SonarQube when configured)
  - Secret scan (Gitleaks)
  - SBOM generation (Syft)
- Results visible in ForgeOps dashboard → Pipelines page
- If any scan fails: pipeline stops, developer gets notified

### Step 3: PR to INT
- Developer creates PR: `feature/*` → `int`
- From dashboard: Pull Requests → "Feature → INT" button
- Security scans run on the PR
- Tech Lead reviews code (GitHub Copilot assists with review)
- Tech Lead approves and merges

### Step 4: Deploy to INT
- Pipeline auto-triggers on merge to `int` branch
- Builds artifact and deploys to INT environment
- Jira tickets in commits auto-transition to "Ready for Unit Testing"
- Email sent to developer: "Deployed to INT — ready for unit testing"
- Teams notification sent to development channel

### Step 5: Unit testing in INT
- Developer performs unit testing in INT environment
- When complete: Environments page → INT card → "Mark Unit Testing Complete"
- Jira status updates to "Unit Testing Complete"

### Step 6: Promote to QA
- Release Engineer: Pull Requests → "INT → QA" button → Create PR → Merge
- Pipeline auto-deploys to QA
- Jira → "Ready for SIT"
- Email → QA team
- Teams → QA channel

### Step 7: SIT in QA
- QA team performs system integration testing
- When complete: Environments page → QA card → "Mark SIT Complete"

### Step 8: Promote to STAGE
- Release Engineer: Pull Requests → "QA → STAGE" button → Merge
- Jira → "Ready for UAT"
- Email → UAT team

### Step 9: UAT in STAGE
- UAT team performs user acceptance testing
- When complete: Environments page → STAGE card → "Mark UAT Complete"

### Step 10: Deploy to PRODUCTION
- Release Engineer: Pull Requests → "STAGE → PROD" button → Create PR
- Requires 2 approvals (Tech Lead + Release Manager)
- Approvers see: security scan summary, Jira tickets included, test results
- On approval + merge: auto-deploy to PROD
- Jira → "Deployed to Production"
- Email → all stakeholders
- Teams → release channel
- Cherwell Change Request created (when configured)
- Splunk event logged (when configured)
- GitHub Release created with changelog
