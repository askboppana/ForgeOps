# Setting Up Microsoft Teams Notifications

1. In Teams, go to the channel where you want notifications
2. Click ⋯ → Connectors → Incoming Webhook → Create
3. Name it "ForgeOps" → Create → copy the webhook URL
4. Add to GitHub Org Secrets: TEAMS_WEBHOOK = the URL you copied
5. Notifications appear automatically on every deploy + failure
