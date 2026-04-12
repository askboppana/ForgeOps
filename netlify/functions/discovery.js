const fetch = require('node-fetch');

const GITHUB_API = 'https://api.github.com';

function getHeaders() {
  return {
    'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function getOrg() {
  return process.env.GITHUB_ORG || 'askboppana';
}

// Helper: get workflow file contents
async function getWorkflowDetails(owner, repo) {
  try {
    const r = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/.github/workflows`, { headers: getHeaders() });
    if (r.status !== 200) return { names: [], files: [] };
    const data = await r.json();
    if (!Array.isArray(data)) return { names: [], files: [] };
    return { names: data.map(f => f.name), files: data };
  } catch { return { names: [], files: [] }; }
}

// Helper: check if a specific file exists
async function fileExists(owner, repo, filePath) {
  try {
    const r = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`, { headers: getHeaders() });
    return r.status === 200;
  } catch { return false; }
}

// Helper: read a file and return its text content
async function readFileContent(owner, repo, filePath) {
  try {
    const r = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`, { headers: getHeaders() });
    if (r.status !== 200) return null;
    const data = await r.json();
    if (!data.content) return null;
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch { return null; }
}

// Helper: get latest workflow run
async function getLatestRun(owner, repo) {
  try {
    const r = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/actions/runs?per_page=1`, { headers: getHeaders() });
    if (r.status !== 200) return null;
    const data = await r.json();
    return data.workflow_runs?.[0] || null;
  } catch { return null; }
}

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

