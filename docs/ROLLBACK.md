# Rollback Procedures

## Automatic Rollback
If a health check fails after deployment (10 consecutive failures), the pipeline automatically:
1. Reverts the deployment (via ArgoCD rollback or re-deploys previous version)
2. Logs the rollback to Splunk
3. Sends email + Teams notification
4. Creates Jira comment on affected tickets

## Manual Rollback from Dashboard
1. Go to ForgeOps dashboard → Pipelines page
2. Find the environment you want to rollback
3. Click "🔄 Rollback" button
4. Confirm in the modal
5. ForgeOps triggers the `_rollback.yml` workflow

## Manual Rollback from GitHub
1. Go to your repo → Actions → Rollback workflow
2. Click "Run workflow"
3. Select environment (int/qa/stage/prod)
4. Click "Run workflow"

## What Happens During Rollback
1. ForgeOps finds the previous successful deployment run
2. Re-runs that deployment workflow
3. Updates Jira tickets with rollback comment
4. Sends notifications to affected teams
5. Logs rollback event to Splunk

## Prevention
- Always run full security scans before promoting
- Use staging for UAT before production
- Require 2 approvals for production deployments
- Monitor health check endpoints after every deploy
