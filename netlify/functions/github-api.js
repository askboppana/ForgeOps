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
  // Find 'github' in path and take everything after it
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'github') {
      segments = pathParts.slice(i + 1);
      break;
    }
  }
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};
  const query = event.queryStringParameters || {};

  try {
    // GET /repos (list all repos)
    if (segments[0] === 'repos' && segments.length === 1 && method === 'GET') {
      const org = query.org || getOrg();
      const allRepos = [];
      let page = 1;
      const perPage = 100;

      while (true) {
        const response = await fetch(
          `${GITHUB_API}/orgs/${org}/repos?per_page=${perPage}&page=${page}`,
          { headers: getHeaders() }
        );

        if (!response.ok) {
          const userResponse = await fetch(
            `${GITHUB_API}/users/${org}/repos?per_page=${perPage}&page=${page}`,
            { headers: getHeaders() }
          );
          if (!userResponse.ok) {
            const data = await userResponse.json();
            return respond(userResponse.status, data);
          }
          const repos = await userResponse.json();
          allRepos.push(...repos);
          if (repos.length < perPage) break;
          page++;
          continue;
        }

        const repos = await response.json();
        allRepos.push(...repos);
        if (repos.length < perPage) break;
        page++;
      }

      return respond(200, allRepos);
    }

    // GET /build-history
    if (segments[0] === 'build-history' && method === 'GET') {
      const org = getOrg();
      const months = parseInt(query.months) || 3;
      const envFilter = (query.environment || '').toLowerCase();
      const repoFilter = query.repo || '';
      const since = new Date();
      since.setMonth(since.getMonth() - months);
      const sinceISO = since.toISOString().split('T')[0];

      let targetRepos = [];
      if (repoFilter) {
        targetRepos = [repoFilter];
      } else {
        const repoRes = await fetch(`${GITHUB_API}/users/${org}/repos?per_page=100&sort=updated`, { headers: getHeaders() });
        const repos = await repoRes.json();
        targetRepos = (Array.isArray(repos) ? repos : [])
          .filter(r => !r.archived && !r.fork && r.pushed_at && new Date(r.pushed_at) > since)
          .map(r => r.name)
          .slice(0, 30);
      }

      const allRuns = [];
      for (const repoName of targetRepos) {
        try {
          const qs = new URLSearchParams({ per_page: '100', created: `>=${sinceISO}` });
          if (envFilter) {
            const branchMap = { int: 'int', qa: 'qa', stage: 'stage', staging: 'stage', prod: 'main', production: 'main' };
            const branch = branchMap[envFilter] || envFilter;
            qs.set('branch', branch);
          }
          const runRes = await fetch(`${GITHUB_API}/repos/${org}/${repoName}/actions/runs?${qs}`, { headers: getHeaders() });
          if (!runRes.ok) continue;
          const runData = await runRes.json();
          const runs = runData.workflow_runs || [];
          runs.forEach(run => {
            const branch = (run.head_branch || '').toLowerCase();
            let environment = 'development';
            if (branch === 'main' || branch === 'master') environment = 'prod';
            else if (branch === 'stage' || branch === 'staging') environment = 'stage';
            else if (branch === 'qa') environment = 'qa';
            else if (branch === 'int') environment = 'int';

            allRuns.push({
              id: run.id,
              repo: repoName,
              branch: run.head_branch,
              environment,
              status: run.conclusion || run.status,
              workflow: run.name,
              commitSha: run.head_sha?.substring(0, 7),
              commitMessage: run.display_title || '',
              triggeredBy: run.actor?.login || '',
              startedAt: run.run_started_at || run.created_at,
              completedAt: run.updated_at,
              duration: run.run_started_at && run.updated_at
                ? Math.round((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000)
                : null,
              runNumber: run.run_number,
              event: run.event,
            });
          });
        } catch {}
      }

      allRuns.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

      const summary = {
        total: allRuns.length,
        byEnvironment: {},
        byStatus: {},
        byRepo: {},
        byMonth: {},
      };
      allRuns.forEach(r => {
        summary.byEnvironment[r.environment] = (summary.byEnvironment[r.environment] || 0) + 1;
        summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + 1;
        summary.byRepo[r.repo] = (summary.byRepo[r.repo] || 0) + 1;
        const month = r.startedAt ? r.startedAt.substring(0, 7) : 'unknown';
        summary.byMonth[month] = (summary.byMonth[month] || 0) + 1;
      });

      return respond(200, { runs: allRuns, summary, since: sinceISO, reposScanned: targetRepos.length });
    }

    // All /repos/:owner/:repo/* routes
    if (segments[0] === 'repos' && segments.length >= 3) {
      const owner = segments[1];
      const repo = segments[2];

      // GET /repos/:owner/:repo/branches/search?q=...
      if (segments[3] === 'branches' && segments[4] === 'search' && method === 'GET') {
        const searchQuery = (query.q || '').toLowerCase();
        const allBranches = [];
        let page = 1;
        const perPage = 100;

        while (true) {
          const response = await fetch(
            `${GITHUB_API}/repos/${owner}/${repo}/branches?per_page=${perPage}&page=${page}`,
            { headers: getHeaders() }
          );
          if (!response.ok) {
            const data = await response.json();
            return respond(response.status, data);
          }
          const branches = await response.json();
          allBranches.push(...branches);
          if (branches.length < perPage) break;
          page++;
        }

        const filtered = searchQuery
          ? allBranches.filter(b => b.name.toLowerCase().includes(searchQuery))
          : allBranches;
        return respond(200, filtered);
      }

      // POST /repos/:owner/:repo/branches/create
      if (segments[3] === 'branches' && segments[4] === 'create' && method === 'POST') {
        const { branchName, fromBranch = 'main' } = body;
        const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`, { headers: getHeaders() });
        if (!refRes.ok) {
          const err = await refRes.json();
          return respond(refRes.status, err);
        }
        const refData = await refRes.json();
        const sha = refData.object.sha;
        const createRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
          method: 'POST',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) return respond(createRes.status, createData);
        return respond(200, { success: true, branch: branchName, sha });
      }

      // GET /repos/:owner/:repo/branches
      if (segments[3] === 'branches' && segments.length === 4 && method === 'GET') {
        const response = await fetch(
          `${GITHUB_API}/repos/${owner}/${repo}/branches?per_page=100`,
          { headers: getHeaders() }
        );
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/runs/:runId/jobs
      if (segments[3] === 'runs' && segments.length === 6 && segments[5] === 'jobs' && method === 'GET') {
        const runId = segments[4];
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, { headers: getHeaders() });
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/runs/:runId/artifacts
      if (segments[3] === 'runs' && segments.length === 6 && segments[5] === 'artifacts' && method === 'GET') {
        const runId = segments[4];
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`, { headers: getHeaders() });
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/runs
      if (segments[3] === 'runs' && segments.length === 4 && method === 'GET') {
        const queryParams = new URLSearchParams();
        if (query.per_page) queryParams.set('per_page', query.per_page);
        if (query.page) queryParams.set('page', query.page);
        if (query.status) queryParams.set('status', query.status);
        if (query.created) queryParams.set('created', query.created);
        if (query.branch) queryParams.set('branch', query.branch);

        const response = await fetch(
          `${GITHUB_API}/repos/${owner}/${repo}/actions/runs?${queryParams}`,
          { headers: getHeaders() }
        );
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/commits
      if (segments[3] === 'commits' && method === 'GET') {
        const qs = new URLSearchParams();
        if (query.branch) qs.set('sha', query.branch);
        qs.set('per_page', query.per_page || '30');
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits?${qs}`, { headers: getHeaders() });
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/compare
      if (segments[3] === 'compare' && method === 'GET') {
        const { base, head } = query;
        if (!base || !head) return respond(400, { error: 'base and head query params required' });
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`, { headers: getHeaders() });
        const data = await response.json();
        return respond(response.status, data);
      }

      // POST /repos/:owner/:repo/merge
      if (segments[3] === 'merge' && method === 'POST') {
        const { base, head, commit_message } = body;
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/merges`, {
          method: 'POST',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ base, head, commit_message }),
        });
        const data = await response.json();
        return respond(response.status, data);
      }

      // POST /repos/:owner/:repo/dispatches
      if (segments[3] === 'dispatches' && method === 'POST') {
        const response = await fetch(
          `${GITHUB_API}/repos/${owner}/${repo}/dispatches`,
          {
            method: 'POST',
            headers: { ...getHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );

        if (response.status === 204) {
          return respond(200, { success: true });
        }
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/readme
      if (segments[3] === 'readme' && method === 'GET') {
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, { headers: getHeaders() });
        const data = await response.json();
        if (data.content) {
          data.decoded = Buffer.from(data.content, 'base64').toString('utf8');
        }
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/tree
      if (segments[3] === 'tree' && method === 'GET') {
        const ref = query.ref || 'main';
        const branchRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(ref)}`, { headers: getHeaders() });
        if (!branchRes.ok) {
          const err = await branchRes.json();
          return respond(branchRes.status, err);
        }
        const branchData = await branchRes.json();
        const commitSha = branchData.object.sha;
        const commitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${commitSha}`, { headers: getHeaders() });
        const commitData = await commitRes.json();
        const treeSha = commitData.tree.sha;
        const treeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`, { headers: getHeaders() });
        const treeData = await treeRes.json();
        return respond(200, { tree: treeData.tree.map(t => ({ path: t.path, type: t.type, sha: t.sha, size: t.size || 0 })) });
      }

      // GET /repos/:owner/:repo/blob/:sha
      if (segments[3] === 'blob' && segments.length >= 5 && method === 'GET') {
        const sha = segments[4];
        const blobRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs/${sha}`, { headers: getHeaders() });
        const blobData = await blobRes.json();
        if (!blobRes.ok) return respond(blobRes.status, blobData);
        const content = blobData.encoding === 'base64' ? Buffer.from(blobData.content, 'base64').toString('utf8') : blobData.content;
        return respond(200, { content, sha: blobData.sha, size: blobData.size, encoding: blobData.encoding });
      }

      // PUT /repos/:owner/:repo/commit-file
      if (segments[3] === 'commit-file' && method === 'PUT') {
        const { path: filePath, content, message, branch, sha } = body;
        const reqBody = {
          message,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch,
        };
        if (sha) reqBody.sha = sha;
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`, {
          method: 'PUT',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        });
        const data = await response.json();
        if (!response.ok) return respond(response.status, data);
        return respond(200, { success: true, commit_sha: data.commit.sha, path: filePath });
      }

      // POST /repos/:owner/:repo/commit-multiple
      if (segments[3] === 'commit-multiple' && method === 'POST') {
        const { files, message, branch } = body;
        const hdrs = getHeaders();
        const jsonHdrs = { ...hdrs, 'Content-Type': 'application/json' };

        const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: hdrs });
        if (!refRes.ok) { const e = await refRes.json(); return respond(refRes.status, e); }
        const refData = await refRes.json();
        const currentCommitSha = refData.object.sha;

        const commitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${currentCommitSha}`, { headers: hdrs });
        const commitData = await commitRes.json();
        const baseTreeSha = commitData.tree.sha;

        const treeItems = [];
        for (const file of files) {
          const blobRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
            method: 'POST',
            headers: jsonHdrs,
            body: JSON.stringify({ content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64' }),
          });
          const blobData = await blobRes.json();
          if (!blobRes.ok) return respond(blobRes.status, blobData);
          treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha });
        }

        const treeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, {
          method: 'POST',
          headers: jsonHdrs,
          body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
        });
        const treeData = await treeRes.json();
        if (!treeRes.ok) return respond(treeRes.status, treeData);

        const newCommitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
          method: 'POST',
          headers: jsonHdrs,
          body: JSON.stringify({ message, tree: treeData.sha, parents: [currentCommitSha] }),
        });
        const newCommitData = await newCommitRes.json();
        if (!newCommitRes.ok) return respond(newCommitRes.status, newCommitData);

        const updateRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
          method: 'PATCH',
          headers: jsonHdrs,
          body: JSON.stringify({ sha: newCommitData.sha }),
        });
        const updateData = await updateRes.json();
        if (!updateRes.ok) return respond(updateRes.status, updateData);

        return respond(200, { success: true, commit_sha: newCommitData.sha, files_committed: files.length });
      }

      // POST /repos/:owner/:repo/revert/:sha
      if (segments[3] === 'revert' && segments.length === 5 && method === 'POST') {
        const sha = segments[4];
        const { branch } = body;
        const hdrs = getHeaders();
        const jsonHdrs = { ...hdrs, 'Content-Type': 'application/json' };

        const commitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${sha}`, { headers: hdrs });
        const commitData = await commitRes.json();
        if (!commitRes.ok) return respond(commitRes.status, commitData);

        const parentSha = commitData.parents[0].sha;
        const parentRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${parentSha}`, { headers: hdrs });
        const parentData = await parentRes.json();

        const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: hdrs });
        const refData = await refRes.json();
        const currentHead = refData.object.sha;

        const revertRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
          method: 'POST',
          headers: jsonHdrs,
          body: JSON.stringify({
            message: `Revert "${commitData.message}"`,
            tree: parentData.tree.sha,
            parents: [currentHead],
          }),
        });
        const revertData = await revertRes.json();
        if (!revertRes.ok) return respond(revertRes.status, revertData);

        await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
          method: 'PATCH',
          headers: jsonHdrs,
          body: JSON.stringify({ sha: revertData.sha }),
        });

        return respond(200, { success: true, revert_commit_sha: revertData.sha });
      }

      // POST /repos/:owner/:repo/cherry-pick
      if (segments[3] === 'cherry-pick' && method === 'POST') {
        const { commitSha, targetBranch } = body;
        const hdrs = getHeaders();
        const jsonHdrs = { ...hdrs, 'Content-Type': 'application/json' };

        const commitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${commitSha}`, { headers: hdrs });
        const commitData = await commitRes.json();
        if (!commitRes.ok) return respond(commitRes.status, commitData);

        const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(targetBranch)}`, { headers: hdrs });
        const refData = await refRes.json();
        if (!refRes.ok) return respond(refRes.status, refData);
        const targetHead = refData.object.sha;

        const newCommitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
          method: 'POST',
          headers: jsonHdrs,
          body: JSON.stringify({
            message: `Cherry-pick: ${commitData.message}`,
            tree: commitData.tree.sha,
            parents: [targetHead],
          }),
        });
        const newCommitData = await newCommitRes.json();
        if (!newCommitRes.ok) return respond(newCommitRes.status, newCommitData);

        await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(targetBranch)}`, {
          method: 'PATCH',
          headers: jsonHdrs,
          body: JSON.stringify({ sha: newCommitData.sha }),
        });

        return respond(200, { success: true, new_commit_sha: newCommitData.sha });
      }

      // GET /repos/:owner/:repo/pulls/:number/files
      if (segments[3] === 'pulls' && segments.length === 6 && segments[5] === 'files' && method === 'GET') {
        const number = segments[4];
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}/files`, { headers: getHeaders() });
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/pulls/:number/reviews
      if (segments[3] === 'pulls' && segments.length === 6 && segments[5] === 'reviews' && method === 'GET') {
        const number = segments[4];
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}/reviews`, { headers: getHeaders() });
        const data = await response.json();
        return respond(response.status, data);
      }

      // POST /repos/:owner/:repo/pulls/:number/reviews
      if (segments[3] === 'pulls' && segments.length === 6 && segments[5] === 'reviews' && method === 'POST') {
        const number = segments[4];
        const { event: reviewEvent, body: reviewBody } = body;
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}/reviews`, {
          method: 'POST',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: reviewEvent, body: reviewBody }),
        });
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/pulls/:number/comments
      if (segments[3] === 'pulls' && segments.length === 6 && segments[5] === 'comments' && method === 'GET') {
        const number = segments[4];
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}/comments`, { headers: getHeaders() });
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/pulls/:number (single PR detail)
      if (segments[3] === 'pulls' && segments.length === 5 && method === 'GET') {
        const number = segments[4];
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}`, { headers: getHeaders() });
        const data = await response.json();
        return respond(response.status, data);
      }

      // POST /repos/:owner/:repo/pulls (create PR)
      if (segments[3] === 'pulls' && segments.length === 4 && method === 'POST') {
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
          method: 'POST',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/pulls (list PRs)
      if (segments[3] === 'pulls' && segments.length === 4 && method === 'GET') {
        const qs = new URLSearchParams();
        if (query.state) qs.set('state', query.state);
        qs.set('per_page', query.per_page || '30');
        if (query.page) qs.set('page', query.page);
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls?${qs}`, { headers: getHeaders() });
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/jobs/:jobId/logs
      if (segments[3] === 'jobs' && segments.length === 6 && segments[5] === 'logs' && method === 'GET') {
        const jobId = segments[4];
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
          headers: getHeaders(),
          redirect: 'follow',
        });
        const logs = await response.text();
        return respond(response.status, { logs });
      }

      // PUT /repos/:owner/:repo/contents/* (update file)
      if (segments[3] === 'contents' && method === 'PUT') {
        const contentPath = segments.slice(4).join('/');
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${contentPath}`, {
          method: 'PUT',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        return respond(response.status, data);
      }

      // GET /repos/:owner/:repo/contents/* (get file/directory)
      if (segments[3] === 'contents' && method === 'GET') {
        const contentPath = segments.slice(4).join('/');
        const qs = query.ref ? `?ref=${query.ref}` : '';
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${contentPath}${qs}`, { headers: getHeaders() });
        const data = await response.json();
        if (data.content) data.decoded = Buffer.from(data.content, 'base64').toString('utf8');
        return respond(response.status, data);
      }
    }

    return respond(404, { error: 'Not found' });
  } catch (err) {
    console.error('GitHub function error:', err.message);
    return respond(500, { error: err.message });
  }
};
