import { useState, useEffect, useMemo } from 'react';
import { Loader2, GitBranch, FolderOpen, File, Save, Search, BookOpen, Bug, ChevronRight, Plus, Upload, Eye, X } from 'lucide-react';
import { api, displayKey, typeLabel } from '../api';
import TicketRow from '../components/TicketRow';
import DiffViewer from '../components/DiffViewer';

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

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function makePatch(original, modified) {
  const oldLines = (original || '').split('\n');
  const newLines = (modified || '').split('\n');
  const lines = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  let added = 0, removed = 0;
  for (let i = 0; i < maxLen; i++) {
    const ol = i < oldLines.length ? oldLines[i] : undefined;
    const nl = i < newLines.length ? newLines[i] : undefined;
    if (ol === nl) {
      lines.push(' ' + (ol || ''));
    } else {
      if (ol !== undefined) { lines.push('-' + ol); removed++; }
      if (nl !== undefined) { lines.push('+' + nl); added++; }
    }
  }
  return { patch: lines.join('\n'), additions: added, deletions: removed };
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
  const [browseRepo, setBrowseRepo] = useState('');
  const [browseBranch, setBrowseBranch] = useState('');
  const [browseBranches, setBrowseBranches] = useState([]);
  const [tree, setTree] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState('');

  // File editor
  const [editingFile, setEditingFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [fileSha, setFileSha] = useState('');
  const [fileLoading, setFileLoading] = useState(false);

  // Staged changes
  const [stagedFiles, setStagedFiles] = useState({});
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null);
  const [showDiff, setShowDiff] = useState(false);

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
      if (typeFilter === 'story' && isDefect(t)) return false;
      if (typeFilter === 'defect' && !isDefect(t)) return false;
      if (statusFilter !== 'all' && t.fields?.status?.name !== statusFilter) return false;
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
    setStagedFiles({});
    setShowDiff(false);
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
        setBrowseRepo(selectedRepo);
        setBrowseBranch(branchName);
      }
    } catch {
      setBranchResult({ success: false, msg: 'Error creating branch' });
    }
    setBranchCreating(false);
  };

  // Load branches for file browser repo
  useEffect(() => {
    if (!browseRepo) { setBrowseBranches([]); return; }
    async function loadBranches() {
      try {
        const [o, r] = browseRepo.split('/');
        const b = await api.github.branches(o, r);
        setBrowseBranches(Array.isArray(b) ? b : []);
      } catch { setBrowseBranches([]); }
    }
    loadBranches();
  }, [browseRepo]);

  // Load tree when browse repo/branch changes
  useEffect(() => {
    if (!browseRepo || !browseBranch) { setTree([]); return; }
    async function loadTree() {
      setTreeLoading(true);
      try {
        const [o, r] = browseRepo.split('/');
        const res = await api.github.tree(o, r, browseBranch);
        setTree(res?.tree || []);
      } catch { setTree([]); }
      setTreeLoading(false);
      setCurrentPath('');
      setEditingFile(null);
      setFileContent('');
    }
    loadTree();
  }, [browseRepo, browseBranch]);

  // Get items for current directory
  const currentItems = useMemo(() => {
    if (tree.length === 0) return [];
    const prefix = currentPath ? currentPath + '/' : '';

    const folders = new Set();
    const files = [];

    for (const node of tree) {
      if (!node.path?.startsWith(prefix)) continue;
      const rest = node.path.substring(prefix.length);
      if (rest.includes('/')) {
        folders.add(rest.split('/')[0]);
      } else if (rest && node.type === 'blob') {
        files.push(node);
      }
    }

    const result = [];
    for (const f of [...folders].sort()) {
      result.push({ type: 'tree', name: f, path: prefix + f });
    }
    for (const f of files.sort((a, b) => a.path.localeCompare(b.path))) {
      const name = f.path.substring(prefix.length);
      result.push({ type: 'blob', name, path: f.path, sha: f.sha, size: f.size });
    }
    return result;
  }, [tree, currentPath]);

  // Breadcrumb segments
  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [];
    return currentPath.split('/');
  }, [currentPath]);

  const openFile = async (node) => {
    if (node.type === 'tree') {
      setCurrentPath(node.path);
      return;
    }
    // Check if file is already staged
    if (stagedFiles[node.path]) {
      setEditingFile(node.path);
      setFileContent(stagedFiles[node.path].modified);
      setOriginalContent(stagedFiles[node.path].original);
      setFileSha(stagedFiles[node.path].sha);
      return;
    }
    setFileLoading(true);
    setEditingFile(node.path);
    try {
      const [o, r] = browseRepo.split('/');
      const res = await api.github.blob(o, r, node.sha);
      const content = res?.decoded_content || '';
      setFileContent(content);
      setOriginalContent(content);
      setFileSha(node.sha);
    } catch {
      setFileContent('');
      setOriginalContent('');
      setFileSha('');
    }
    setFileLoading(false);
  };

  const navigateBreadcrumb = (idx) => {
    if (idx < 0) {
      setCurrentPath('');
    } else {
      setCurrentPath(breadcrumbs.slice(0, idx + 1).join('/'));
    }
  };

  const saveFile = () => {
    if (!editingFile) return;
    if (fileContent === originalContent) return;
    setStagedFiles(prev => ({
      ...prev,
      [editingFile]: { original: originalContent, modified: fileContent, sha: fileSha }
    }));
  };

  const unstageFile = (path) => {
    setStagedFiles(prev => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    if (editingFile === path) {
      setFileContent(originalContent);
    }
  };

  const stagedCount = Object.keys(stagedFiles).length;

  const commitAndPush = async () => {
    if (stagedCount === 0 || !commitMsg || !browseRepo || !browseBranch) return;
    setCommitting(true);
    setCommitResult(null);
    try {
      const [o, r] = browseRepo.split('/');
      const files = Object.entries(stagedFiles).map(([path, f]) => ({
        path,
        content: f.modified
      }));
      const res = await api.github.commitFiles(o, r, files, commitMsg, browseBranch);
      if (res) {
        setCommitResult({ success: true, msg: `Committed ${stagedCount} file(s) to ${browseBranch}` });
        setStagedFiles({});
        setOriginalContent(fileContent);
        // Refresh tree
        const treeRes = await api.github.tree(o, r, browseBranch);
        setTree(treeRes?.tree || []);
      } else {
        setCommitResult({ success: false, msg: 'Commit failed' });
      }
    } catch {
      setCommitResult({ success: false, msg: 'Error committing files' });
    }
    setCommitting(false);
  };

  // Build diff files for DiffViewer
  const diffFiles = useMemo(() => {
    return Object.entries(stagedFiles).map(([path, f]) => {
      const { patch, additions, deletions } = makePatch(f.original, f.modified);
      return { filename: path, patch, additions, deletions };
    });
  }, [stagedFiles]);

  const selectStyle = { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' };

  const isFileModified = editingFile && fileContent !== originalContent;
  const isFileStaged = editingFile && stagedFiles[editingFile];

  // Auto-suggest commit message from ticket
  const suggestedMsg = selectedTicket
    ? `feat: ${displayKey(selectedTicket)} ${(selectedTicket.fields?.summary || '').toLowerCase().substring(0, 60)}`
    : '';

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

              <div className="px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                Showing {filtered.length} of {tickets.length} tickets in {selectedVersion}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Branch creation ── */}
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

          {/* ═══════════════════════════════════════════════════════ */}
          {/* SECTION 1: FILE BROWSER                                 */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
                File Browser
              </div>
              <div className="flex items-center gap-2">
                <button className="px-2.5 py-1 rounded text-xs font-medium border-none cursor-pointer flex items-center gap-1"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  <Plus size={12} /> New File
                </button>
                <button className="px-2.5 py-1 rounded text-xs font-medium border-none cursor-pointer flex items-center gap-1"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  <Upload size={12} /> Upload
                </button>
              </div>
            </div>

            {/* Repo + Branch dropdowns */}
            <div className="flex gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Repository</label>
                <select className="w-full px-2.5 py-1.5 rounded text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  value={browseRepo} onChange={e => { setBrowseRepo(e.target.value); setBrowseBranch('main'); }}>
                  <option value="">Select...</option>
                  {repos.map(r => {
                    const full = r.full_name || `${r.owner?.login || ''}/${r.name || r}`;
                    return <option key={full} value={full}>{full}</option>;
                  })}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Branch</label>
                <select className="w-full px-2.5 py-1.5 rounded text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  value={browseBranch} onChange={e => setBrowseBranch(e.target.value)}>
                  <option value="">Select...</option>
                  {browseBranches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  {browseBranches.length === 0 && browseRepo && <option value="main">main</option>}
                </select>
              </div>
            </div>

            {/* Breadcrumb */}
            {browseRepo && browseBranch && (
              <div className="flex items-center gap-1 px-4 py-2 text-xs flex-wrap" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                <span className="cursor-pointer hover:underline" style={{ color: 'var(--accent)' }} onClick={() => navigateBreadcrumb(-1)}>
                  {browseRepo.split('/').pop()}
                </span>
                {breadcrumbs.map((seg, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <ChevronRight size={10} />
                    <span className="cursor-pointer hover:underline" style={{ color: i === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--accent)' }}
                      onClick={() => navigateBreadcrumb(i)}>
                      {seg}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* File list */}
            {treeLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
            ) : !browseRepo || !browseBranch ? (
              <div className="py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>Select a repository and branch to browse files</div>
            ) : currentItems.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>No files in this directory</div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {currentPath && (
                  <div className="flex items-center gap-2 px-4 py-2 text-xs cursor-pointer hover:bg-[var(--bg-secondary)]"
                    style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}
                    onClick={() => {
                      const parts = currentPath.split('/');
                      parts.pop();
                      setCurrentPath(parts.join('/'));
                    }}>
                    <FolderOpen size={12} /> ..
                  </div>
                )}
                {currentItems.map(item => (
                  <div key={item.path}
                    className="flex items-center gap-2 px-4 py-2 text-sm cursor-pointer hover:bg-[var(--bg-secondary)]"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: editingFile === item.path ? 'rgba(127,119,221,0.06)' : 'transparent'
                    }}
                    onClick={() => openFile(item)}>
                    {item.type === 'tree' ? (
                      <FolderOpen size={14} style={{ color: 'var(--info)' }} />
                    ) : (
                      <File size={14} style={{ color: 'var(--text-tertiary)' }} />
                    )}
                    <span className="flex-1 truncate" style={{ color: item.type === 'tree' ? 'var(--info)' : 'var(--text-primary)' }}>
                      {item.name}
                    </span>
                    {stagedFiles[item.path] && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--warning)' }} title="Modified" />
                    )}
                    {item.size != null && item.type === 'blob' && (
                      <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>{formatSize(item.size)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* SECTION 2: FILE EDITOR                                  */}
          {/* ═══════════════════════════════════════════════════════ */}
          {editingFile && (
            <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
                  <File size={14} style={{ color: 'var(--accent)' }} />
                  <span className="truncate" style={{ color: 'var(--text-primary)' }}>{editingFile}</span>
                  {isFileStaged && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0" style={{ background: 'rgba(210,153,34,0.15)', color: 'var(--warning)' }}>staged</span>
                  )}
                  {isFileModified && !isFileStaged && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0" style={{ background: 'rgba(127,119,221,0.15)', color: 'var(--accent)' }}>modified</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={saveFile}
                    disabled={!isFileModified || isFileStaged}
                    className="px-3 py-1.5 rounded text-xs font-medium border-none cursor-pointer flex items-center gap-1"
                    style={{
                      background: isFileModified && !isFileStaged ? 'var(--success)' : 'var(--bg-secondary)',
                      color: isFileModified && !isFileStaged ? 'white' : 'var(--text-tertiary)',
                      border: '1px solid var(--border)',
                      opacity: isFileModified && !isFileStaged ? 1 : 0.5
                    }}>
                    <Save size={12} /> Stage Changes
                  </button>
                  <button
                    onClick={() => { setEditingFile(null); setFileContent(''); }}
                    className="p-1.5 rounded border-none cursor-pointer"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
              {fileLoading ? (
                <div className="flex justify-center py-12"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
              ) : (
                <textarea
                  className="w-full h-80 p-4 font-mono text-xs resize-none border-none outline-none leading-5"
                  style={{ background: '#0D1117', color: '#E6EDF3' }}
                  value={fileContent}
                  onChange={e => setFileContent(e.target.value)}
                  placeholder="File content..."
                  spellCheck={false}
                />
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* SECTION 3: COMMIT PANEL                                 */}
          {/* ═══════════════════════════════════════════════════════ */}
          {(stagedCount > 0 || commitResult) && (
            <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <GitBranch size={14} style={{ color: 'var(--success)' }} />
                  Staged Changes ({stagedCount})
                </div>
                {stagedCount > 0 && (
                  <button onClick={() => setShowDiff(!showDiff)}
                    className="text-xs border-none bg-transparent cursor-pointer flex items-center gap-1"
                    style={{ color: 'var(--accent)' }}>
                    <Eye size={12} /> {showDiff ? 'Hide' : 'View'} Diff
                  </button>
                )}
              </div>

              {/* Staged file list */}
              {stagedCount > 0 && (
                <div style={{ borderBottom: '1px solid var(--border)' }}>
                  {Object.entries(stagedFiles).map(([path, f]) => {
                    const { additions, deletions } = makePatch(f.original, f.modified);
                    return (
                      <div key={path} className="flex items-center gap-2 px-4 py-2 text-xs" style={{ borderBottom: '1px solid var(--border)' }}>
                        <File size={12} style={{ color: 'var(--text-tertiary)' }} />
                        <span className="font-mono flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{path}</span>
                        <span style={{ color: 'var(--success)' }}>+{additions}</span>
                        <span style={{ color: 'var(--danger)' }}>-{deletions}</span>
                        <button onClick={() => unstageFile(path)}
                          className="text-xs border-none bg-transparent cursor-pointer"
                          style={{ color: 'var(--text-tertiary)' }}>
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Commit form */}
              {stagedCount > 0 && (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Commit message</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                      value={commitMsg}
                      onChange={e => setCommitMsg(e.target.value)}
                      placeholder={suggestedMsg || 'Describe your changes...'}
                    />
                    {suggestedMsg && !commitMsg && (
                      <button className="text-xs mt-1 border-none bg-transparent cursor-pointer"
                        style={{ color: 'var(--accent)' }}
                        onClick={() => setCommitMsg(suggestedMsg)}>
                        Use suggested: {suggestedMsg.substring(0, 50)}...
                      </button>
                    )}
                  </div>
                  <button onClick={commitAndPush} disabled={committing || !commitMsg}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-2"
                    style={{ background: 'var(--success)', color: 'white', opacity: committing || !commitMsg ? 0.5 : 1 }}>
                    {committing ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                    Commit & Push to {browseBranch}
                  </button>
                </div>
              )}

              {/* Commit result */}
              {commitResult && (
                <div className="px-4 pb-3 text-xs" style={{ color: commitResult.success ? 'var(--success)' : 'var(--danger)' }}>
                  {commitResult.msg}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* SECTION 4: DIFF VIEWER                                  */}
          {/* ═══════════════════════════════════════════════════════ */}
          {showDiff && diffFiles.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Eye size={14} style={{ color: 'var(--accent)' }} />
                Changes to commit
              </div>
              <DiffViewer files={diffFiles} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
