import { useState, useEffect, useMemo } from 'react';
import { Loader2, GitBranch, FolderOpen, File, Save, Search, BookOpen, Bug } from 'lucide-react';
import { api, displayKey, typeLabel } from '../api';
import TicketRow from '../components/TicketRow';

const MOCK_REPOS_FALLBACK = [
  { name: 'ForgeOps', full_name: 'askboppana/ForgeOps' },
  { name: 'admin-dashboard-web', full_name: 'askboppana/admin-dashboard-web' },
  { name: 'auth-service', full_name: 'askboppana/auth-service' },
  { name: 'java-svc-payments', full_name: 'company/java-svc-payments' },
  { name: 'spring-boot-orders', full_name: 'company/spring-boot-orders' },
  { name: 'react-customer-portal', full_name: 'company/react-customer-portal' },
  { name: 'node-api-gateway', full_name: 'company/node-api-gateway' },
  { name: 'py-data-pipeline', full_name: 'company/py-data-pipeline' },
  { name: 'dotnet-billing', full_name: 'company/dotnet-billing' },
  { name: 'uipath-bot-invoicing', full_name: 'company/uipath-bot-invoicing' },
  { name: 'sf-apex-triggers', full_name: 'company/sf-apex-triggers' },
  { name: 'informatica-etl-pipeline', full_name: 'company/informatica-etl-pipeline' },
  { name: 'rpa-expense-processor', full_name: 'company/rpa-expense-processor' },
  { name: 'devops-scripts', full_name: 'company/devops-scripts' },
  { name: 'infrastructure-config', full_name: 'company/infrastructure-config' },
];

function isDefect(issue) {
  const tp = issue?.fields?.issuetype?.name || '';
  const summary = issue?.fields?.summary || '';
  const labels = issue?.fields?.labels || [];
  return tp === 'Bug' || summary.startsWith('[Defect]') || labels.includes('defect') || labels.includes('bug');
}

