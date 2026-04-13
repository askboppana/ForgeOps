const fetch = require('node-fetch');
const crypto = require('crypto');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

function respond(code, data) {
  return { statusCode: code, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

// ── Env var accessors (read at call time, not module load) ──

function getToken() {
  return process.env.GITHUB_TOKEN;
}

function getOrg() {
  return process.env.GITHUB_ORG;
}

function getAppId() {
  return process.env.GITHUB_APP_ID;
}

function getPrivateKey() {
  return (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

function getInstallationId() {
  return process.env.GITHUB_APP_INSTALLATION_ID;
}

// ── GitHub App JWT generation (pure Node.js crypto) ──

function generateJWT(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iat: now - 60,
    exp: now + (10 * 60),
    iss: appId
  })).toString('base64url');

  const signature = crypto.sign('SHA256', Buffer.from(header + '.' + payload), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_V1_5
  }).toString('base64url');

  return header + '.' + payload + '.' + signature;
}

let cachedInstallToken = null;
let tokenExpiry = 0;

async function getInstallationToken() {
  const appId = getAppId();
  const privateKey = getPrivateKey();
  const installationId = getInstallationId();

  if (!appId || !privateKey || !installationId) return null;

  if (cachedInstallToken && Date.now() < tokenExpiry) {
    return cachedInstallToken;
  }

  try {
    const jwt = generateJWT(appId, privateKey);
    const res = await fetch(
      'https://api.github.com/app/installations/' + installationId + '/access_tokens',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + jwt,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'ForgeOps-DevSecOps'
        }
      }
    );

    if (!res.ok) {
      console.error('GitHub App token error:', res.status);
      return null;
    }

    const data = await res.json();
    cachedInstallToken = data.token;
    tokenExpiry = Date.now() + (55 * 60 * 1000);
    return cachedInstallToken;
  } catch (err) {
    console.error('GitHub App auth failed:', err.message);
    return null;
  }
}

// ── In-memory cache ──

const cache = {};
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache[key];
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data;
  return null;
}
function setCache(key, data) {
  cache[key] = { data, time: Date.now() };
}

// ── Mock data ──

const MOCK_REPOS = [
  { name: 'ForgeOps', full_name: 'askboppana/ForgeOps', language: 'JavaScript', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'admin-dashboard-web', full_name: 'askboppana/admin-dashboard-web', language: 'Python', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'auth-service', full_name: 'askboppana/auth-service', language: 'JavaScript', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'java-svc-payments', full_name: 'company/java-svc-payments', language: 'Java', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'spring-boot-orders', full_name: 'company/spring-boot-orders', language: 'Java', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'react-customer-portal', full_name: 'company/react-customer-portal', language: 'JavaScript', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'node-api-gateway', full_name: 'company/node-api-gateway', language: 'JavaScript', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'py-data-pipeline', full_name: 'company/py-data-pipeline', language: 'Python', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'dotnet-billing', full_name: 'company/dotnet-billing', language: 'C#', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'uipath-bot-invoicing', full_name: 'company/uipath-bot-invoicing', language: 'UiPath', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'sf-apex-triggers', full_name: 'company/sf-apex-triggers', language: 'Apex', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'informatica-etl-pipeline', full_name: 'company/informatica-etl-pipeline', language: 'Informatica', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'rpa-expense-processor', full_name: 'company/rpa-expense-processor', language: 'UiPath', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'devops-scripts', full_name: 'company/devops-scripts', language: 'Shell', default_branch: 'main', updated_at: new Date().toISOString() },
  { name: 'infrastructure-config', full_name: 'company/infrastructure-config', language: 'YAML', default_branch: 'main', updated_at: new Date().toISOString() },
];

const MOCK_BRANCHES = ['main', 'develop', 'int', 'qa', 'staging', 'feature/us-248-smoke-tests', 'feature/us-401-dark-mode', 'fix/def-672-pipeline-timing'];

