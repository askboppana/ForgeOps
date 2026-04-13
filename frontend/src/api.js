const API = '/api';

async function get(url) {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; }
  catch { return null; }
}

async function post(url, data) {
  try { const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) }); return r.ok ? await r.json() : null; }
  catch { return null; }
}

async function put(url, data) {
  try { const r = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) }); return r.ok ? await r.json() : null; }
  catch { return null; }
}

export const api = {
  health: () => get(`${API}/health`),
  jira: {
    myself: () => get(`${API}/jira/myself`),
    search: (jql, fields, max=100) => post(`${API}/jira/search`, { jql, fields, maxResults: max }),
    searchAll: (jql, fields) => get(`${API}/jira/search-all?jql=${encodeURIComponent(jql)}&fields=${fields||'summary,status,priority,issuetype,fixVersions,assignee'}`),
    getIssue: (key) => get(`${API}/jira/issue/${key}`),
    getTransitions: (key) => get(`${API}/jira/issue/${key}/transitions`),
    transition: (key, id) => post(`${API}/jira/issue/${key}/transition`, { transitionId: id }),
    createIssue: (data) => post(`${API}/jira/issue`, data),
    updateIssue: (key, fields) => put(`${API}/jira/issue/${key}`, { fields }),
    getComments: (key) => get(`${API}/jira/issue/${key}/comment`),
    addComment: (key, body) => post(`${API}/jira/issue/${key}/comment`, { body }),
    versions: () => get(`${API}/jira/versions`),
    releaseCounts: () => get(`${API}/jira/release-counts`),
    tickets: (params) => get(`${API}/jira/tickets?${new URLSearchParams(params)}`),
  },
  github: {
    repos: () => get(`${API}/github/repos`),
    branches: (o,r) => get(`${API}/github/repos/${o}/${r}/branches`),
    commits: (o,r,b) => get(`${API}/github/repos/${o}/${r}/commits${b?'?branch='+encodeURIComponent(b):''}`),
    compare: (o,r,base,head) => get(`${API}/github/repos/${o}/${r}/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`),
    pulls: (o,r) => get(`${API}/github/repos/${o}/${r}/pulls`),
    merge: (o,r,base,head,msg) => post(`${API}/github/repos/${o}/${r}/merge`, { base, head, commit_message: msg }),
    runs: (o,r) => get(`${API}/github/repos/${o}/${r}/runs`),
    tree: (o,r,ref) => get(`${API}/github/repos/${o}/${r}/tree?ref=${encodeURIComponent(ref)}`),
    blob: (o,r,sha) => get(`${API}/github/repos/${o}/${r}/blob/${sha}`),
    readme: (o,r) => get(`${API}/github/repos/${o}/${r}/readme`),
    createBranch: (o,r,name,from) => post(`${API}/github/repos/${o}/${r}/branches/create`, { branchName: name, fromBranch: from }),
    commitFiles: (o,r,files,msg,branch) => post(`${API}/github/repos/${o}/${r}/commit-multiple`, { files, message: msg, branch }),
    updateFile: (o,r,path,content,sha,msg,branch) => put(`${API}/github/repos/${o}/${r}/contents/${path}`, { content, sha, message: msg, branch }),
    runJobs: (o,r,runId) => get(`${API}/github/repos/${o}/${r}/runs/${runId}/jobs`),
    buildHistory: (params) => get(`${API}/github/build-history?${new URLSearchParams(params||{})}`),
    environments: () => get(`${API}/github/environments`),
  },
  discovery: {
    quick: () => get(`${API}/discovery/quick`),
    forgeopsRepos: () => get(`${API}/discovery/forgeops-repos`),
    scan: () => post(`${API}/discovery/scan`, {}),
  },
  ai: {
    chat: (message, context) => post(`${API}/ai/chat`, { message, context }),
    analyzeTranscript: (data) => post(`${API}/ai/analyze-transcript`, data),
    codeReview: (diff, repo, branch) => post(`${API}/ai/code-review`, { diff, repo, branch }),
    rootCause: (logs, error) => post(`${API}/ai/root-cause`, { logs, error }),
    changelog: (tickets) => post(`${API}/ai/changelog`, { tickets }),
    prDescription: (diff, commits) => post(`${API}/ai/pr-description`, { diff, commits }),
  },
  sca: {
    scan: (o,r,base,head) => post(`${API}/sca/scan`, { owner:o, repo:r, base, head }),
    config: () => get(`${API}/sca/config`),
  },
  teams: { notify: (card) => post(`${API}/teams/notify`, card) },
  support: {
    tickets: (params) => get(`${API}/support/tickets?${new URLSearchParams(params||{})}`),
    ticket: (id) => get(`${API}/support/tickets/${id}`),
    create: (data) => post(`${API}/support/tickets`, data),
    update: (id, data) => put(`${API}/support/tickets/${id}`, data),
    comment: (id, author, text) => post(`${API}/support/tickets/${id}/comment`, { author, text }),
    stats: () => get(`${API}/support/stats`),
  },
};

// Display helpers — NEVER show "SCRUM" in UI
export function displayKey(issue) {
  if (!issue?.key) return '';
  const num = issue.key.replace(/^[A-Z]+-/, '');
  const type = issue.fields?.issuetype?.name || '';
  const summary = issue.fields?.summary || '';
  const labels = issue.fields?.labels || [];
  const isDefect = type === 'Bug' || summary.startsWith('[Defect]') || labels.includes('defect') || labels.includes('bug');
  if (isDefect) return `DEF-${num}`;
  if (type === 'Story') return `US-${num}`;
  if (type === 'Epic') return `EPIC-${num}`;
  return `TASK-${num}`;
}

export function typeLabel(issue) {
  if (!issue) return 'Task';
  const type = issue.fields?.issuetype?.name || '';
  const summary = issue.fields?.summary || '';
  const labels = issue.fields?.labels || [];
  if (type === 'Bug' || summary.startsWith('[Defect]') || labels.includes('defect')) return 'Defect';
  if (type === 'Story') return 'Story';
  if (type === 'Epic') return 'Epic';
  return 'Task';
}

export function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('done') || s.includes('deployed') || s.includes('closed')) return 'var(--success)';
  if (s.includes('progress') || s.includes('review')) return 'var(--info)';
  if (s.includes('ready') || s.includes('sit') || s.includes('uat') || s.includes('test')) return 'var(--warning)';
  if (s.includes('fail') || s.includes('block') || s.includes('reject')) return 'var(--danger)';
  return 'var(--text-tertiary)';
}

export function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}
