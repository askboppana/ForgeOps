import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  getForgeOpsRepos, getBranches, getCommits, getFileTree, getBlob,
  createBranch, commitMultipleFiles, revertCommit, cherryPick,
  displayKey, typeIcon, timeAgo,
} from '../api';
import ALMSelector from '../components/ALMSelector';

/* ── Helpers ──────────────────────────────────────────────────── */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function slugify(text, max = 50) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max);
}

/* Simple syntax highlighting via regex */
function highlightCode(text) {
  if (!text) return '';
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return esc
    // comments: // ... and # ...
    .replace(/(\/\/.*$|#.*$)/gm, '<span style="color:#6a9955">$1</span>')
    // strings
    .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span style="color:#ce9178">$1</span>')
    // keywords
    .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|class|extends|new|async|await|try|catch|throw|switch|case|break|default|true|false|null|undefined|this|typeof|instanceof|in|of|do|yield|delete|void|with|finally|static|get|set|super)\b/g, '<span style="color:#c586c0">$1</span>')
    // numbers
    .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#b5cea8">$1</span>');
}

/* Build tree structure from flat list */
function buildTree(flatList) {
  const root = { name: '', children: {}, type: 'tree' };
  (flatList || []).forEach(item => {
    const parts = item.path.split('/');
    let node = root;
    parts.forEach((part, i) => {
      if (!node.children[part]) {
        node.children[part] = {
          name: part,
          children: {},
          type: i === parts.length - 1 ? item.type : 'tree',
          sha: i === parts.length - 1 ? item.sha : null,
          size: i === parts.length - 1 ? item.size : 0,
          path: parts.slice(0, i + 1).join('/'),
        };
      }
      node = node.children[part];
    });
  });
  return root;
}

/* ── Tree Node Component ─────────────────────────────────────── */

