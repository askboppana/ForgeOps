# ForgeOps — Environment Variables Setup

Set these in **Netlify Dashboard → Site Settings → Environment Variables**:

## Required

| Variable | Example | Description |
|----------|---------|-------------|
| `JIRA_URL` | `https://yourorg.atlassian.net` | Jira Cloud base URL |
| `JIRA_EMAIL` | `user@company.com` | Jira account email |
| `JIRA_TOKEN` | `ATATT3x...` | Jira API token ([create here](https://id.atlassian.com/manage-profile/security/api-tokens)) |
| `JIRA_PROJECT` | `SCRUM` | Jira project key |
| `GITHUB_TOKEN` | `ghp_...` | GitHub PAT with `repo` + `workflow` scopes |
| `GITHUB_ORG` | `askboppana` | GitHub org or username |

## Optional

| Variable | Example | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Claude API key for AI features |
| `TEAMS_WEBHOOK_URL` | `https://outlook.office.com/webhook/...` | Teams notification webhook |
| `BLACKDUCK_URL` | `https://blackduck.company.com` | Black Duck SCA server |
| `SPLUNK_URL` | `https://splunk.company.com` | Splunk HEC endpoint |
| `SPLUNK_TOKEN` | `...` | Splunk HEC token |

## Local Development

Copy `backend/.env.example` to `backend/.env` and fill in values:
```bash
cp backend/.env.example backend/.env
```

Then run:
```bash
cd backend && node src/index.js &
cd frontend && npm run dev
```

The Vite dev server proxies `/api/*` to `localhost:3001`.
