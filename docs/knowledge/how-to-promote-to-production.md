# How to Promote Code to Production
1. Ensure UAT is complete — check Environments page → STAGE card shows "UAT Complete"
2. Go to Pull Requests → click "STAGE → PROD" button
3. Create the PR — it will show all Jira tickets and security scan results
4. Two approvers must approve (Tech Lead + Release Manager)
5. After approval, merge the PR
6. Pipeline auto-deploys to production
7. Jira updates to "Deployed to Production"
8. All stakeholders receive email and Teams notification
