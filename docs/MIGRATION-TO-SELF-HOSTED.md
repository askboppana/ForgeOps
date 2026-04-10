# Migrating to Self-Hosted Runners

## When to Migrate
- When you need access to corporate network (Cherwell, internal SonarQube, deploy servers)
- When you want faster builds with dedicated hardware
- When you need Windows runners for UiPath

## Steps

1. Install runner on Linux server:
```bash
bash scripts/setup-runner.sh --url https://github.com/yourorg --token TOKEN --labels build,security,deploy
```

2. Install runner on Windows server (UiPath):
```powershell
.\scripts\setup-runner-windows.ps1 -Url "https://github.com/yourorg" -Token "TOKEN"
```

3. In each workflow file, replace:
   - `ubuntu-latest` → `[self-hosted, linux, build]` (for build jobs)
   - `ubuntu-latest` → `[self-hosted, linux, security]` (for scan jobs)
   - `ubuntu-latest` → `[self-hosted, linux, deploy]` (for deploy jobs)
   - `windows-latest` → `[self-hosted, windows, uipath]` (for UiPath jobs)

4. Remove the "Install Trivy/Gitleaks/Syft" steps (setup-runner.sh already installed them)

5. Verify: GitHub → Org → Settings → Actions → Runners → see your runners online

## Quick Replace Command

```bash
sed -i 's/runs-on: ubuntu-latest/runs-on: [self-hosted, linux, build]/g' .github/workflows/*.yml
```

## Rollback to GitHub-Hosted

If self-hosted runners have issues:
```bash
sed -i 's/runs-on: \[self-hosted.*\]/runs-on: ubuntu-latest/g' .github/workflows/*.yml
```
