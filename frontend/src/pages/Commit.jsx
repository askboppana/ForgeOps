import { useState, useEffect } from 'react';
import { Loader2, GitBranch, FolderOpen, File, Save, ChevronRight } from 'lucide-react';
import { api, displayKey } from '../api';
import TicketRow from '../components/TicketRow';

export default function Commit() {
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);

  // Branch creation
  const [repos, setRepos] = useState([]);
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

  useEffect(() => {
    async function loadData() {
      try {
        const v = await api.jira.versions();
        setVersions(v || []);
      } catch {}
      try {
        // Try fast repo list first
        const r = await api.github.repos();
        const list = Array.isArray(r) ? r : [];
        setRepos(list);
      } catch {
        setRepos([]);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedVersion) { setTickets([]); return; }
    async function loadTickets() {
      setTicketLoading(true);
      try {
        const jql = `fixVersion = "${selectedVersion}" ORDER BY priority DESC, updated DESC`;
        const res = await api.jira.searchAll(jql);
        setTickets(res?.issues || []);
      } catch {
        setTickets([]);
      }
      setTicketLoading(false);
    }
    loadTickets();
  }, [selectedVersion]);

  const handleSelectTicket = (issue) => {
    setSelectedTicket(issue);
    const key = displayKey(issue);
    setBranchName(`feature/${key.toLowerCase()}`);
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
    } catch {
      setFileContent('');
    }
  };

  const commitFile = async () => {
    if (!editingFile || !commitMsg || !selectedRepo || !branchName) return;
    setCommitting(true);
    try {
      const [owner, repo] = selectedRepo.split('/');
      const res = await api.github.commitFiles(owner, repo, [{ path: editingFile, content: btoa(fileContent) }], commitMsg, branchName);
      setCommitResult(res ? { success: true, msg: 'Committed successfully' } : { success: false, msg: 'Commit failed' });
    } catch {
      setCommitResult({ success: false, msg: 'Error committing' });
    }
    setCommitting(false);
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Commit</h1>

      {/* Release selector */}
      <div className="mb-6">
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Release Version</label>
        <select
          className="w-full max-w-xs px-3 py-2 rounded-lg text-sm border-none outline-none"
          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          value={selectedVersion}
          onChange={(e) => { setSelectedVersion(e.target.value); setSelectedTicket(null); }}
        >
          <option value="">Select a release...</option>
          {versions.map((v) => (
            <option key={v.id || v.name} value={v.name}>{v.name}</option>
          ))}
        </select>
      </div>

      {/* Tickets */}
      {selectedVersion && (
        <div className="rounded-lg overflow-hidden mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 text-sm font-semibold" style={{ borderBottom: '1px solid var(--border)' }}>
            Tickets in {selectedVersion}
          </div>
          {ticketLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>No tickets found for this release</div>
          ) : (
            tickets.map((t) => (
              <TicketRow key={t.key} issue={t} onClick={handleSelectTicket} />
            ))
          )}
        </div>
      )}

      {/* Branch + File editor */}
      {selectedTicket && (
        <div className="space-y-4">
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <GitBranch size={16} style={{ color: 'var(--accent)' }} />
              Create Branch for {displayKey(selectedTicket)}
            </div>
            <div className="flex gap-3 mb-3">
              <select
                className="px-3 py-2 rounded-lg text-sm flex-1"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                value={selectedRepo}
                onChange={(e) => setSelectedRepo(e.target.value)}
              >
                <option value="">Select repository...</option>
                {repos.map((r) => {
                  const full = r.full_name || `${r.owner || ''}/${r.name || r}`;
                  return <option key={full} value={full}>{full}</option>;
                })}
              </select>
              <input
                className="px-3 py-2 rounded-lg text-sm flex-1 border-none outline-none"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Branch name"
              />
              <button
                onClick={createBranch}
                disabled={branchCreating || !selectedRepo || !branchName}
                className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer shrink-0 flex items-center gap-2"
                style={{ background: 'var(--accent)', color: 'white', opacity: branchCreating ? 0.6 : 1 }}
              >
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

          {/* File browser */}
          {tree.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-3 text-sm font-semibold flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
                  Files
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {tree.filter((n) => n.type === 'blob').slice(0, 50).map((n) => (
                    <div
                      key={n.sha}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer"
                      style={{
                        color: editingFile === n.path ? 'var(--accent)' : 'var(--text-secondary)',
                        background: editingFile === n.path ? 'rgba(127,119,221,0.08)' : 'transparent',
                      }}
                      onClick={() => openFile(n)}
                    >
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
                <textarea
                  className="w-full h-64 p-4 font-mono text-xs resize-none border-none outline-none"
                  style={{ background: '#0D1117', color: 'var(--text-primary)' }}
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  placeholder="File content will appear here..."
                />
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <input
                    className="flex-1 px-3 py-2 rounded-lg text-sm border-none outline-none"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    value={commitMsg}
                    onChange={(e) => setCommitMsg(e.target.value)}
                    placeholder="Commit message..."
                  />
                  <button
                    onClick={commitFile}
                    disabled={committing || !editingFile || !commitMsg}
                    className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-2"
                    style={{ background: 'var(--success)', color: 'white', opacity: committing ? 0.6 : 1 }}
                  >
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
