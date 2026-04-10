# Cherwell / ServiceNow Setup

## Cherwell
1. Get API client credentials from Cherwell admin
2. Add to GitHub Secrets: CHERWELL_URL, CHERWELL_CLIENT_ID, CHERWELL_CLIENT_SECRET
3. Change Requests are auto-created for STAGE and PROD deployments

## ServiceNow
1. Create integration user with change_manager role
2. Add to GitHub Secrets: SERVICENOW_URL, SERVICENOW_USER, SERVICENOW_PASSWORD
3. ForgeOps auto-detects which ITSM is configured

## What Happens
| Event | Action |
|-------|--------|
| Deploy to STAGE | CR created (status: New) |
| Deploy to PROD (success) | CR updated (status: Implemented) |
| Deploy to PROD (failure) | CR updated (status: Failed) |

If neither is configured, CR steps skip gracefully.
