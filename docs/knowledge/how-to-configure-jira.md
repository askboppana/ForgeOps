# Configuring Jira Integration

1. Sign up for Jira: atlassian.com/software/jira/free (free for up to 10 users)
2. Create an API token: id.atlassian.com → Security → API Tokens → Create
3. Add to GitHub: Org → Settings → Secrets → Actions → New secrets:
   - JIRA_URL = https://yourcompany.atlassian.net
   - JIRA_TOKEN = your API token
4. Jira statuses used by ForgeOps:
   - Ready for Unit Testing
   - Unit Testing Complete
   - Ready for SIT
   - SIT Complete
   - Ready for UAT
   - UAT Complete
   - Deployed to Production
5. Create these statuses and transitions in your Jira project workflow
