const API = '/api';

/* ── Jira ──────────────────────────────────────────────────────── */

export async function jiraSearch(jql, fields = [], maxResults = 50) {
  const res = await fetch(`${API}/jira/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jql, fields, maxResults }) });
  if (!res.ok) throw new Error(`jiraSearch failed: ${res.status}`);
  return res.json();
}

export async function jiraGet(path) {
  const res = await fetch(`${API}/jira${path}`);
  if (!res.ok) throw new Error(`jiraGet ${path} failed: ${res.status}`);
  return res.json();
}

export async function jiraPost(path, body) {
  const res = await fetch(`${API}/jira${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`jiraPost ${path} failed: ${res.status}`);
  return res.json();
}

/* ── GitHub ────────────────────────────────────────────────────── */

export async function getRepos() {
  const res = await fetch(`${API}/github/repos`);
  if (!res.ok) throw new Error(`getRepos failed: ${res.status}`);
  return res.json();
}

export async function getBranches(owner, repo) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/branches`);
  if (!res.ok) throw new Error(`getBranches failed: ${res.status}`);
  return res.json();
}

export async function getCommits(owner, repo, branch) {
  const qs = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/commits${qs}`);
  if (!res.ok) throw new Error(`getCommits failed: ${res.status}`);
  return res.json();
}

export async function compareBranches(owner, repo, base, head) {
  const qs = new URLSearchParams({ base, head });
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/compare?${qs}`);
  if (!res.ok) throw new Error(`compareBranches failed: ${res.status}`);
  return res.json();
}

export async function mergeBranches(owner, repo, base, head, commitMessage) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/merge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base, head, commit_message: commitMessage }) });
  return { status: res.status, data: await res.json() };
}

export async function getRuns(owner, repo) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/runs`);
  if (!res.ok) throw new Error(`getRuns failed: ${res.status}`);
  return res.json();
}

export async function getBuildHistory(params = {}) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${API}/github/build-history?${qs}`);
  if (!res.ok) throw new Error(`getBuildHistory failed: ${res.status}`);
  return res.json();
}

export async function getRunJobs(owner, repo, runId) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/runs/${runId}/jobs`);
  if (!res.ok) throw new Error(`getRunJobs failed: ${res.status}`);
  return res.json();
}

export async function getJobLogs(owner, repo, jobId) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/jobs/${jobId}/logs`);
  if (!res.ok) throw new Error(`getJobLogs failed: ${res.status}`);
  return res.text();
}

export async function getReadme(owner, repo) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/readme`);
  if (!res.ok) throw new Error(`getReadme failed: ${res.status}`);
  return res.json();
}

export async function getPulls(owner, repo) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/pulls`);
  if (!res.ok) throw new Error(`getPulls failed: ${res.status}`);
  return res.json();
}

/* ── Git Operations ────────────────────────────────────────────── */

export async function createBranch(owner, repo, branchName, fromBranch) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/branches/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchName, fromBranch }) });
  return res.json();
}

export async function getFileTree(owner, repo, ref) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/tree?ref=${encodeURIComponent(ref)}`);
  return res.json();
}

export async function getBlob(owner, repo, sha) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/blob/${sha}`);
  return res.json();
}

export async function commitMultipleFiles(owner, repo, files, message, branch) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/commit-multiple`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files, message, branch }) });
  return res.json();
}

export async function revertCommit(owner, repo, sha, branch) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/revert/${sha}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch }) });
  return res.json();
}

export async function cherryPick(owner, repo, commitSha, targetBranch) {
  const res = await fetch(`${API}/github/repos/${owner}/${repo}/cherry-pick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitSha, targetBranch }) });
  return res.json();
}

/* ── Discovery ─────────────────────────────────────────────────── */

export async function runDiscoveryScan() {
  const res = await fetch(`${API}/discovery/scan`, { method: 'POST' });
  return res.json();
}

export async function getQuickDiscovery() {
  const res = await fetch(`${API}/discovery/quick`);
  return res.json();
}

export async function getForgeOpsRepos() {
  const res = await fetch(`${API}/discovery/forgeops-repos`);
  if (!res.ok) throw new Error(`getForgeOpsRepos failed: ${res.status}`);
  return res.json();
}

/* ── SCA ───────────────────────────────────────────────────────── */

export async function runScaScan(owner, repo, base, head) {
  const res = await fetch(`${API}/sca/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner, repo, base, head }) });
  return res.json();
}

