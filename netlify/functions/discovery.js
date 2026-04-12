const fetch = require('node-fetch');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

function respond(code, data) {
  return { statusCode: code, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

function getToken() {
  return process.env.GITHUB_TOKEN;
}

function getOrg() {
  return process.env.GITHUB_ORG;
}

async function ghFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function getAllRepos() {
  const org = getOrg();
  let allRepos = [];
  let page = 1;
  const endpoint = `/orgs/${org}/repos`;
  let useUser = false;

  try {
    while (true) {
      const data = await ghFetch(`${endpoint}?per_page=100&page=${page}`);
      if (!Array.isArray(data) || data.length === 0) break;
      allRepos = allRepos.concat(data);
      if (data.length < 100) break;
      page++;
    }
  } catch {
    useUser = true;
  }

  if (useUser) {
    page = 1;
    allRepos = [];
    while (true) {
      const data = await ghFetch(`/users/${getOrg()}/repos?per_page=100&page=${page}`);
      if (!Array.isArray(data) || data.length === 0) break;
      allRepos = allRepos.concat(data);
      if (data.length < 100) break;
      page++;
    }
  }

  return allRepos;
}

let forgeopsReposCache = null;
let forgeopsReposCacheTime = 0;
const FORGEOPS_CACHE_TTL = 10 * 60 * 1000;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const method = event.httpMethod;
  const fullPath = event.path || '';
  const parts = fullPath.split('/').filter(Boolean);
  let route = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'discovery') { route = parts.slice(i + 1); break; }
  }
  const body = event.body ? JSON.parse(event.body) : {};
  const query = event.queryStringParameters || {};

  try {
    // GET /quick
    if (route[0] === 'quick' && method === 'GET') {
      const repos = await getAllRepos();
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

      let active = 0;
      let stale = 0;
      let archived = 0;

      for (const repo of repos) {
        if (repo.archived) {
          archived++;
        } else if (new Date(repo.pushed_at) > sixMonthsAgo) {
          active++;
        } else {
          stale++;
        }
      }

      return respond(200, {
        total: repos.length,
        active,
        stale,
        archived
      });
    }

    // GET /forgeops-repos
    if (route[0] === 'forgeops-repos' && method === 'GET') {
      const now = Date.now();
      if (forgeopsReposCache && (now - forgeopsReposCacheTime) < FORGEOPS_CACHE_TTL) {
        return respond(200, forgeopsReposCache);
      }

      const repos = await getAllRepos();
      const ciRepos = [];

      for (const repo of repos) {
        if (repo.archived) continue;
        try {
          await ghFetch(`/repos/${repo.full_name}/contents/.github/workflows`);
          ciRepos.push({
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            default_branch: repo.default_branch,
            language: repo.language,
            pushed_at: repo.pushed_at,
            html_url: repo.html_url,
            has_ci: true
          });
        } catch {
          // No workflows directory — skip
        }
      }

      const result = { repos: ciRepos, total: ciRepos.length, scanned: repos.length, cachedAt: new Date().toISOString() };
      forgeopsReposCache = result;
      forgeopsReposCacheTime = now;
      return respond(200, result);
    }

    // POST /scan
    if (route[0] === 'scan' && method === 'POST') {
      const repos = await getAllRepos();
      const results = [];

      const forgeopsPatterns = [
        '.github/workflows',
        'netlify.toml',
        'Dockerfile',
        'docker-compose.yml',
        'docker-compose.yaml',
        '.env.example',
        'jest.config.js',
        'tsconfig.json',
        'package.json'
      ];

      for (const repo of repos) {
        if (repo.archived) continue;
        const repoResult = {
          name: repo.name,
          full_name: repo.full_name,
          language: repo.language,
          pushed_at: repo.pushed_at,
          patterns_found: [],
          score: 0
        };

        try {
          const tree = await ghFetch(`/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`);
          const paths = (tree.tree || []).map(t => t.path);

          for (const pattern of forgeopsPatterns) {
            if (paths.some(p => p.includes(pattern))) {
              repoResult.patterns_found.push(pattern);
              repoResult.score++;
            }
          }
        } catch {
          // Skip repos we can't read
        }

        if (repoResult.score > 0) {
          results.push(repoResult);
        }
      }

      results.sort((a, b) => b.score - a.score);
      return respond(200, { repos: results, total: results.length, scanned: repos.length });
    }

    return respond(404, { error: 'Route not found', route });
  } catch (err) {
    return respond(500, { error: err.message });
  }
};
