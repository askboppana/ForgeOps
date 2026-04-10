# How to Register a Repository in ForgeOps
1. Create int, qa, stage branches in your repo (main already exists)
2. Copy workflow files from ForgeOps repo to your repo's .github/workflows/
3. Copy scripts/ folder to your repo
4. Edit ci.yml — change APP_NAME to your app name
5. Create GitHub Environments (int, qa, stage, prod) in repo Settings
6. Push to any branch — pipeline will run

See docs/SETUP.md for detailed instructions.