function TreeNode({ node, depth = 0, onFileClick, selectedPath }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === 'tree';
  const sorted = Object.values(node.children).sort((a, b) => {
    if (a.type === 'tree' && b.type !== 'tree') return -1;
    if (a.type !== 'tree' && b.type === 'tree') return 1;
    return a.name.localeCompare(b.name);
  });

  if (!isDir) {
    return (
      <div
        onClick={() => onFileClick(node)}
        style={{
          padding: '3px 8px 3px ' + (16 + depth * 16) + 'px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          borderRadius: 4,
          background: selectedPath === node.path ? 'var(--primary-bg)' : 'transparent',
          color: selectedPath === node.path ? 'var(--primary)' : 'var(--text)',
        }}
        className="tree-file-row"
      >
        <span style={{ opacity: 0.6 }}>{'\uD83D\uDCC4'}</span>
        <span style={{ flex: 1 }}>{node.name}</span>
        <span className="text-dim" style={{ fontSize: 10 }}>{formatBytes(node.size)}</span>
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '3px 8px 3px ' + (16 + depth * 16) + 'px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 4,
        }}
        className="tree-file-row"
      >
        <span style={{ fontSize: 10, width: 10, textAlign: 'center', opacity: 0.5 }}>{expanded ? '\u25BC' : '\u25B6'}</span>
        <span style={{ opacity: 0.6 }}>{'\uD83D\uDCC1'}</span>
        <span>{node.name}</span>
      </div>
      {expanded && sorted.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          onFileClick={onFileClick}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */

export default function Commit() {
  // Repo / branch state
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(true);

  // Branch creation
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [suggestedBranchName, setSuggestedBranchName] = useState('');
  const [branchBaseBranch, setBranchBaseBranch] = useState('main');
  const [branchRepo, setBranchRepo] = useState('');
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [branchToast, setBranchToast] = useState('');

  // File tree
  const [fileTree, setFileTree] = useState(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const treeData = useMemo(() => fileTree ? buildTree(fileTree) : null, [fileTree]);

  // Code editor
  const [openFile, setOpenFile] = useState(null); // {path, sha, size, name}
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isNewFile, setIsNewFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const editorRef = useRef(null);

  // Staged changes
  const [stagedFiles, setStagedFiles] = useState([]);

  // Commit form
  const [commitType, setCommitType] = useState('feat');
  const [commitDesc, setCommitDesc] = useState('');
  const [committing, setCommitting] = useState(false);
  const [activityLog, setActivityLog] = useState([]);

  // Commit history
  const [commits, setCommits] = useState([]);
  const [loadingCommits, setLoadingCommits] = useState(false);

  // Modals
  const [cherryPickModal, setCherryPickModal] = useState(null);
  const [cherryPickTarget, setCherryPickTarget] = useState('');
  const [revertConfirm, setRevertConfirm] = useState(null);

  const owner = selectedRepo.split('/')[0] || '';
  const repo = selectedRepo.split('/')[1] || '';

  function log(msg, status = 'info') {
    setActivityLog(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, status }]);
  }

  /* ── Load repos ─────────────────────────────────────────────── */

  useEffect(() => {
    getForgeOpsRepos()
      .then(data => {
        const list = (data?.repos || []).map(r => ({
          full: r.full_name,
          name: r.name,
        }));
        setRepos(list);
        if (list.length > 0) {
          setSelectedRepo(list[0].full);
          setBranchRepo(list[0].full);
        }
      })
      .catch(() => setRepos([]))
      .finally(() => setLoadingRepos(false));
  }, []);

  /* ── Load branches when repo changes ────────────────────────── */

  useEffect(() => {
    if (!owner || !repo) return;
    getBranches(owner, repo)
      .then(data => {
        const b = (Array.isArray(data) ? data : []).map(br => br.name);
        setBranches(b);
        if (b.includes('main')) setSelectedBranch('main');
        else if (b.length > 0) setSelectedBranch(b[0]);
      })
      .catch(() => setBranches([]));
  }, [selectedRepo]);

  /* ── Load file tree when branch changes ─────────────────────── */

  useEffect(() => {
    if (!owner || !repo || !selectedBranch) return;
    setLoadingTree(true);
    setOpenFile(null);
    setFileContent('');
    getFileTree(owner, repo, selectedBranch)
      .then(data => setFileTree(data.tree || []))
      .catch(() => setFileTree([]))
      .finally(() => setLoadingTree(false));

    // Also load commits
    setLoadingCommits(true);
    getCommits(owner, repo, selectedBranch)
      .then(data => setCommits(Array.isArray(data) ? data.slice(0, 20) : []))
      .catch(() => setCommits([]))
      .finally(() => setLoadingCommits(false));
  }, [selectedBranch, selectedRepo]);

  /* ── Ticket selection -> branch name ────────────────────────── */

  useEffect(() => {
    if (!selectedTicket) { setSuggestedBranchName(''); return; }
    const key = displayKey(selectedTicket);
    const summary = selectedTicket.fields?.summary || '';
    setSuggestedBranchName('feature/' + slugify(key + '-' + summary));
  }, [selectedTicket]);

  /* ── File click handler ─────────────────────────────────────── */

  const handleFileClick = useCallback(async (node) => {
    if (node.type === 'tree') return;
    setOpenFile(node);
    setEditMode(false);
    setIsNewFile(false);
    setLoadingFile(true);
    try {
      const data = await getBlob(owner, repo, node.sha);
      setFileContent(data.content || '');
      setOriginalContent(data.content || '');
    } catch {
      setFileContent('// Error loading file');
      setOriginalContent('');
    }
    setLoadingFile(false);
  }, [owner, repo]);

  /* ── New file handler ───────────────────────────────────────── */

  function handleNewFile() {
    setOpenFile(null);
    setIsNewFile(true);
    setNewFilePath('');
    setFileContent('');
    setOriginalContent('');
    setEditMode(true);
  }

  /* ── Stage file ─────────────────────────────────────────────── */

  function stageCurrentFile() {
    const path = isNewFile ? newFilePath : openFile?.path;
    if (!path) return;
    const existing = stagedFiles.findIndex(f => f.path === path);
    const entry = {
      path,
      content: fileContent,
      sha: isNewFile ? null : openFile?.sha,
      isNew: isNewFile,
    };
    if (existing >= 0) {
      setStagedFiles(prev => prev.map((f, i) => i === existing ? entry : f));
    } else {
      setStagedFiles(prev => [...prev, entry]);
    }
    setEditMode(false);
  }

  /* ── Upload files ──────────────────────────────────────────── */

  function handleFileUpload(fileList) {
    Array.from(fileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        const path = file.webkitRelativePath || file.name;
        setStagedFiles(prev => {
          const existing = prev.findIndex(f => f.path === path);
          const entry = { path, content, sha: null, isNew: true, uploaded: true };
          if (existing >= 0) return prev.map((f, i) => i === existing ? entry : f);
          return [...prev, entry];
        });
      };
      reader.readAsText(file);
    });
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
  }

  /* ── Create branch ──────────────────────────────────────────── */

  async function handleCreateBranch() {
    if (!suggestedBranchName || !branchRepo) return;
    setCreatingBranch(true);
    setBranchToast('');
    try {
      const [o, r] = branchRepo.split('/');
      const result = await createBranch(o, r, suggestedBranchName, branchBaseBranch);
      if (result.success) {
        setBranchToast('Branch ' + suggestedBranchName + ' created');
        // If same repo, refresh branches and select new one
        if (branchRepo === selectedRepo) {
          const data = await getBranches(o, r);
          const b = (Array.isArray(data) ? data : []).map(br => br.name);
          setBranches(b);
          setSelectedBranch(suggestedBranchName);
        }
      } else {
        setBranchToast('Error: ' + (result.message || 'Failed to create branch'));
      }
    } catch (err) {
      setBranchToast('Error: ' + err.message);
    }
    setCreatingBranch(false);
    setTimeout(() => setBranchToast(''), 5000);
  }

  /* ── Commit staged files ────────────────────────────────────── */

  async function handleCommit() {
    if (stagedFiles.length === 0 || !selectedBranch) return;
    const ticketPrefix = selectedTicket ? '[' + displayKey(selectedTicket) + '] ' : '';
    const fullMessage = ticketPrefix + commitType + ': ' + commitDesc;
    if (!commitDesc.trim()) return;

    setCommitting(true);
    setActivityLog([]);
    log('Committing ' + stagedFiles.length + ' file(s) to ' + selectedBranch + '...');

    stagedFiles.forEach(f => {
      log('Creating blob for ' + f.path + '...');
    });

    log('Creating tree with ' + stagedFiles.length + ' blob(s)...');
    log('Creating commit: ' + fullMessage);

    try {
      const result = await commitMultipleFiles(
        owner, repo,
        stagedFiles.map(f => ({ path: f.path, content: f.content })),
        fullMessage,
        selectedBranch
      );
      if (result.success) {
        log('Committed! SHA: ' + result.commit_sha.slice(0, 7), 'success');
        setStagedFiles([]);
        setCommitDesc('');
        // Refresh tree and commits
        const treeData2 = await getFileTree(owner, repo, selectedBranch);
        setFileTree(treeData2.tree || []);
        const commitsData = await getCommits(owner, repo, selectedBranch);
        setCommits(Array.isArray(commitsData) ? commitsData.slice(0, 20) : []);
      } else {
        log('Commit failed: ' + (result.message || JSON.stringify(result)), 'error');
      }
    } catch (err) {
      log('Commit failed: ' + err.message, 'error');
    }
    setCommitting(false);
  }

  /* ── Revert ─────────────────────────────────────────────────── */

  async function handleRevert(commitSha) {
    setRevertConfirm(null);
    log('Reverting commit ' + commitSha.slice(0, 7) + '...');
    try {
      const result = await revertCommit(owner, repo, commitSha, selectedBranch);
      if (result.success) {
        log('Reverted! New SHA: ' + result.revert_commit_sha.slice(0, 7), 'success');
        const commitsData = await getCommits(owner, repo, selectedBranch);
        setCommits(Array.isArray(commitsData) ? commitsData.slice(0, 20) : []);
      } else {
        log('Revert failed: ' + (result.message || JSON.stringify(result)), 'error');
      }
    } catch (err) {
      log('Revert failed: ' + err.message, 'error');
    }
  }

  /* ── Cherry-pick ────────────────────────────────────────────── */

  async function handleCherryPick() {
    if (!cherryPickModal || !cherryPickTarget) return;
    const sha = cherryPickModal;
    setCherryPickModal(null);
    log('Cherry-picking ' + sha.slice(0, 7) + ' to ' + cherryPickTarget + '...');
    try {
      const result = await cherryPick(owner, repo, sha, cherryPickTarget);
      if (result.success) {
        log('Cherry-picked! New SHA: ' + result.new_commit_sha.slice(0, 7), 'success');
      } else {
        log('Cherry-pick failed: ' + (result.message || JSON.stringify(result)), 'error');
      }
    } catch (err) {
      log('Cherry-pick failed: ' + err.message, 'error');
    }
  }

  /* ── Tab key in editor ──────────────────────────────────────── */

  function handleEditorKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const newVal = val.substring(0, start) + '  ' + val.substring(end);
      setFileContent(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }

  /* ── Breadcrumb for file path ───────────────────────────────── */

  const fileBreadcrumb = openFile ? openFile.path.split('/') : isNewFile ? ['New File'] : [];

  /* ── Diff indicator: changed lines ──────────────────────────── */

  const isModified = fileContent !== originalContent;
  const commitMessagePreview = (selectedTicket ? '[' + displayKey(selectedTicket) + '] ' : '') + commitType + ': ' + (commitDesc || '...');

  const hasFileOpen = openFile || isNewFile;

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div className="animate-fade">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {'\u270F\uFE0F'} Commit
        </h1>
        <p className="text-dim" style={{ margin: '4px 0 0', fontSize: 13 }}>
          Create branches, edit files, and commit changes
        </p>
      </div>

      {/* ── SECTION 1: Branch Creation ──────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{'\uD83C\uDF3F'}</span>
          <span style={{ fontWeight: 600 }}>Create Branch from Ticket</span>
        </div>
        <div style={{ padding: 16 }}>
          <ALMSelector compact requireRelease onTicketSelect={setSelectedTicket} />

          {selectedTicket && (
            <div className="animate-fade" style={{ marginTop: 16, padding: 16, background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                Selected: <strong style={{ color: 'var(--primary)' }}>{displayKey(selectedTicket)}</strong> {selectedTicket.fields?.summary}
              </div>

              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Branch Name</label>
                  <input
                    type="text"
                    value={suggestedBranchName}
                    onChange={e => setSuggestedBranchName(e.target.value)}
                    placeholder="feature/us-301-add-login-page"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Base Branch</label>
                  <select value={branchBaseBranch} onChange={e => setBranchBaseBranch(e.target.value)}>
                    {['main', 'development', 'int', 'qa'].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                    {branches.filter(b => !['main', 'development', 'int', 'qa'].includes(b)).map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Repository</label>
                  <select value={branchRepo} onChange={e => setBranchRepo(e.target.value)}>
                    {repos.map(r => (
                      <option key={r.full} value={r.full}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleCreateBranch}
                disabled={creatingBranch || !suggestedBranchName}
              >
                {creatingBranch ? 'Creating...' : 'Create Branch'}
              </button>

              {branchToast && (
                <div
                  className="animate-fade"
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius)',
                    fontSize: 12,
                    fontWeight: 600,
                    background: branchToast.startsWith('Error') ? 'rgba(220,38,38,0.1)' : 'rgba(5,150,105,0.1)',
                    color: branchToast.startsWith('Error') ? 'var(--error)' : 'var(--success)',
                    border: '1px solid ' + (branchToast.startsWith('Error') ? 'var(--error)' : 'var(--success)'),
                  }}
                >
                  {branchToast.startsWith('Error') ? '\u274C' : '\u2705'} {branchToast}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Repo/Branch selector ────────────────────────────────── */}
      <div className="form-row" style={{ marginBottom: 16 }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Repository</label>
          {loadingRepos ? (
            <div className="text-dim text-sm">Loading...</div>
          ) : (
            <select value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)}>
              {repos.map(r => (
                <option key={r.full} value={r.full}>{r.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Branch</label>
          <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
            {branches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Two-panel layout ────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>

        {/* Left: File Tree */}
        <div
          className="card"
          style={{
            width: hasFileOpen ? 300 : '100%',
            minWidth: hasFileOpen ? 300 : undefined,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{'\uD83D\uDCC1'} Files</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-sm" onClick={handleNewFile} title="New file">+ New</button>
              <button className="btn btn-sm" onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.onchange = () => handleFileUpload(inp.files); inp.click(); }} title="Upload files">{'\uD83D\uDCE4'} Upload</button>
            </div>
          </div>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
            onDragLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            onDrop={e => { handleDrop(e); e.currentTarget.style.background = 'transparent'; }}
            style={{ flex: 1, overflowY: 'auto', padding: '4px 0', minHeight: 100, position: 'relative' }}
          >
            {loadingTree ? (
              <div className="loading-center" style={{ padding: 20 }}><span className="spinner" /> Loading tree...</div>
            ) : treeData ? (
              Object.values(treeData.children).sort((a, b) => {
                if (a.type === 'tree' && b.type !== 'tree') return -1;
                if (a.type !== 'tree' && b.type === 'tree') return 1;
                return a.name.localeCompare(b.name);
              }).map(child => (
                <TreeNode
                  key={child.path}
                  node={child}
                  onFileClick={handleFileClick}
                  selectedPath={openFile?.path}
                />
              ))
            ) : (
              <div className="empty-state" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12 }}>Select a repo and branch to browse files</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>or drag & drop files here to upload</div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Editor + Staged + Commit */}
        {hasFileOpen && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            {/* ── Code Editor Card ─────────────────────────────── */}
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Breadcrumb */}
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  {isNewFile ? (
                    <input
                      type="text"
                      value={newFilePath}
                      onChange={e => setNewFilePath(e.target.value)}
                      placeholder="path/to/file.js"
                      style={{ fontSize: 12, padding: '2px 8px', minWidth: 250 }}
                    />
                  ) : (
                    fileBreadcrumb.map((part, i) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && <span className="text-dim">/</span>}
                        <span style={{ fontWeight: i === fileBreadcrumb.length - 1 ? 600 : 400 }}>{part}</span>
                      </span>
                    ))
                  )}
                  {isModified && editMode && (
                    <span className="badge" style={{ background: 'rgba(217,119,6,0.15)', color: '#d97706', marginLeft: 8, fontSize: 10 }}>Modified</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {editMode && isModified && (
                    <button className="btn btn-sm btn-primary" onClick={stageCurrentFile}>Stage Changes</button>
                  )}
                  <button
                    className={'btn btn-sm' + (editMode ? ' btn-primary' : '')}
                    onClick={() => setEditMode(!editMode)}
                  >
                    {editMode ? 'Editing' : 'Edit'}
                  </button>
                </div>
              </div>

              {/* Editor area */}
              <div style={{
                flex: 1,
                background: '#0d1117',
                borderRadius: '0 0 var(--radius) var(--radius)',
                overflow: 'auto',
                position: 'relative',
                minHeight: 300,
              }}>
                {loadingFile ? (
                  <div style={{ padding: 20, color: '#8b949e' }}><span className="spinner" /> Loading...</div>
                ) : editMode ? (
                  <div style={{ display: 'flex', minHeight: '100%' }}>
                    {/* Line numbers */}
                    <div style={{
                      padding: '12px 0',
                      color: '#484f58',
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                      textAlign: 'right',
                      userSelect: 'none',
                      borderRight: '1px solid #21262d',
                      minWidth: 44,
                      lineHeight: '20px',
                    }}>
                      {fileContent.split('\n').map((_, i) => (
                        <div key={i} style={{ padding: '0 8px' }}>{i + 1}</div>
                      ))}
                    </div>
                    <textarea
                      ref={editorRef}
                      value={fileContent}
                      onChange={e => setFileContent(e.target.value)}
                      onKeyDown={handleEditorKeyDown}
                      spellCheck={false}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        color: '#c9d1d9',
                        border: 'none',
                        outline: 'none',
                        resize: 'none',
                        padding: '12px',
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                        lineHeight: '20px',
                        whiteSpace: 'pre',
                        overflowWrap: 'normal',
                        overflowX: 'auto',
                        minHeight: 300,
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', minHeight: '100%' }}>
                    {/* Line numbers */}
                    <div style={{
                      padding: '12px 0',
                      color: '#484f58',
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                      textAlign: 'right',
                      userSelect: 'none',
                      borderRight: '1px solid #21262d',
                      minWidth: 44,
                      lineHeight: '20px',
                    }}>
                      {fileContent.split('\n').map((_, i) => (
                        <div key={i} style={{ padding: '0 8px' }}>{i + 1}</div>
                      ))}
                    </div>
                    <pre style={{
                      flex: 1,
                      margin: 0,
                      padding: '12px',
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                      lineHeight: '20px',
                      color: '#c9d1d9',
                      overflow: 'auto',
                    }}
                    dangerouslySetInnerHTML={{ __html: highlightCode(fileContent) }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ── Staged Changes ───────────────────────────────── */}
            {stagedFiles.length > 0 && (
              <div className="card">
                <div className="card-header" style={{ fontWeight: 600, fontSize: 13 }}>
                  Staged Changes ({stagedFiles.length})
                </div>
                <div style={{ padding: '8px 16px' }}>
                  {stagedFiles.map((f, i) => (
                    <div
                      key={f.path}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 0',
                        borderBottom: i < stagedFiles.length - 1 ? '1px solid var(--border)' : 'none',
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: 'var(--success)' }}>{'\uD83D\uDFE2'}</span>
                      <span style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{f.path}</span>
                      <span className="badge" style={{
                        background: f.isNew ? 'rgba(5,150,105,0.15)' : 'rgba(217,119,6,0.15)',
                        color: f.isNew ? 'var(--success)' : '#d97706',
                        fontSize: 10,
                      }}>
                        {f.isNew ? 'new file' : 'modified'}
                      </span>
                      <button
                        className="btn btn-sm"
                        style={{ fontSize: 10, padding: '2px 6px' }}
                        onClick={() => setStagedFiles(prev => prev.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Commit Form ──────────────────────────────────── */}
            {stagedFiles.length > 0 && (
              <div className="card">
                <div className="card-header" style={{ fontWeight: 600, fontSize: 13 }}>
                  Commit to {selectedBranch}
                </div>
                <div style={{ padding: 16 }}>
                  <div className="form-row" style={{ marginBottom: 12 }}>
                    <div className="form-group" style={{ width: 120 }}>
                      <label>Type</label>
                      <select value={commitType} onChange={e => setCommitType(e.target.value)}>
                        {['feat', 'fix', 'chore', 'refactor', 'test', 'docs'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Description</label>
                      <input
                        type="text"
                        value={commitDesc}
                        onChange={e => setCommitDesc(e.target.value)}
                        placeholder="add login page component"
                      />
                    </div>
                  </div>

                  <div style={{
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    marginBottom: 12,
                    color: 'var(--text-dim)',
                  }}>
                    Preview: <strong style={{ color: 'var(--text)' }}>{commitMessagePreview}</strong>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={handleCommit}
                    disabled={committing || !commitDesc.trim()}
                  >
                    {committing ? 'Committing...' : 'Commit to ' + selectedBranch}
                  </button>
                </div>

                {/* Activity Log */}
                {activityLog.length > 0 && (
                  <div style={{
                    borderTop: '1px solid var(--border)',
                    padding: 16,
                    maxHeight: 200,
                    overflowY: 'auto',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    background: '#0d1117',
                    borderRadius: '0 0 var(--radius) var(--radius)',
                  }}>
                    {activityLog.map((entry, i) => (
                      <div key={i} style={{
                        padding: '3px 0',
                        color: entry.status === 'success' ? '#3fb950' : entry.status === 'error' ? '#f85149' : '#8b949e',
                      }}>
                        <span style={{ color: '#484f58', marginRight: 8 }}>{entry.time}</span>
                        <span>{entry.status === 'success' ? '\u2705' : entry.status === 'error' ? '\u274C' : '\u25B6'} {entry.msg}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── STAGED CHANGES & COMMIT (always visible when files staged) ── */}
      {stagedFiles.length > 0 && !hasFileOpen && (
        <div style={{ marginTop: 16, display: 'flex', gap: 16 }}>
          <div className="card" style={{ flex: 1 }}>
            <div className="card-header" style={{ fontWeight: 600, fontSize: 13 }}>
              Staged Changes ({stagedFiles.length})
            </div>
            <div>
              {stagedFiles.map((f, i) => (
                <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 12, borderBottom: i < stagedFiles.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ color: f.isNew ? 'var(--success)' : 'var(--warn)' }}>{f.isNew ? '\uD83D\uDFE2' : '\uD83D\uDFE1'}</span>
                  <span style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{f.path}</span>
                  <span className="badge" style={{ background: f.uploaded ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)', color: f.uploaded ? 'var(--primary)' : 'var(--success)', fontSize: 9 }}>{f.uploaded ? 'uploaded' : f.isNew ? 'new' : 'modified'}</span>
                  <button className="btn btn-sm" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setStagedFiles(prev => prev.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="card-header" style={{ fontWeight: 600, fontSize: 13 }}>Commit to {selectedBranch}</div>
            <div style={{ padding: 16 }}>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ width: 120 }}>
                  <label>Type</label>
                  <select value={commitType} onChange={e => setCommitType(e.target.value)}>
                    {['feat', 'fix', 'chore', 'refactor', 'test', 'docs'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Description</label>
                  <input type="text" value={commitDesc} onChange={e => setCommitDesc(e.target.value)} placeholder="add login page component" />
                </div>
              </div>
              <div style={{ padding: '8px 12px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 12, color: 'var(--text-dim)' }}>
                Preview: <strong style={{ color: 'var(--text)' }}>{commitMessagePreview}</strong>
              </div>
              <button className="btn btn-primary" onClick={handleCommit} disabled={committing || !commitDesc.trim()}>
                {committing ? 'Committing...' : `Commit ${stagedFiles.length} file(s) to ${selectedBranch}`}
              </button>
            </div>
            {activityLog.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', padding: 16, maxHeight: 200, overflowY: 'auto', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", background: '#0d1117', borderRadius: '0 0 var(--radius) var(--radius)' }}>
                {activityLog.map((entry, i) => (
                  <div key={i} style={{ padding: '3px 0', color: entry.status === 'success' ? '#3fb950' : entry.status === 'error' ? '#f85149' : '#8b949e' }}>
                    <span style={{ color: '#484f58', marginRight: 8 }}>{entry.time}</span>
                    {entry.status === 'success' ? '\u2705' : entry.status === 'error' ? '\u274C' : '\u25B6'} {entry.msg}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SECTION 6: Commit History ───────────────────────────── */}
      {selectedBranch && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header" style={{ fontWeight: 600, fontSize: 13 }}>
            Commit History ({selectedBranch})
          </div>
          {loadingCommits ? (
            <div className="loading-center" style={{ padding: 20 }}><span className="spinner" /> Loading commits...</div>
          ) : commits.length === 0 ? (
            <div className="empty-state">No commits found</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-dim)' }}>SHA</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-dim)' }}>Message</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-dim)' }}>Author</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-dim)' }}>Time</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-dim)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {commits.map(c => {
                    const sha = c.sha || '';
                    const msg = c.commit?.message || '';
                    const author = c.commit?.author?.name || c.author?.login || '';
                    const date = c.commit?.author?.date || '';
                    return (
                      <tr key={sha} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--primary)' }}>
                          {sha.slice(0, 7)}
                        </td>
                        <td style={{ padding: '10px 14px', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {msg.split('\n')[0]}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>{author}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>{timeAgo(date)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm"
                              style={{ fontSize: 10, padding: '2px 8px' }}
                              onClick={() => setRevertConfirm(sha)}
                            >
                              Revert
                            </button>
                            <button
                              className="btn btn-sm"
                              style={{ fontSize: 10, padding: '2px 8px' }}
                              onClick={() => { setCherryPickModal(sha); setCherryPickTarget(''); }}
                            >
                              Cherry-pick
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Revert Confirmation Dialog ──────────────────────────── */}
      {revertConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}
          onClick={() => setRevertConfirm(null)}
        >
          <div className="card" style={{ width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div className="card-header" style={{ fontWeight: 600 }}>Confirm Revert</div>
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: 13, marginBottom: 16 }}>
                Are you sure you want to revert commit <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{revertConfirm.slice(0, 7)}</strong> on branch <strong>{selectedBranch}</strong>?
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setRevertConfirm(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" style={{ background: 'var(--error)', borderColor: 'var(--error)' }} onClick={() => handleRevert(revertConfirm)}>Revert</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Cherry-pick Modal ──────────────────────────────────── */}
      {cherryPickModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}
          onClick={() => setCherryPickModal(null)}
        >
          <div className="card" style={{ width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div className="card-header" style={{ fontWeight: 600 }}>Cherry-pick Commit</div>
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: 13, marginBottom: 12 }}>
                Cherry-pick <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{cherryPickModal.slice(0, 7)}</strong> to:
              </p>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Target Branch</label>
                <select value={cherryPickTarget} onChange={e => setCherryPickTarget(e.target.value)}>
                  <option value="">Select branch...</option>
                  {branches.filter(b => b !== selectedBranch).map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setCherryPickModal(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" disabled={!cherryPickTarget} onClick={handleCherryPick}>Cherry-pick</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Activity Log (bottom) ──────────────────────────────── */}
      {activityLog.length > 0 && !hasFileOpen && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header" style={{ fontWeight: 600, fontSize: 13 }}>Activity Log</div>
          <div style={{
            padding: 16,
            maxHeight: 200,
            overflowY: 'auto',
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            background: '#0d1117',
            borderRadius: '0 0 var(--radius) var(--radius)',
          }}>
            {activityLog.map((entry, i) => (
              <div key={i} style={{
                padding: '3px 0',
                color: entry.status === 'success' ? '#3fb950' : entry.status === 'error' ? '#f85149' : '#8b949e',
              }}>
                <span style={{ color: '#484f58', marginRight: 8 }}>{entry.time}</span>
                <span>{entry.status === 'success' ? '\u2705' : entry.status === 'error' ? '\u274C' : '\u25B6'} {entry.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* hover style for tree rows */}
      <style>{`
        .tree-file-row:hover {
          background: var(--surface) !important;
        }
      `}</style>
    </div>
  );
}
