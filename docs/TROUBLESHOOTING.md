# ForgeOps Troubleshooting Guide

## Common Issues

### Pipeline fails with "permission denied" on scripts
**Fix:** Scripts need execute permission. Run in your repo:
```bash
chmod +x scripts/*.sh scripts/*.py
git add scripts/
git commit -m "fix: make scripts executable"
git push
```
ForgeOps workflows also run `chmod +x scripts/*.sh scripts/*.py` as a safety step.

### Pipeline skips all integrations
**Expected behavior.** ForgeOps skips integrations that aren't configured. You'll see "⏭️ Not configured — skipping" in the job summary. Add the required secrets to enable each integration.

### "Rate limited" error in dashboard
GitHub API allows 5,000 requests/hour with a PAT. The dashboard caches responses for 60 seconds. If you hit the limit, wait for reset or reduce monitored repos.

### Security scan fails but no findings shown
The security gate aggregates all 5 scan types. Unconfigured scans are skipped, not failed. Check the job summary.

### Deploy job says "dry run" mode
SSH deployment requires `DEPLOY_SSH_KEY` and `{ENV}_DEPLOY_HOST` secrets. Without them, deploy logs artifacts that would be deployed.

### SonarQube/Black Duck/Jira step fails
**Check:** Is the secret configured? Go to GitHub → Org → Settings → Secrets → verify.
**Expected:** If not configured, the step should skip with "⏭️ Not configured — skipping". If it's failing instead of skipping, update the workflow to use the secret check pattern.

### Dashboard shows blank screen
**Check:** Open browser DevTools → Console tab → look for errors.
**Common cause:** Content Security Policy blocking a CDN. The dashboard only loads from esm.sh and fonts.googleapis.com.

### Jira tickets not transitioning
**Check:** 1) `JIRA_URL` and `JIRA_TOKEN` secrets are set. 2) The Jira transition names match exactly (case-sensitive). 3) The ticket key is in the commit message (format: `PROJ-123`).

### Email notifications not sending
**Check:** `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` secrets are all set. Test SMTP connectivity from your network.

### Teams notifications not appearing
**Check:** `TEAMS_WEBHOOK` secret is set. Verify the webhook URL is still active in Teams → channel → Connectors.

### Pipeline queued for a long time
**Cause:** GitHub-hosted runners have concurrent job limits. Free accounts: 20 concurrent jobs. Pro: 40.
**Fix:** Wait, or switch to self-hosted runners for more capacity.

### Merge button disabled on dashboard
**Cause:** CI checks haven't passed yet. The merge button is disabled until all required status checks are green.
**Fix:** Wait for checks to complete, or fix the failing check.

## Getting Help
Create a support ticket: GitHub → ForgeOps repo → Issues → New Issue → select "Support Request" template.