function generateMockBuilds(count = 50) {
  const repos = MOCK_REPOS.map(r => r.name);
  const users = ['ashwin', 'priya', 'raj', 'dev-lead', 'system'];
  const envs = ['INT', 'QA', 'STAGE', 'PROD'];
  const builds = [];
  for (let i = 0; i < count; i++) {
    const status = Math.random() > 0.15 ? 'success' : (Math.random() > 0.5 ? 'failure' : 'cancelled');
    const env = envs[Math.floor(Math.random() * envs.length)];
    const startedAt = new Date(Date.now() - Math.random() * 7 * 86400000).toISOString();
    const failStage = status === 'failure' ? Math.floor(Math.random() * 5) + 1 : -1;
    const stages = ['Checkout', 'Build', 'Test', 'SAST', 'SCA', 'Deploy', 'Notify'].map((name, idx) => ({
      name,
      status: status === 'failure' && idx === failStage ? 'failure' : idx > failStage && status === 'failure' ? 'pending' : 'success',
      duration: Math.floor(Math.random() * 60) + 5
    }));
    const duration = stages.reduce((a, s) => a + s.duration, 0);
    builds.push({
      id: 'run-' + (1000 + i), run_id: 1000 + i,
      repo: repos[i % repos.length],
      branch: Math.random() > 0.5 ? 'main' : 'feature/us-' + (200 + i),
      status, conclusion: status, environment: env,
      commitSha: Math.random().toString(36).substring(2, 9),
      commitMessage: ['fix: auth timeout', 'feat: add dashboard', 'chore: update deps', 'fix: null pointer', 'feat: new API endpoint', 'test: add coverage'][i % 6],
      triggeredBy: users[Math.floor(Math.random() * users.length)],
      startedAt, duration, stages,
      runNumber: 200 + i,
      jira_tickets: ['US-' + (200 + Math.floor(Math.random() * 100))]
    });
  }
  builds.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  return builds;
}

function getMockEnvironments() {
  return [
    { name: 'INT', status: 'healthy', version: 'v2.0.0', build: 247, deployed_at: new Date(Date.now() - 7200000).toISOString(), branch: 'main', commit: 'a3de5b2' },
    { name: 'QA', status: 'healthy', version: 'v1.9.3', build: 244, deployed_at: new Date(Date.now() - 259200000).toISOString(), branch: 'main', commit: '78177ed' },
    { name: 'STAGE', status: 'healthy', version: 'v1.9.0', build: 230, deployed_at: new Date(Date.now() - 604800000).toISOString(), branch: 'main', commit: 'f4a2c81' },
    { name: 'PROD', status: 'healthy', version: 'v1.0.0', build: 200, deployed_at: '2026-04-11T00:00:00Z', branch: 'main', commit: 'b8e3d92' },
  ];
}

// ── GitHub API fetch — matches discovery.js auth pattern exactly ──

async function ghFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;

  // Try GitHub App first, fall back to PAT
  let authToken = null;
  try {
    authToken = await getInstallationToken();
  } catch {
    // GitHub App failed, will try PAT
  }
  if (!authToken) authToken = getToken();

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(url, { ...options, headers });

  // Log rate limit
  const remaining = res.headers.get('x-ratelimit-remaining');
  const limit = res.headers.get('x-ratelimit-limit');
  if (remaining) console.log('GitHub API: ' + remaining + '/' + limit + ' remaining');

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return { data, headers: res.headers };
}