export default function Commit() {
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketLoading, setTicketLoading] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchText, setSearchText] = useState('');

  // Branch creation
  const [repos, setRepos] = useState([]);
  const [repoError, setRepoError] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchCreating, setBranchCreating] = useState(false);
  const [branchResult, setBranchResult] = useState(null);

  // File browser
  const [tree, setTree] = useState([]);
  const [fileContent, setFileContent] = useState('');
  const [editingFile, setEditingFile] = useState(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null);

  // Load versions + repos on mount
  useEffect(() => {
    async function loadData() {
      try { setVersions((await api.jira.versions()) || []); } catch {}
      try {
        const r = await api.github.repos();
        const list = Array.isArray(r) ? r : [];
        setRepos(list.length > 0 ? list : MOCK_REPOS_FALLBACK);
        setRepoError(false);
      } catch {
        setRepos(MOCK_REPOS_FALLBACK);
        setRepoError(true);
      }
    }
    loadData();
  }, []);

  // Load tickets when release changes
  useEffect(() => {
    if (!selectedVersion) { setTickets([]); return; }
    async function loadTickets() {
      setTicketLoading(true);
      try {
        const jql = `fixVersion = "${selectedVersion}" ORDER BY priority DESC, updated DESC`;
        const res = await api.jira.searchAll(jql);
        setTickets(res?.issues || []);
      } catch { setTickets([]); }
      setTicketLoading(false);
    }
    loadTickets();
  }, [selectedVersion]);

  // Derived: unique statuses, filtered + grouped tickets
  const uniqueStatuses = useMemo(() => {
    const set = new Set();
    tickets.forEach(t => { const s = t.fields?.status?.name; if (s) set.add(s); });
    return [...set].sort();
  }, [tickets]);

  const filtered = useMemo(() => {
    return tickets.filter(t => {
      // Type filter
      if (typeFilter === 'story' && isDefect(t)) return false;
      if (typeFilter === 'defect' && !isDefect(t)) return false;
      // Status filter
      if (statusFilter !== 'all' && t.fields?.status?.name !== statusFilter) return false;
      // Search
      if (searchText) {
        const q = searchText.toLowerCase();
        const key = (t.key || '').toLowerCase();
        const dk = displayKey(t).toLowerCase();
        const summary = (t.fields?.summary || '').toLowerCase();
        if (!key.includes(q) && !dk.includes(q) && !summary.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, typeFilter, statusFilter, searchText]);

  const stories = filtered.filter(t => !isDefect(t));
  const defects = filtered.filter(t => isDefect(t));

  const handleSelectTicket = (issue) => {
    setSelectedTicket(issue);
    setBranchName(`feature/${displayKey(issue).toLowerCase()}`);
    setBranchResult(null);
    setCommitResult(null);
    setTree([]);
    setEditingFile(null);
  };

  const createBranch = async () => {
    if (!selectedRepo || !branchName) return;
    setBranchCreating(true);
    setBranchResult(null);
    try {
      const [owner, repo] = selectedRepo.split('/');
      const res = await api.github.createBranch(owner, repo, branchName, 'main');
      setBranchResult(res ? { success: true, msg: `Branch "${branchName}" created` } : { success: false, msg: 'Failed to create branch' });
      if (res) {
        const t = await api.github.tree(owner, repo, branchName);
        setTree(t?.tree || []);
      }
    } catch {
      setBranchResult({ success: false, msg: 'Error creating branch' });
    }
    setBranchCreating(false);
  };

  const openFile = async (node) => {
    if (node.type !== 'blob') return;
    try {
      const [owner, repo] = selectedRepo.split('/');
      const res = await api.github.blob(owner, repo, node.sha);
      setEditingFile(node.path);
      setFileContent(res?.content ? atob(res.content) : res?.decoded || '');
    } catch { setFileContent(''); }
  };

  const commitFile = async () => {
    if (!editingFile || !commitMsg || !selectedRepo || !branchName) return;
    setCommitting(true);
    try {
      const [owner, repo] = selectedRepo.split('/');
      const res = await api.github.commitFiles(owner, repo, [{ path: editingFile, content: btoa(fileContent) }], commitMsg, branchName);
      setCommitResult(res ? { success: true, msg: 'Committed successfully' } : { success: false, msg: 'Commit failed' });
    } catch { setCommitResult({ success: false, msg: 'Error committing' }); }
    setCommitting(false);
  };

  const selectStyle = { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Commit</h1>

      {/* ── Filters row ── */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="min-w-[200px]">
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Release</label>
          <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={selectStyle}
            value={selectedVersion} onChange={e => { setSelectedVersion(e.target.value); setSelectedTicket(null); setTypeFilter('all'); setStatusFilter('all'); setSearchText(''); }}>
            <option value="">Select a release...</option>
            {versions.map(v => <option key={v.id || v.name} value={v.name}>{v.name}</option>)}
          </select>
        </div>

        {selectedVersion && (
          <>
            <div className="min-w-[140px]">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Type</label>
              <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={selectStyle}
                value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="all">All types</option>
                <option value="story">Stories only</option>
                <option value="defect">Defects only</option>
              </select>
            </div>

            <div className="min-w-[160px]">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Status</label>
              <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={selectStyle}
                value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                <input className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none" style={selectStyle}
                  placeholder="Filter by key or summary..." value={searchText} onChange={e => setSearchText(e.target.value)} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Grouped ticket list ── */}
      {selectedVersion && (
        <div className="rounded-lg overflow-hidden mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {ticketLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {tickets.length === 0 ? 'No tickets found for this release' : 'No tickets match the current filters'}
            </div>
          ) : (
            <>
              {/* Stories section */}
              {(typeFilter === 'all' || typeFilter === 'story') && stories.length > 0 && (
                <>
                  <div className="px-4 py-2.5 flex items-center gap-2 text-xs font-semibold tracking-wide"
                    style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', color: 'var(--info)' }}>
                    <BookOpen size={13} />
                    Stories ({stories.length})
                  </div>
                  {stories.map(t => <TicketRow key={t.key} issue={t} onClick={handleSelectTicket} />)}
                </>
              )}

              {/* Defects section */}
              {(typeFilter === 'all' || typeFilter === 'defect') && defects.length > 0 && (
                <>
                  <div className="px-4 py-2.5 flex items-center gap-2 text-xs font-semibold tracking-wide"
                    style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', borderTop: stories.length > 0 ? '1px solid var(--border)' : 'none', color: 'var(--danger)' }}>
                    <Bug size={13} />
                    Defects ({defects.length})
                  </div>
                  {defects.map(t => <TicketRow key={t.key} issue={t} onClick={handleSelectTicket} />)}
                </>
              )}

              {/* Footer count */}
              <div className="px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                Showing {filtered.length} of {tickets.length} tickets in {selectedVersion}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Branch + File editor (unchanged) ── */}
      {selectedTicket && (
        <div className="space-y-4">
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <GitBranch size={16} style={{ color: 'var(--accent)' }} />
              Create Branch for {displayKey(selectedTicket)}
            </div>
            <div className="flex gap-3 mb-3">
              <select className="px-3 py-2 rounded-lg text-sm flex-1" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)}>
                <option value="">Select repository...</option>
                {repoError && <option disabled>Unable to load repos</option>}
                {repos.map(r => {
                  const full = r.full_name || `${r.owner?.login || r.owner || ''}/${r.name || r}`;
                  return <option key={full} value={full}>{full}</option>;
                })}
              </select>
              <input className="px-3 py-2 rounded-lg text-sm flex-1 outline-none" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="Branch name" />
              <button onClick={createBranch} disabled={branchCreating || !selectedRepo || !branchName}
                className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer shrink-0 flex items-center gap-2"
                style={{ background: 'var(--accent)', color: 'white', opacity: branchCreating ? 0.6 : 1 }}>
                {branchCreating && <Loader2 size={14} className="animate-spin" />}
                Create Branch
              </button>
            </div>
            {branchResult && (
              <div className="text-xs px-3 py-1.5 rounded" style={{ color: branchResult.success ? 'var(--success)' : 'var(--danger)', background: branchResult.success ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)' }}>
                {branchResult.msg}
              </div>
            )}
          </div>

          {tree.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-3 text-sm font-semibold flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
                  Files
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {tree.filter(n => n.type === 'blob').slice(0, 50).map(n => (
                    <div key={n.sha} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer"
                      style={{ color: editingFile === n.path ? 'var(--accent)' : 'var(--text-secondary)', background: editingFile === n.path ? 'rgba(127,119,221,0.08)' : 'transparent' }}
                      onClick={() => openFile(n)}>
                      <File size={12} />
                      <span className="truncate">{n.path}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-3 text-sm font-semibold" style={{ borderBottom: '1px solid var(--border)' }}>
                  {editingFile || 'Select a file to edit'}
                </div>
                <textarea className="w-full h-64 p-4 font-mono text-xs resize-none border-none outline-none"
                  style={{ background: '#0D1117', color: '#E6EDF3' }} value={fileContent} onChange={e => setFileContent(e.target.value)} placeholder="File content will appear here..." />
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <input className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    value={commitMsg} onChange={e => setCommitMsg(e.target.value)} placeholder="Commit message..." />
                  <button onClick={commitFile} disabled={committing || !editingFile || !commitMsg}
                    className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-2"
                    style={{ background: 'var(--success)', color: 'white', opacity: committing ? 0.6 : 1 }}>
                    {committing ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Commit
                  </button>
                </div>
                {commitResult && (
                  <div className="px-4 pb-3 text-xs" style={{ color: commitResult.success ? 'var(--success)' : 'var(--danger)' }}>
                    {commitResult.msg}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
