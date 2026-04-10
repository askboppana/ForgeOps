# Setting Up Email Notifications

ForgeOps sends emails on every deployment success/failure.

1. Get SMTP credentials from your IT team (or use Office 365 / Gmail SMTP)
2. Add to GitHub Org Secrets:
   - SMTP_SERVER (e.g. smtp.office365.com)
   - SMTP_PORT (usually 587)
   - SMTP_USERNAME (service account email)
   - SMTP_PASSWORD (service account password)
   - NOTIFY_EMAIL_TO (comma-separated recipient list)
3. Emails are sent automatically — no code changes needed