async function paginateAll(path) {
  let allItems = [];
  let page = 1;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const { data, headers } = await ghFetch(`${path}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    allItems = allItems.concat(data);
    const link = headers.get('link') || '';
    if (!link.includes('rel="next"')) break;
    page++;
  }
  return allItems;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const method = event.httpMethod;
  const fullPath = event.path || '';
  const parts = fullPath.split('/').filter(Boolean);
  let route = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'github') { route = parts.slice(i + 1); break; }
  }
  const body = event.body ? JSON.parse(event.body) : {};
  const query = event.queryStringParameters || {};

  // Cache check for GET requests
  const cacheKey = method + ':' + fullPath;
  if (method === 'GET') {
    const cached = getCached(cacheKey);
    if (cached) {
      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' }, body: JSON.stringify(cached) };
    }
  }

  try {
    const owner = route[1] || '';
    const repo = route[2] || '';

    // GET /repos — list all org repos
    if (route[0] === 'repos' && route.length === 1) {
      const org = getOrg();
      let repos = [];
      try {
        repos = await paginateAll(`/orgs/${org}/repos`);
      } catch {
        try {
          repos = await paginateAll(`/users/${org}/repos`);
        } catch {
          // Both failed — use mocks
        }
      }
      const result = repos.length > 0 ? repos : MOCK_REPOS;
      setCache(cacheKey, result);
      return respond(200, result);
    }

    // GET /repos/:owner/:repo/branches
    if (route[0] === 'repos' && route[3] === 'branches' && route.length === 4) {
      try {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/branches?per_page=100`);
        setCache(cacheKey, data);
        return respond(200, data);
      } catch {
        return respond(200, MOCK_BRANCHES.map(b => ({ name: b })));
      }
    }

    // POST /repos/:owner/:repo/branches/create
    if (route[0] === 'repos' && route[3] === 'branches' && route[4] === 'create' && method === 'POST') {
      const newBranch = body.branchName || body.branch;
      const baseBranch = body.fromBranch || body.from || 'main';
      const { data: refData } = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`);
      const sha = refData?.object?.sha;
      if (!sha) return respond(404, { error: `Base branch "${baseBranch}" not found` });
      await ghFetch(`/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha })
      });
      return respond(201, { success: true, branch: newBranch, sha });
    }

    // GET /repos/:owner/:repo/commits
    if (route[0] === 'repos' && route[3] === 'commits') {
      const params = new URLSearchParams({ per_page: '30' });
      if (query.branch) params.set('sha', query.branch);
      try {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/commits?${params}`);
        setCache(cacheKey, data);
        return respond(200, data);
      } catch {
        return respond(200, []);
      }
    }

    // GET /repos/:owner/:repo/compare
    if (route[0] === 'repos' && route[3] === 'compare') {
      const base = query.base || 'main';
      const head = query.head || 'develop';
      try {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/compare/${base}...${head}`);
        setCache(cacheKey, data);
        return respond(200, data);
      } catch {
        return respond(200, { status: 'identical', ahead_by: 0, behind_by: 0, commits: [], files: [] });
      }
    }

    // GET /repos/:owner/:repo/runs
    if (route[0] === 'repos' && route[3] === 'runs' && route.length === 4) {
      const params = new URLSearchParams({ per_page: '30' });
      if (query.branch) params.set('branch', query.branch);
      if (query.status) params.set('status', query.status);
      try {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/actions/runs?${params}`);
        setCache(cacheKey, data);
        return respond(200, data);
      } catch {
        return respond(200, { workflow_runs: [] });
      }
    }

    // GET/POST /repos/:owner/:repo/pulls
    if (route[0] === 'repos' && route[3] === 'pulls') {
      if (method === 'POST') {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/pulls`, {
          method: 'POST',
          body: JSON.stringify(body)
        });
        return respond(201, data);
      }
      const params = new URLSearchParams({ per_page: '30', state: query.state || 'open' });
      try {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/pulls?${params}`);
        setCache(cacheKey, data);
        return respond(200, data);
      } catch {
        return respond(200, []);
      }
    }

    // POST /repos/:owner/:repo/merge
    if (route[0] === 'repos' && route[3] === 'merge' && method === 'POST') {
      const { data } = await ghFetch(`/repos/${owner}/${repo}/merges`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      return respond(200, data);
    }

    // GET /repos/:owner/:repo/tree
    if (route[0] === 'repos' && route[3] === 'tree') {
      const ref = query.ref || 'main';
      try {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`);
        setCache(cacheKey, data);
        return respond(200, data);
      } catch {
        return respond(200, { tree: [] });
      }
    }

    // GET /repos/:owner/:repo/blob (SHA from path or query)
    if (route[0] === 'repos' && route[3] === 'blob') {
      const sha = route[4] || query.sha;
      if (!sha) return respond(400, { error: 'SHA required' });
      try {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/git/blobs/${sha}`);
        if (data.encoding === 'base64' && data.content) {
          data.decoded_content = Buffer.from(data.content, 'base64').toString('utf-8');
        }
        return respond(200, data);
      } catch {
        return respond(200, { content: '', decoded_content: '' });
      }
    }

    // GET /repos/:owner/:repo/readme
    if (route[0] === 'repos' && route[3] === 'readme') {
      try {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/readme`);
        if (data.encoding === 'base64' && data.content) {
          data.decoded_content = Buffer.from(data.content, 'base64').toString('utf-8');
        }
        return respond(200, data);
      } catch {
        return respond(200, { content: '', decoded_content: '' });
      }
    }

    // PUT /repos/:owner/:repo/contents/:path
    if (route[0] === 'repos' && route[3] === 'contents' && method === 'PUT') {
      const filePath = route.slice(4).join('/');
      if (!filePath) return respond(400, { error: 'File path required' });
      try {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, {
          method: 'PUT',
          body: JSON.stringify({
            message: body.message,
            content: body.content,
            sha: body.sha,
            branch: body.branch
          })
        });
        return respond(200, data);
      } catch (err) {
        return respond(500, { error: err.message });
      }
    }

    // POST /repos/:owner/:repo/commit-multiple
    if (route[0] === 'repos' && route[3] === 'commit-multiple' && method === 'POST') {
      const { branch, message, files } = body;
      const { data: refData } = await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`);
      const latestCommitSha = refData.object.sha;
      const { data: commitData } = await ghFetch(`/repos/${owner}/${repo}/git/commits/${latestCommitSha}`);
      const baseTreeSha = commitData.tree.sha;

      const treeItems = [];
      for (const file of files) {
        const { data: blobData } = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST',
          body: JSON.stringify({ content: file.content, encoding: 'utf-8' })
        });
        treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha });
      }

      const { data: treeData } = await ghFetch(`/repos/${owner}/${repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems })
      });

      const { data: newCommit } = await ghFetch(`/repos/${owner}/${repo}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message, tree: treeData.sha, parents: [latestCommitSha] })
      });

      const { data: updatedRef } = await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: newCommit.sha })
      });

      return respond(200, { commit: newCommit, ref: updatedRef });
    }

    // GET /repos/:owner/:repo/runs/:runId/jobs
    if (route[0] === 'repos' && route[4] === 'jobs') {
      const runId = route[3];
      try {
        const { data } = await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
        return respond(200, data);
      } catch {
        return respond(200, { jobs: [] });
      }
    }

    // GET /build-history
    if (route[0] === 'build-history') {
      try {
        const org = getOrg();
        let repos = [];
        try {
          repos = await paginateAll(`/orgs/${org}/repos`);
        } catch {
          try {
            repos = await paginateAll(`/users/${org}/repos`);
          } catch {
            // Both failed
          }
        }

        if (repos.length === 0) {
          return respond(200, { builds: generateMockBuilds(), total: 50, mock: true });
        }

        const results = [];
        for (const r of repos.slice(0, 20)) {
          try {
            const { data: runs } = await ghFetch(`/repos/${r.full_name}/actions/runs?per_page=5`);
            if (runs.workflow_runs && runs.workflow_runs.length > 0) {
              for (const run of runs.workflow_runs) {
                let environment = 'unknown';
                const branch = (run.head_branch || '').toLowerCase();
                if (branch === 'main' || branch === 'master') environment = 'production';
                else if (branch === 'staging' || branch === 'stage') environment = 'staging';
                else if (branch === 'develop' || branch === 'dev') environment = 'development';

                results.push({
                  repo: r.name, full_name: r.full_name, run_id: run.id,
                  name: run.name, status: run.status, conclusion: run.conclusion,
                  branch: run.head_branch, environment,
                  created_at: run.created_at, updated_at: run.updated_at,
                  html_url: run.html_url
                });
              }
            }
          } catch {
            // Skip repos with no actions access
          }
        }

        results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const data = { builds: results.length > 0 ? results : generateMockBuilds(), total: results.length || 50 };
        setCache(cacheKey, data);
        return respond(200, data);
      } catch {
        return respond(200, { builds: generateMockBuilds(), total: 50, mock: true });
      }
    }

    // GET /environments
    if (route[0] === 'environments') {
      return respond(200, { environments: getMockEnvironments() });
    }

    return respond(404, { error: 'Route not found', route });
  } catch (err) {
    console.error('GitHub API handler error:', err.message);
    if (route[0] === 'repos' && route.length === 1) return respond(200, MOCK_REPOS);
    if (route[3] === 'branches') return respond(200, MOCK_BRANCHES.map(b => ({ name: b })));
    if (route[3] === 'runs' || route[0] === 'build-history') return respond(200, { builds: generateMockBuilds(), mock: true });
    return respond(500, { error: err.message });
  }
};