export async function getScaConfig() {
  const res = await fetch(`${API}/sca/config`);
  return res.json();
}

/* ── AI ────────────────────────────────────────────────────────── */

export async function analyzeTranscript(data) {
  const res = await fetch(`${API}/ai/analyze-transcript`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`analyzeTranscript failed: ${res.status}`);
  return res.json();
}

export async function aiCodeReview(diff, repo, branch) {
  const res = await fetch(`${API}/ai/code-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diff, repo, branch }) });
  if (!res.ok) throw new Error(`aiCodeReview failed: ${res.status}`);
  return res.json();
}

/* ── Teams ─────────────────────────────────────────────────────── */

export async function sendTeamsNotification(card) {
  const res = await fetch(`${API}/teams/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card) });
  if (!res.ok) throw new Error(`sendTeamsNotification failed: ${res.status}`);
  return res.json();
}

/* ── Support ───────────────────────────────────────────────────── */

export async function getTickets(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${API}/support/tickets?${qs}`);
  return res.json();
}

export async function getTicket(id) {
  const res = await fetch(`${API}/support/tickets/${id}`);
  return res.json();
}

export async function createTicket(data) {
  const res = await fetch(`${API}/support/tickets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return res.json();
}

export async function updateTicket(id, data) {
  const res = await fetch(`${API}/support/tickets/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return res.json();
}

export async function addTicketComment(id, author, text) {
  const res = await fetch(`${API}/support/tickets/${id}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author, text }) });
  return res.json();
}

export async function getTicketStats() {
  const res = await fetch(`${API}/support/stats`);
  return res.json();
}

export async function chatWithBot(message, context) {
  const res = await fetch(`${API}/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, context }) });
  return res.json();
}

/* ── Utilities ─────────────────────────────────────────────────── */

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

/* ── Display helpers ───────────────────────────────────────────── */

const TYPE_PREFIX = { Story: 'US', Bug: 'DEF', Task: 'TASK', Epic: 'EPIC', 'Sub-task': 'TASK' };

function isDefect(issue) {
  if (!issue) return false;
  const type = issue.fields?.issuetype?.name || '';
  if (type === 'Bug') return true;
  const summary = issue.fields?.summary || '';
  if (summary.startsWith('[Defect]')) return true;
  const labels = issue.fields?.labels || [];
  if (labels.includes('defect') || labels.includes('bug')) return true;
  return false;
}

export function displayKey(issue) {
  if (!issue) return '';
  const num = issue.key?.replace(/^[A-Z]+-/, '') || '?';
  if (isDefect(issue)) return `DEF-${num}`;
  const type = issue.fields?.issuetype?.name || '';
  return `${TYPE_PREFIX[type] || 'TASK'}-${num}`;
}

export function typeIcon(issue) {
  if (isDefect(issue)) return '\u{1F41E}';
  const type = issue?.fields?.issuetype?.name || '';
  switch (type) {
    case 'Story': return '\u{1F4D8}';
    case 'Task': return '\u2705';
    case 'Sub-task': return '\u{1F4CB}';
    case 'Epic': return '\u26A1';
    default: return '\u{1F4CC}';
  }
}

export function statusColor(status) {
  if (!status) return '#6b7280';
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return '#059669';
  if (s.includes('progress') || s.includes('review')) return '#0284c7';
  if (s.includes('block')) return '#dc2626';
  if (s.includes('test') || s.includes('qa')) return '#d97706';
  return '#6b7280';
}

export function priorityColor(priority) {
  if (!priority) return '#6b7280';
  const p = priority.toLowerCase();
  if (p.includes('highest') || p.includes('critical')) return '#dc2626';
  if (p.includes('high')) return '#f97316';
  if (p.includes('medium')) return '#d97706';
  if (p.includes('low')) return '#059669';
  return '#6b7280';
}
