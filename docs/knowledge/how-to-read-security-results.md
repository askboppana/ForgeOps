# Understanding Security Scan Results

ForgeOps runs 5 security scans on every pipeline:

1. **SAST (SonarQube)** — finds bugs and vulnerabilities in your source code
2. **SCA (OWASP Dependency-Check / Black Duck)** — finds vulnerabilities in your dependencies
3. **Secrets (Gitleaks)** — detects leaked API keys, passwords, tokens in your code
4. **Container (Trivy)** — scans Docker images for vulnerabilities (when applicable)
5. **SBOM (Syft)** — generates a software bill of materials listing all components

Results are in: dashboard → Security page, and in each pipeline run → expand → Security Gate job.

If the Security Gate fails, you cannot merge. Fix the findings first.
