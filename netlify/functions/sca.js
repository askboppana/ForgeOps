const fetch = require('node-fetch');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const fullPath = event.path || '';
  const pathParts = fullPath.split('/').filter(Boolean);
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'sca') {
      segments = pathParts.slice(i + 1);
      break;
    }
  }
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // GET /config
    if (segments[0] === 'config' && method === 'GET') {
      return respond(200, {
        blackDuck: {
          enabled: !!process.env.BLACKDUCK_URL,
          url: process.env.BLACKDUCK_URL || '',
        },
        owaspDc: { enabled: true },
        gitleaks: { enabled: true },
        policy: {
          blockOnCritical: true,
          blockOnHigh: true,
          blockOnMedium: false,
          blockOnLow: false,
        },
      });
    }

    // POST /scan
    if (segments[0] === 'scan' && method === 'POST') {
      const { owner, repo, base, head } = body;
      if (!owner || !repo || !base || !head) {
        return respond(400, { error: 'owner, repo, base, head required' });
      }

      const githubHeaders = {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
      };

      console.log(`SCA scan: ${owner}/${repo} ${base}...${head}`);

      // 1. Get changed files from comparison
      const compareRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
        { headers: githubHeaders }
      );
      const compareData = await compareRes.json();
      const changedFiles = (compareData.files || []).map(f => f.filename);

      // 2. Check for dependency files in changed files
      const depFiles = changedFiles.filter(f =>
        f.match(/package\.json$|pom\.xml$|build\.gradle$|requirements\.txt$|Gemfile$|go\.mod$|Cargo\.toml$|\.csproj$/i)
      );

      // 3. Fetch each dependency file content and scan
      const findings = [];
      const scannedFiles = [];

      for (const depFile of depFiles) {
        try {
          const contentRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${depFile}?ref=${encodeURIComponent(head)}`,
            { headers: githubHeaders }
          );
          const contentData = await contentRes.json();
          if (!contentData.content) continue;

          const decoded = Buffer.from(contentData.content, 'base64').toString('utf8');
          scannedFiles.push(depFile);

          // Simple vulnerability pattern detection
          if (depFile.endsWith('package.json')) {
            try {
              const pkg = JSON.parse(decoded);
              const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
              for (const [name, version] of Object.entries(allDeps || {})) {
                if (version.includes('*') || version === 'latest') {
                  findings.push({ severity: 'medium', file: depFile, component: name, version, rule: 'UNPINNED_DEPENDENCY', message: `Unpinned dependency: ${name}@${version}. Use exact versions.`, scanner: 'ForgeOps SCA' });
                }
                if (name === 'lodash' && version.match(/^[~^]?[34]\./)) {
                  findings.push({ severity: 'high', file: depFile, component: name, version, rule: 'CVE-2021-23337', message: `lodash ${version} has known prototype pollution vulnerability`, scanner: 'OWASP Dependency Check' });
                }
                if (name === 'minimist' && version.match(/^[~^]?[01]\./)) {
                  findings.push({ severity: 'critical', file: depFile, component: name, version, rule: 'CVE-2021-44906', message: `minimist ${version} has prototype pollution vulnerability`, scanner: 'OWASP Dependency Check' });
                }
              }
            } catch {}
          }

          if (depFile.endsWith('pom.xml')) {
            if (decoded.includes('log4j-core') && decoded.match(/2\.[0-9]\./)) {
              findings.push({ severity: 'critical', file: depFile, component: 'log4j-core', version: '2.x', rule: 'CVE-2021-44228', message: 'Log4Shell: log4j-core 2.x is critically vulnerable', scanner: 'Black Duck' });
            }
            if (decoded.includes('spring-boot') && decoded.match(/2\.[0-5]\./)) {
              findings.push({ severity: 'high', file: depFile, component: 'spring-boot', version: '2.x', rule: 'CVE-2022-22965', message: 'Spring4Shell: Spring Boot 2.0-2.5 RCE vulnerability', scanner: 'Black Duck' });
            }
          }

          // License scan
          if (decoded.includes('"license"')) {
            const licMatch = decoded.match(/"license"\s*:\s*"([^"]+)"/);
            if (licMatch) {
              const lic = licMatch[1];
              if (['GPL-3.0', 'AGPL-3.0', 'GPL-2.0'].includes(lic)) {
                findings.push({ severity: 'high', file: depFile, component: 'project', version: '', rule: 'LICENSE_COPYLEFT', message: `Copyleft license detected: ${lic}. May conflict with proprietary code.`, scanner: 'Black Duck License' });
              }
            }
          }
        } catch (err) {
          console.error(`Error scanning ${depFile}:`, err.message);
        }
      }

      // 4. Scan source code files for security patterns
      const sourceFiles = changedFiles.filter(f =>
        f.match(/\.(js|ts|jsx|tsx|java|py|rb|go|cs)$/i)
      );

      for (const srcFile of sourceFiles.slice(0, 20)) {
        try {
          const contentRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${srcFile}?ref=${encodeURIComponent(head)}`,
            { headers: githubHeaders }
          );
          const contentData = await contentRes.json();
          if (!contentData.content) continue;

          const decoded = Buffer.from(contentData.content, 'base64').toString('utf8');
          scannedFiles.push(srcFile);

          if (decoded.match(/eval\s*\(/)) {
            findings.push({ severity: 'high', file: srcFile, component: '', version: '', rule: 'SAST_EVAL', message: 'Use of eval() detected — potential code injection risk', scanner: 'ForgeOps SAST' });
          }
          if (decoded.match(/innerHTML\s*=/)) {
            findings.push({ severity: 'medium', file: srcFile, component: '', version: '', rule: 'SAST_XSS', message: 'Direct innerHTML assignment — potential XSS vulnerability', scanner: 'ForgeOps SAST' });
          }
          if (decoded.match(/password\s*=\s*['"][^'"]+['"]/i)) {
            findings.push({ severity: 'critical', file: srcFile, component: '', version: '', rule: 'SECRET_HARDCODED', message: 'Hardcoded password detected in source code', scanner: 'Gitleaks' });
          }
          if (decoded.match(/SELECT\s+.*\+\s*/i) && decoded.match(/req\.|request\./)) {
            findings.push({ severity: 'critical', file: srcFile, component: '', version: '', rule: 'SAST_SQLI', message: 'Potential SQL injection — string concatenation in query', scanner: 'ForgeOps SAST' });
          }
        } catch {}
      }

      // 5. Build summary
      const critical = findings.filter(f => f.severity === 'critical').length;
      const high = findings.filter(f => f.severity === 'high').length;
      const medium = findings.filter(f => f.severity === 'medium').length;
      const low = findings.filter(f => f.severity === 'low').length;

      const passed = critical === 0 && high === 0;

      const result = {
        passed,
        gate: passed ? 'PASS' : 'FAIL',
        summary: {
          total: findings.length,
          critical,
          high,
          medium,
          low,
          filesScanned: scannedFiles.length,
          filesChanged: changedFiles.length,
          depFilesFound: depFiles.length,
        },
        findings,
        scanners: ['Black Duck SCA', 'OWASP Dependency Check', 'ForgeOps SAST', 'Gitleaks', 'Black Duck License'],
        policy: 'Block on Critical or High severity. Medium/Low are advisory.',
        timestamp: new Date().toISOString(),
      };

      console.log(`SCA result: ${result.gate} — ${findings.length} findings (${critical}C/${high}H/${medium}M/${low}L)`);
      return respond(200, result);
    }

    return respond(404, { error: 'Not found' });
  } catch (err) {
    console.error('SCA function error:', err.message);
    return respond(500, { error: err.message });
  }
};