// In-memory cache for forgeops-repos
let forgeopsReposCache = null;
let forgeopsReposCacheTime = 0;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const fullPath = event.path || '';
  const pathParts = fullPath.split('/').filter(Boolean);
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'discovery') {
      segments = pathParts.slice(i + 1);
      break;
    }
  }
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // GET /quick
    if (segments[0] === 'quick' && method === 'GET') {
      const org = getOrg();
      const allRepos = [];
      let page = 1;
      while (true) {
        let response = await fetch(`${GITHUB_API}/orgs/${org}/repos?per_page=100&page=${page}&sort=updated`, { headers: getHeaders() });
        if (!response.ok) response = await fetch(`${GITHUB_API}/users/${org}/repos?per_page=100&page=${page}&sort=updated`, { headers: getHeaders() });
        if (!response.ok) break;
        const repos = await response.json();
        if (!repos.length) break;
        allRepos.push(...repos);
        if (repos.length < 100) break;
        page++;
      }

      const now = Date.now();
      const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;
      let active = 0, archived = 0, forks = 0, stale = 0;

      allRepos.forEach(r => {
        if (r.archived) archived++;
        else if (r.fork) forks++;
        else if (now - new Date(r.pushed_at || r.updated_at) > sixMonths) stale++;
        else active++;
      });

      return respond(200, { total: allRepos.length, active, archived, forks, stale });
    }

    // GET /forgeops-repos
    if (segments[0] === 'forgeops-repos' && method === 'GET') {
      // Return cache if fresh (10 min)
      if (forgeopsReposCache && Date.now() - forgeopsReposCacheTime < 600000) {
        return respond(200, forgeopsReposCache);
      }

      const org = getOrg();

      // Fetch all repos
      const allRepos = [];
      let page = 1;
      while (true) {
        let response = await fetch(`${GITHUB_API}/orgs/${org}/repos?per_page=100&page=${page}&sort=updated`, { headers: getHeaders() });
        if (!response.ok) response = await fetch(`${GITHUB_API}/users/${org}/repos?per_page=100&page=${page}&sort=updated`, { headers: getHeaders() });
        if (!response.ok) break;
        const repos = await response.json();
        if (!repos.length) break;
        allRepos.push(...repos);
        if (repos.length < 100) break;
        page++;
      }

      // Quick filter
      const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const candidates = allRepos.filter(r =>
        !r.archived && !r.fork && r.size > 0 &&
        !(r.name === '.github' || r.name.startsWith('.')) &&
        (now - new Date(r.pushed_at || r.updated_at)) < sixMonths
      );

      // Check each candidate for ForgeOps patterns
      const forgeopsRepos = [];
      const batchSize = 15;

      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (repo) => {
          const owner = repo.owner.login;

          // Check for workflow files
          let workflows = [];
          try {
            const r = await fetch(`${GITHUB_API}/repos/${owner}/${repo.name}/contents/.github/workflows`, { headers: getHeaders() });
            if (r.status === 200) {
              const data = await r.json();
              if (Array.isArray(data)) workflows = data.map(f => f.name);
            }
          } catch {}

          const hasForgeOpsWorkflow = workflows.some(w =>
            w === 'ci.yml' || w.includes('forgeops') || w.includes('deploy') || w.includes('security')
          );

          // Check for forgeops config/directory
          let hasForgeOpsConfig = false;
          let hasForgeOpsDir = false;
          try {
            const [cfgRes, dirRes] = await Promise.all([
              fetch(`${GITHUB_API}/repos/${owner}/${repo.name}/contents/forgeops-config.json`, { headers: getHeaders() }),
              fetch(`${GITHUB_API}/repos/${owner}/${repo.name}/contents/.forgeops`, { headers: getHeaders() }),
            ]);
            hasForgeOpsConfig = cfgRes.status === 200;
            hasForgeOpsDir = dirRes.status === 200;
          } catch {}

          const hasAnyPattern = hasForgeOpsWorkflow || hasForgeOpsConfig || hasForgeOpsDir || workflows.length > 0;

          if (hasAnyPattern) {
            return {
              name: repo.name,
              full_name: repo.full_name,
              language: repo.language || 'Unknown',
              pushed_at: repo.pushed_at,
              default_branch: repo.default_branch || 'main',
              private: repo.private,
              description: repo.description || '',
              size: repo.size,
              workflows,
              isRegistered: false,
              hasForgeOpsWorkflow,
              hasForgeOpsConfig,
              hasForgeOpsDir,
              patternCount: [hasForgeOpsWorkflow, hasForgeOpsConfig, hasForgeOpsDir].filter(Boolean).length,
            };
          }
          return null;
        }));

        forgeopsRepos.push(...results.filter(Boolean));
      }

      forgeopsRepos.sort((a, b) => new Date(b.pushed_at || 0) - new Date(a.pushed_at || 0));

      const result = {
        repos: forgeopsRepos,
        count: forgeopsRepos.length,
        totalOrg: allRepos.length,
        scannedAt: new Date().toISOString(),
      };

      forgeopsReposCache = result;
      forgeopsReposCacheTime = Date.now();

      console.log(`ForgeOps repos: ${forgeopsRepos.length} out of ${allRepos.length} total`);
      return respond(200, result);
    }

    // POST /scan
    if (segments[0] === 'scan' && method === 'POST') {
      const org = getOrg();
      console.log(`Deep scan starting for org: ${org}`);

      // 1. Fetch ALL repos
      const allRepos = [];
      let page = 1;
      while (true) {
        let response = await fetch(`${GITHUB_API}/orgs/${org}/repos?per_page=100&page=${page}&sort=updated`, { headers: getHeaders() });
        if (!response.ok) response = await fetch(`${GITHUB_API}/users/${org}/repos?per_page=100&page=${page}&sort=updated`, { headers: getHeaders() });
        if (!response.ok) break;
        const repos = await response.json();
        if (!repos.length) break;
        allRepos.push(...repos);
        if (repos.length < 100) break;
        page++;
      }
      console.log(`Fetched ${allRepos.length} total repos`);

      // 2. Phase 1 quick filter
      const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const toDeepScan = [];
      const quickExcluded = [];

      allRepos.forEach(repo => {
        if (repo.archived) { quickExcluded.push({ name: repo.name, reason: 'Archived' }); return; }
        if (repo.fork) { quickExcluded.push({ name: repo.name, reason: 'Fork' }); return; }
        if (repo.name === '.github' || repo.name.startsWith('.')) { quickExcluded.push({ name: repo.name, reason: 'Org config' }); return; }
        if (repo.size === 0) { quickExcluded.push({ name: repo.name, reason: 'Empty' }); return; }
        if (now - new Date(repo.pushed_at || repo.updated_at) > sixMonths) { quickExcluded.push({ name: repo.name, reason: 'Stale >6mo' }); return; }
        toDeepScan.push(repo);
      });

      console.log(`Phase 1 filter: ${toDeepScan.length} repos to deep scan, ${quickExcluded.length} excluded`);

      // 3. Phase 2 deep scan
      const classified = {
        forgeops_active: [],
        forgeops_configured: [],
        registered: [],
        has_ci: [],
        candidates: [],
        excluded: quickExcluded,
      };

      const batchSize = 10;
      for (let i = 0; i < toDeepScan.length; i += batchSize) {
        const batch = toDeepScan.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (repo) => {
          const owner = repo.owner.login;
          const entry = {
            name: repo.name,
            full_name: repo.full_name,
            language: repo.language || 'Unknown',
            pushed_at: repo.pushed_at,
            size: repo.size,
            default_branch: repo.default_branch || 'main',
            private: repo.private,
            description: repo.description || '',
            status: 'candidates',
            forgeopsPatterns: [],
            workflows: [],
            hasForgeOpsWorkflow: false,
            hasForgeOpsConfig: false,
            hasForgeOpsDir: false,
            isRegistered: false,
            lastRunStatus: null,
            lastRunDate: null,
            signals: [],
          };

          // Get workflow files
          const wfDetails = await getWorkflowDetails(owner, repo.name);
          entry.workflows = wfDetails.names;

          if (wfDetails.names.length > 0) {
            entry.signals.push(`${wfDetails.names.length} workflow(s): ${wfDetails.names.join(', ')}`);

            const forgeOpsNames = wfDetails.names.filter(w =>
              w === 'ci.yml' || w.includes('forgeops') || w.includes('deploy') || w.includes('security-scan')
            );
            if (forgeOpsNames.length > 0) {
              entry.forgeopsPatterns.push('workflow_names');
              entry.signals.push(`ForgeOps workflow pattern: ${forgeOpsNames.join(', ')}`);
            }

            if (wfDetails.names.includes('ci.yml')) {
              const ciContent = await readFileContent(owner, repo.name, '.github/workflows/ci.yml');
              if (ciContent) {
                const callsForgeOps = ciContent.includes('ForgeOps/.github/workflows/') ||
                                      ciContent.includes('_deploy.yml') ||
                                      ciContent.includes('_security-scan.yml') ||
                                      ciContent.includes('_notify.yml') ||
                                      ciContent.includes('_rollback.yml');
                if (callsForgeOps) {
                  entry.hasForgeOpsWorkflow = true;
                  entry.forgeopsPatterns.push('calls_reusable_workflow');
                  entry.signals.push('ci.yml calls ForgeOps reusable workflows');

                  const called = [];
                  if (ciContent.includes('_deploy.yml')) called.push('_deploy.yml');
                  if (ciContent.includes('_security-scan.yml')) called.push('_security-scan.yml');
                  if (ciContent.includes('_notify.yml')) called.push('_notify.yml');
                  if (ciContent.includes('_rollback.yml')) called.push('_rollback.yml');
                  if (called.length) entry.signals.push(`Calls: ${called.join(', ')}`);
                }
              }
            }

            const lastRun = await getLatestRun(owner, repo.name);
            if (lastRun) {
              entry.lastRunStatus = lastRun.conclusion || lastRun.status;
              entry.lastRunDate = lastRun.created_at;
              const runAge = (Date.now() - new Date(lastRun.created_at)) / (1000 * 60 * 60 * 24);
              entry.signals.push(`Last run: ${entry.lastRunStatus} (${Math.floor(runAge)}d ago)`);
            }
          }

          // Check for .forgeops/ directory or forgeops-config in repo
          const [hasDir, hasConfig] = await Promise.all([
            fileExists(owner, repo.name, '.forgeops'),
            fileExists(owner, repo.name, 'forgeops-config.json'),
          ]);
          if (hasDir) {
            entry.hasForgeOpsDir = true;
            entry.forgeopsPatterns.push('forgeops_directory');
            entry.signals.push('.forgeops/ directory found');
          }
          if (hasConfig) {
            entry.hasForgeOpsConfig = true;
            entry.forgeopsPatterns.push('forgeops_config');
            entry.signals.push('forgeops-config.json found in repo');
          }

          // Classify
          const patternCount = entry.forgeopsPatterns.length;
          if (patternCount > 0) {
            if (entry.lastRunDate) {
              const runAge = (Date.now() - new Date(entry.lastRunDate)) / (1000 * 60 * 60 * 24);
              entry.status = runAge < 30 ? 'forgeops_active' : 'forgeops_configured';
            } else if (entry.hasForgeOpsWorkflow) {
              entry.status = 'forgeops_configured';
            } else {
              entry.status = 'registered';
            }
            entry.signals.push(`ForgeOps match strength: ${patternCount}/4 patterns`);
          } else if (entry.workflows.length > 0) {
            entry.status = 'has_ci';
            entry.signals.push('Has CI/CD but not ForgeOps — candidate for migration');
          } else {
            entry.status = 'candidates';
          }

          return entry;
        }));

        batchResults.forEach(r => {
          (classified[r.status] || classified.candidates).push(r);
        });

        if ((i + batchSize) % 50 === 0 || i + batchSize >= toDeepScan.length) {
          console.log(`Deep scan: ${Math.min(i + batchSize, toDeepScan.length)}/${toDeepScan.length}`);
        }
      }

      classified.forgeops_active.sort((a, b) => new Date(b.lastRunDate || 0) - new Date(a.lastRunDate || 0));

      const summary = {
        total: allRepos.length,
        deepScanned: toDeepScan.length,
        forgeops_active: classified.forgeops_active.length,
        forgeops_configured: classified.forgeops_configured.length,
        registered: classified.registered.length,
        has_ci: classified.has_ci.length,
        candidates: classified.candidates.length,
        excluded: classified.excluded.length,
        languages: {},
      };

      [...classified.forgeops_active, ...classified.forgeops_configured, ...classified.registered, ...classified.has_ci, ...classified.candidates].forEach(r => {
        if (r.language !== 'Unknown') summary.languages[r.language] = (summary.languages[r.language] || 0) + 1;
      });

      console.log(`Deep scan complete: ${summary.forgeops_active} ForgeOps active, ${summary.forgeops_configured} configured, ${summary.registered} registered, ${summary.has_ci} other CI, ${summary.candidates} no CI`);

      return respond(200, { summary, classified, scannedAt: new Date().toISOString() });
    }

    return respond(404, { error: 'Not found' });
  } catch (err) {
    console.error('Discovery function error:', err.message);
    return respond(500, { error: err.message });
  }
};
