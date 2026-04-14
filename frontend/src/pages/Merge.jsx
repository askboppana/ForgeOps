import { useState, useEffect, useMemo } from 'react';
import { Loader2, GitMerge, GitCommit, Shield, CheckCircle2, XCircle, AlertTriangle, Clock, Check, X, MessageSquare, RotateCcw } from 'lucide-react';
import { api, timeAgo } from '../api';
import DiffViewer from '../components/DiffViewer';
import LogViewer from '../components/LogViewer';

const MOCK_REPOS_FALLBACK = [
  { name: 'ForgeOps', full_name: 'askboppana/ForgeOps' },
  { name: 'admin-dashboard-web', full_name: 'askboppana/admin-dashboard-web' },
  { name: 'auth-service', full_name: 'askboppana/auth-service' },
];

const MR_STORAGE_KEY = 'axops_merge_requests';

const FLOW_STEPS = [
  { id: 'select', label: 'Select commits' },
  { id: 'sca', label: 'SCA scan' },
  { id: 'approval', label: 'Approval' },
  { id: 'merge', label: 'Merge' },
];

function FlowBar({ current }) {
  const idx = FLOW_STEPS.findIndex(s => s.id === current);
  const isRejected = current === 'rejected';
  return (
    <div className="flex items-center gap-2 mb-6">
      {FLOW_STEPS.map((step, i) => {
        const done = i < idx || current === 'merged';
        const active = step.id === current || (current === 'merged' && i === 3);
        const rejected = isRejected && i === 2;
        let bg = 'var(--bg-secondary)';
        let color = 'var(--text-tertiary)';
        let border = '1px solid var(--border)';
        if (done) { bg = 'rgba(63,185,80,0.12)'; color = 'var(--success)'; border = '1px solid rgba(63,185,80,0.3)'; }
        else if (rejected) { bg = 'rgba(248,81,73,0.12)'; color = 'var(--danger)'; border = '1px solid var(--danger)'; }
        else if (active) { bg = 'rgba(210,153,34,0.12)'; color = 'var(--warning)'; border = '1.5px dashed var(--warning)'; }
        return (
          <div key={step.id} className="flex items-center gap-2">
            {i > 0 && <span style={{ color: 'var(--border)', fontSize: 10 }}>→</span>}
            <span className="px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1" style={{ background: bg, color, border }}>
              {done && <Check size={10} />}
              {rejected && <X size={10} />}
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Merge() {
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [branches, setBranches] = useState([]);
  const [baseBranch, setBaseBranch] = useState('main');
  const [headBranch, setHeadBranch] = useState('');
  const [loading, setLoading] = useState(false);

  const [commits, setCommits] = useState([]);
  const [diff, setDiff] = useState(null);
  const [compareError, setCompareError] = useState(null);
  const [scaResult, setScaResult] = useState(null);
  const [scaLoading, setScaLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState(null);
  const [activityLog, setActivityLog] = useState([]);

  // New state
  const [mergeStep, setMergeStep] = useState('select');
  const [mergeMode, setMergeMode] = useState('full');
  const [selectedCommits, setSelectedCommits] = useState(new Set());
  const [commitFileCache, setCommitFileCache] = useState({});
  const [approvalComment, setApprovalComment] = useState('');
  const [mergeRequests, setMergeRequests] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MR_STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [activeMR, setActiveMR] = useState(null);

  const saveMRs = (mrs) => { setMergeRequests(mrs); localStorage.setItem(MR_STORAGE_KEY, JSON.stringify(mrs)); };

  // Load repos
  useEffect(() => {
    (async () => {
      try {
        const r = await api.github.repos();
        const list = Array.isArray(r) ? r : r?.repos || [];
        setRepos(list.length > 0 ? list : MOCK_REPOS_FALLBACK);
      } catch { setRepos(MOCK_REPOS_FALLBACK); }
    })();
  }, []);

  // Load branches
  useEffect(() => {
    if (!selectedRepo) return;
    (async () => {
      try {
        const [o, r] = selectedRepo.split('/');
        const b = await api.github.branches(o, r);
        setBranches(Array.isArray(b) ? b : []);
      } catch { setBranches([]); }
    })();
  }, [selectedRepo]);

  const resetState = () => {
    setDiff(null); setCommits([]); setScaResult(null); setMergeResult(null);
    setCompareError(null); setMergeStep('select'); setSelectedCommits(new Set());
    setCommitFileCache({}); setActiveMR(null); setApprovalComment('');
  };

  // Compare
  const compare = async () => {
    if (!selectedRepo || !baseBranch || !headBranch) return;
    setLoading(true);
    resetState();
    setActivityLog([]);
    try {
      const [o, r] = selectedRepo.split('/');
      const res = await api.github.compare(o, r, baseBranch, headBranch);
      if (res?.error) {
        setCompareError(res.error);
        addLog('ERROR', `Compare failed: ${res.error}`);
      } else {
        setCommits(res?.commits || []);
        setDiff(res);
        addLog('INFO', `Compared ${headBranch} against ${baseBranch}: ${res?.ahead_by || 0} commit(s), ${res?.files?.length || 0} file(s) changed`);
        if (res?.ahead_by === 0) addLog('INFO', 'Branches are identical — nothing to merge');
      }
    } catch {
      setCompareError('Failed to load comparison');
      addLog('ERROR', 'Failed to load comparison');
    }
    setLoading(false);
  };

  // Toggle commit selection
  const toggleCommit = (sha) => {
    setSelectedCommits(prev => {
      const next = new Set(prev);
      next.has(sha) ? next.delete(sha) : next.add(sha);
      return next;
    });
  };

  const selectAllCommits = () => setSelectedCommits(new Set(commits.map(c => c.sha)));
  const clearCommits = () => setSelectedCommits(new Set());

  // Fetch files for a single commit (for cherry-pick diff)
  const fetchCommitFiles = async (sha) => {
    if (commitFileCache[sha]) return commitFileCache[sha];
    try {
      const [o, r] = selectedRepo.split('/');
      const res = await api.github.commitDetail(o, r, sha);
      const files = res?.files || [];
      setCommitFileCache(prev => ({ ...prev, [sha]: files }));
      return files;
    } catch { return []; }
  };

  // Cherry-pick filtered files
  const cherryPickFiles = useMemo(() => {
    if (mergeMode !== 'cherry-pick' || selectedCommits.size === 0) return [];
    const fileMap = {};
    for (const sha of selectedCommits) {
      const files = commitFileCache[sha] || [];
      for (const f of files) {
        const key = f.filename || f.path;
        if (key && !fileMap[key]) fileMap[key] = f;
      }
    }
    return Object.values(fileMap);
  }, [mergeMode, selectedCommits, commitFileCache]);

  // Load files when commits are selected in cherry-pick mode
  useEffect(() => {
    if (mergeMode !== 'cherry-pick') return;
    for (const sha of selectedCommits) {
      if (!commitFileCache[sha]) fetchCommitFiles(sha);
    }
  }, [selectedCommits, mergeMode]);

  const displayFiles = mergeMode === 'cherry-pick' && selectedCommits.size > 0 ? cherryPickFiles : (diff?.files || []);
  const totalAdditions = displayFiles.reduce((a, f) => a + (f.additions || 0), 0);
  const totalDeletions = displayFiles.reduce((a, f) => a + (f.deletions || 0), 0);

  // SCA scan
  const runSca = async () => {
    if (!selectedRepo) return;
    setScaLoading(true);
    try {
      const [o, r] = selectedRepo.split('/');
      const res = await api.sca.scan(o, r, baseBranch, headBranch);
      setScaResult(res);
      const vulns = res?.vulnerabilities?.length || res?.findings?.length || 0;
      const criticals = (res?.vulnerabilities || res?.findings || []).filter(v => v.severity === 'CRITICAL').length;
      addLog(vulns > 0 ? 'WARN' : 'INFO', `SCA scan complete: ${vulns} finding(s)`);
      if (criticals === 0) setMergeStep('sca');
    } catch {
      addLog('ERROR', 'SCA scan failed');
    }
    setScaLoading(false);
  };

  // Submit for approval
  const submitForApproval = () => {
    const mr = {
      id: 'MR-' + (mergeRequests.length + 1),
      repo: selectedRepo,
      source: headBranch,
      target: baseBranch,
      mode: mergeMode,
      commits: mergeMode === 'cherry-pick' ? Array.from(selectedCommits) : 'all',
      commitDetails: commits.filter(c => mergeMode === 'full' || selectedCommits.has(c.sha)).map(c => ({
        sha: c.sha, message: c.commit?.message || '', author: c.commit?.author?.name || ''
      })),
      files: displayFiles.map(f => f.filename || f.path || ''),
      scaStatus: 'passed',
      status: 'pending',
      createdAt: new Date().toISOString(),
      approvers: [
        { role: 'Dev lead', name: 'ashwin', status: 'pending', comment: '', timestamp: null },
        { role: 'QA lead', name: 'priya', status: 'pending', comment: '', timestamp: null },
      ],
    };
    const updated = [mr, ...mergeRequests].slice(0, 20);
    saveMRs(updated);
    setActiveMR(mr);
    setMergeStep('approval');
    addLog('WARN', `Merge request ${mr.id} submitted for approval`);
  };

  // Approve
  const doApprove = async () => {
    if (!activeMR) return;
    const updated = { ...activeMR };
    const pending = updated.approvers.find(a => a.status === 'pending');
    if (!pending) return;
    pending.status = 'approved';
    pending.timestamp = new Date().toISOString();
    pending.comment = approvalComment;
    addLog('INFO', `Approved by ${pending.name} (${pending.role})`);
    setApprovalComment('');

    const allApproved = updated.approvers.every(a => a.status === 'approved');
    if (allApproved) {
      updated.status = 'approved';
      setActiveMR(updated);
      saveMRs(mergeRequests.map(m => m.id === updated.id ? updated : m));
      addLog('INFO', 'All approvals received — executing merge');
      await executeMerge(updated);
    } else {
      setActiveMR(updated);
      saveMRs(mergeRequests.map(m => m.id === updated.id ? updated : m));
    }
  };

  // Reject
  const doReject = () => {
    if (!activeMR || !approvalComment.trim()) return;
    const updated = { ...activeMR };
    const pending = updated.approvers.find(a => a.status === 'pending');
    if (!pending) return;
    pending.status = 'rejected';
    pending.timestamp = new Date().toISOString();
    pending.comment = approvalComment;
    updated.status = 'rejected';
    setActiveMR(updated);
    setMergeStep('rejected');
    saveMRs(mergeRequests.map(m => m.id === updated.id ? updated : m));
    addLog('ERROR', `Rejected by ${pending.name} (${pending.role}): ${approvalComment}`);
    addLog('ERROR', 'Merge rejected. Code was NOT merged.');
    setMergeResult({ success: false, msg: `Merge rejected: ${approvalComment}` });
    setApprovalComment('');
  };

  // Execute merge
  const executeMerge = async (mr) => {
    setMerging(true);
    setMergeResult(null);
    try {
      const [o, r] = selectedRepo.split('/');

      if (mr.mode === 'cherry-pick' && Array.isArray(mr.commits)) {
        let merged = 0;
        for (const sha of mr.commits) {
          try {
            const res = await api.github.merge(o, r, baseBranch, sha, `Cherry-pick ${sha.substring(0, 7)} via ForgeOps`);
            const d = res?.data;
            if (d?.success) {
              addLog('INFO', `Cherry-picked ${sha.substring(0, 7)} → ${baseBranch}`);
              merged++;
            } else if (d?.conflict) {
              addLog('ERROR', `Conflict cherry-picking ${sha.substring(0, 7)} — remaining commits skipped`);
              setMergeResult({ success: false, conflict: true, msg: `Conflict on commit ${sha.substring(0, 7)}` });
              break;
            } else {
              addLog('ERROR', `Failed to cherry-pick ${sha.substring(0, 7)}: ${d?.message || 'unknown'}`);
            }
          } catch {
            addLog('ERROR', `Error cherry-picking ${sha.substring(0, 7)}`);
          }
        }
        if (!mergeResult) {
          addLog('INFO', `Merge completed. ${merged} commit(s) merged.`);
          setMergeResult({ success: true, msg: `Cherry-picked ${merged} commit(s) into ${baseBranch}` });
          setMergeStep('merged');
        }
      } else {
        const msg = `Merge ${headBranch} into ${baseBranch} via ForgeOps`;
        const res = await api.github.merge(o, r, baseBranch, headBranch, msg);
        const d = res?.data;
        if (d?.success) {
          setMergeResult({ success: true, msg: d.message || `Merged ${headBranch} into ${baseBranch}`, sha: d.sha || '' });
          addLog('INFO', `Merged ${headBranch} into ${baseBranch}${d.sha ? ` (${d.sha.substring(0, 7)})` : ''}`);
          addLog('INFO', `Merge completed. ${commits.length} commit(s) merged.`);
          setMergeStep('merged');
        } else if (d?.conflict) {
          setMergeResult({ success: false, conflict: true, msg: 'Merge conflict — resolve manually in GitHub' });
          addLog('ERROR', 'Merge conflict detected');
        } else {
          setMergeResult({ success: false, msg: d?.message || 'Merge failed' });
          addLog('ERROR', d?.message || 'Merge failed');
        }
      }
    } catch {
      setMergeResult({ success: false, msg: 'Error during merge' });
      addLog('ERROR', 'Merge error');
    }
    // Update MR status
    if (mr) {
      const finalMR = { ...mr, status: mergeResult?.success !== false ? 'approved' : mr.status };
      saveMRs(mergeRequests.map(m => m.id === finalMR.id ? finalMR : m));
    }
    setMerging(false);
  };

  // Re-submit a rejected MR
  const resubmitMR = (mr) => {
    if (mr.repo) setSelectedRepo(mr.repo);
    setHeadBranch(mr.source || '');
    setBaseBranch(mr.target || 'main');
    if (mr.mode === 'cherry-pick' && Array.isArray(mr.commits)) {
      setMergeMode('cherry-pick');
      setSelectedCommits(new Set(mr.commits));
    } else {
      setMergeMode('full');
    }
    setMergeStep('select');
    setActiveMR(null);
    setMergeResult(null);
    addLog('INFO', `Re-submitting ${mr.id}`);
  };

  const addLog = (level, message) => {
    setActivityLog(prev => [...prev, { time: new Date().toLocaleTimeString(), level, message }]);
  };

  const canRunSca = mergeMode === 'full' ? (diff && diff.ahead_by > 0) : selectedCommits.size > 0;
  const scaFindings = scaResult?.vulnerabilities || scaResult?.findings || [];
  const scaCriticals = scaFindings.filter(v => v.severity === 'CRITICAL').length;
  const scaHighs = scaFindings.filter(v => v.severity === 'HIGH').length;
  const scaPassed = scaResult && scaCriticals === 0;
  const pendingApprover = activeMR?.approvers?.find(a => a.status === 'pending');

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Merge</h1>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <select className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          value={selectedRepo} onChange={e => { setSelectedRepo(e.target.value); setHeadBranch(''); resetState(); setActivityLog([]); }}>
          <option value="">Select repository...</option>
          {repos.map(r => {
            const full = r.full_name || `${r.owner || ''}/${r.name || r}`;
            return <option key={full} value={full}>{full}</option>;
          })}
        </select>
        <select className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          value={baseBranch} onChange={e => setBaseBranch(e.target.value)}>
          {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
          {branches.length === 0 && <option value="main">main</option>}
        </select>
        <select className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          value={headBranch} onChange={e => setHeadBranch(e.target.value)}>
          <option value="">Head branch...</option>
          {branches.filter(b => b.name !== baseBranch).map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
        </select>
        <button onClick={compare} disabled={loading || !headBranch}
          className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center justify-center gap-2"
          style={{ background: 'var(--accent)', color: 'white', opacity: loading || !headBranch ? 0.5 : 1 }}>
          {loading && <Loader2 size={14} className="animate-spin" />} Compare
        </button>
      </div>

      {/* Compare error */}
      {compareError && (
        <div className="rounded-lg p-3 mb-6 text-sm" style={{ background: 'rgba(248,81,73,0.1)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          {compareError}
        </div>
      )}

      {/* Flow bar + mode toggle (shown after compare) */}
      {diff && diff.ahead_by > 0 && (
        <>
          <FlowBar current={mergeStep === 'merged' ? 'merge' : mergeStep} />

          {/* Merge mode toggle */}
          <div className="flex items-center gap-0 rounded-lg overflow-hidden w-fit mb-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {['full', 'cherry-pick'].map(m => (
              <button key={m} onClick={() => { setMergeMode(m); setSelectedCommits(new Set()); }}
                className="px-4 py-1.5 text-sm border-none cursor-pointer"
                style={{
                  background: mergeMode === m ? 'var(--accent)' : 'transparent',
                  color: mergeMode === m ? 'white' : 'var(--text-tertiary)',
                  fontWeight: mergeMode === m ? 600 : 400,
                }}>
                {m === 'full' ? 'Full branch merge' : 'Cherry-pick commits'}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Selection bar (cherry-pick mode) */}
      {mergeMode === 'cherry-pick' && commits.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 mb-4 rounded-lg text-xs"
          style={{ background: 'rgba(127,119,221,0.08)', border: '1px solid rgba(127,119,221,0.2)', color: 'var(--text-secondary)' }}>
          <span>
            <strong style={{ color: 'var(--accent)' }}>{selectedCommits.size}</strong> of {commits.length} commits selected
            {selectedCommits.size > 0 && ` — ${displayFiles.length} files, +${totalAdditions} -${totalDeletions} lines`}
          </span>
          <div className="flex gap-2">
            <button onClick={selectAllCommits} className="text-xs border-none bg-transparent cursor-pointer" style={{ color: 'var(--accent)' }}>Select all</button>
            <button onClick={clearCommits} className="text-xs border-none bg-transparent cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>Clear</button>
          </div>
        </div>
      )}

      {/* Identical branches */}
      {diff && (diff.ahead_by === 0 || diff.status === 'identical') && !compareError && (
        <div className="rounded-lg p-3 mb-6 text-sm flex items-center gap-2" style={{ background: 'rgba(63,185,80,0.1)', color: 'var(--success)', border: '1px solid var(--success)' }}>
          <CheckCircle2 size={14} /> Branches are identical — nothing to merge
        </div>
      )}

      {/* Commits */}
      {commits.length > 0 && (
        <div className="rounded-lg overflow-hidden mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 text-sm font-semibold flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <GitCommit size={14} style={{ color: 'var(--accent)' }} />
            {commits.length} Commit{commits.length !== 1 ? 's' : ''} — {diff?.ahead_by || 0} ahead, {diff?.behind_by || 0} behind
          </div>
          {commits.slice(0, 30).map((c, i) => {
            const sha = c.sha || '';
            const isSel = selectedCommits.has(sha);
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-2 text-sm"
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: isSel ? 'rgba(127,119,221,0.05)' : 'transparent',
                  cursor: mergeMode === 'cherry-pick' ? 'pointer' : 'default',
                }}
                onClick={() => mergeMode === 'cherry-pick' && toggleCommit(sha)}>
                {mergeMode === 'cherry-pick' && (
                  <input type="checkbox" checked={isSel} readOnly
                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                )}
                <span className="font-mono text-xs shrink-0" style={{ color: 'var(--accent)' }}>{sha.slice(0, 7)}</span>
                <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{c.commit?.message || c.message || ''}</span>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(c.commit?.author?.date)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Diff */}
      {displayFiles.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            {displayFiles.length} Changed File{displayFiles.length !== 1 ? 's' : ''}
            {mergeMode === 'cherry-pick' && selectedCommits.size > 0 && (
              <span className="font-normal text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>(from selected commits)</span>
            )}
          </div>
          <DiffViewer files={displayFiles} />
        </div>
      )}

      {/* ── STEP-BASED ACTIONS ── */}

      {/* Step 1: Run SCA */}
      {diff && diff.ahead_by > 0 && mergeStep === 'select' && !mergeResult?.success && (
        <div className="mb-6">
          <button onClick={runSca} disabled={scaLoading || !canRunSca}
            className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-2"
            style={{ background: 'rgba(63,185,80,0.1)', color: 'var(--success)', border: '1px solid var(--success)', opacity: scaLoading || !canRunSca ? 0.5 : 1 }}>
            {scaLoading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
            Run SCA Scan
          </button>
          {!canRunSca && mergeMode === 'cherry-pick' && (
            <div className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Select at least one commit to scan</div>
          )}
        </div>
      )}

      {/* SCA result card */}
      {scaResult && (
        <div className="rounded-lg overflow-hidden mb-6" style={{
          background: 'var(--bg-card)',
          borderLeft: `3px solid ${scaPassed ? 'var(--success)' : 'var(--danger)'}`,
          border: '1px solid var(--border)',
        }}>
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: scaPassed ? 'var(--success)' : 'var(--danger)' }}>
              {scaPassed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {scaPassed ? `SCA scan passed — ${scaCriticals} critical, ${scaHighs} high` : `SCA blocked — ${scaCriticals} critical finding(s)`}
            </div>
            {scaFindings.length > 0 && (
              <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                {scaFindings.slice(0, 5).map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {v.severity === 'CRITICAL' || v.severity === 'HIGH' ? <XCircle size={12} style={{ color: 'var(--danger)' }} /> : <AlertTriangle size={12} style={{ color: 'var(--warning)' }} />}
                    <span>{v.title || v.name || v.id}</span>
                    <span className="ml-auto font-mono text-[10px]">{v.severity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Submit for approval */}
      {mergeStep === 'sca' && scaPassed && !mergeResult?.success && (
        <div className="mb-6">
          <button onClick={submitForApproval}
            className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-2"
            style={{ background: 'rgba(210,153,34,0.15)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>
            <Shield size={14} /> Submit for Approval
          </button>
          <div className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Code will NOT merge until all approvers approve</div>
        </div>
      )}

      {/* Step 3: Approval panel */}
      {activeMR && (mergeStep === 'approval' || mergeStep === 'rejected') && (
        <div className="rounded-lg overflow-hidden mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Merge Request {activeMR.id}</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{
              background: activeMR.status === 'approved' ? 'rgba(63,185,80,0.12)' : activeMR.status === 'rejected' ? 'rgba(248,81,73,0.12)' : 'rgba(210,153,34,0.12)',
              color: activeMR.status === 'approved' ? 'var(--success)' : activeMR.status === 'rejected' ? 'var(--danger)' : 'var(--warning)',
            }}>
              {activeMR.status === 'pending' ? `Awaiting approval (${activeMR.approvers.filter(a => a.status === 'approved').length}/${activeMR.approvers.length})` : activeMR.status === 'approved' ? 'Approved' : 'Rejected'}
            </span>
          </div>

          {activeMR.approvers.map((a, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              {a.status === 'approved' ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} /> : a.status === 'rejected' ? <XCircle size={16} style={{ color: 'var(--danger)' }} /> : <Clock size={16} style={{ color: 'var(--warning)' }} />}
              <div className="flex-1">
                <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{a.role}</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{a.name}</div>
                {a.comment && <div className="text-xs mt-1" style={{ color: a.status === 'rejected' ? 'var(--danger)' : 'var(--text-tertiary)' }}>{a.comment}</div>}
              </div>
              {a.timestamp && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(a.timestamp)} ago</span>}
            </div>
          ))}

          {/* Action row */}
          {activeMR.status === 'pending' && pendingApprover && (
            <div className="p-4 space-y-3">
              <input className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                value={approvalComment} onChange={e => setApprovalComment(e.target.value)}
                placeholder={`Comment (required for rejection)...`} />
              <div className="flex gap-3">
                <button onClick={doApprove} disabled={merging}
                  className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-1.5"
                  style={{ background: 'var(--success)', color: 'white', opacity: merging ? 0.5 : 1 }}>
                  {merging ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve as {pendingApprover.name}
                </button>
                <button onClick={doReject} disabled={!approvalComment.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-1.5"
                  style={{ background: 'rgba(248,81,73,0.1)', color: 'var(--danger)', border: '1px solid var(--danger)', opacity: approvalComment.trim() ? 1 : 0.5 }}>
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Merge result */}
      {mergeResult && (
        <div className="rounded-lg p-4 mb-6 text-sm" style={{
          background: mergeResult.success ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
          color: mergeResult.success ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${mergeResult.success ? 'var(--success)' : 'var(--danger)'}`,
        }}>
          <div className="flex items-center gap-2 mb-1">
            {mergeResult.success ? <CheckCircle2 size={16} /> : mergeResult.conflict ? <AlertTriangle size={16} /> : <XCircle size={16} />}
            <span className="font-semibold">{mergeResult.success ? 'Merge Successful' : mergeResult.conflict ? 'Merge Conflict' : 'Merge Failed'}</span>
          </div>
          <div>{mergeResult.msg}</div>
          {mergeResult.sha && <div className="mt-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>Commit: {mergeResult.sha}</div>}
          {mergeResult.conflict && <div className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>Open the repository in GitHub to resolve conflicts.</div>}
        </div>
      )}

      {/* ── MERGE REQUEST HISTORY ── */}
      {mergeRequests.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Recent Merge Requests</div>
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {mergeRequests.slice(0, 10).map((mr, i) => (
              <div key={mr.id || i} className="px-4 py-3" style={{
                borderBottom: '1px solid var(--border)',
                borderLeft: mr.status === 'rejected' ? '3px solid var(--danger)' : 'none',
                opacity: mr.status === 'rejected' ? 0.8 : 1,
              }}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--accent)' }}>{mr.id}</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{mr.repo?.split('/').pop()}</span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{mr.source} → {mr.target}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{
                    background: mr.status === 'approved' ? 'rgba(63,185,80,0.12)' : mr.status === 'rejected' ? 'rgba(248,81,73,0.12)' : 'rgba(210,153,34,0.12)',
                    color: mr.status === 'approved' ? 'var(--success)' : mr.status === 'rejected' ? 'var(--danger)' : 'var(--warning)',
                  }}>{mr.status}</span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(mr.createdAt)} ago</span>
                  {mr.status === 'rejected' && (
                    <button onClick={() => resubmitMR(mr)}
                      className="text-xs border-none bg-transparent cursor-pointer flex items-center gap-1"
                      style={{ color: 'var(--accent)' }}>
                      <RotateCcw size={10} /> Re-submit
                    </button>
                  )}
                </div>
                {mr.status === 'rejected' && mr.approvers?.find(a => a.status === 'rejected')?.comment && (
                  <div className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                    {mr.approvers.find(a => a.status === 'rejected').comment}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity log */}
      {activityLog.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Activity Log</div>
          <LogViewer logs={activityLog} />
        </div>
      )}
    </div>
  );
}
