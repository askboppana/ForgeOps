import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBuildHistory, timeAgo } from '../api';

const ENVIRONMENTS = ['INT', 'QA', 'STAGE', 'PROD'];
const STORAGE_KEY = 'fg_deploy_history';


function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
}

function formatTime(t) {
  if (!t) return '';
  try {
    const d = new Date(t);
    if (isNaN(d.getTime())) return t;
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return `${Math.floor(diff / 86400000)} days ago`;
  } catch { return t; }
}

export default function Deploy() {
  const [tab, setTab] = useState('deploy');
  const [target, setTarget] = useState('INT');
  const [branch, setBranch] = useState('main');
  const [deploying, setDeploying] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleDeploy = () => {
    setDeploying(true);
    setTimeout(() => {
      const entry = {
        id: Date.now(),
        env: target,
        branch,
        status: 'success',
        time: new Date().toISOString(),
        user: 'You',
      };
      const updated = [entry, ...history];
      setHistory(updated);
      saveHistory(updated);
      setDeploying(false);
    }, 2000);
  };

  return (
    <div>
      <div className="page-header">
        <h1>CI/CD</h1>
        <p>Deploy builds and view pipeline history</p>
      </div>

      <div className="tabs">
        <button className={`tab-btn${tab === 'deploy' ? ' active' : ''}`} onClick={() => setTab('deploy')}>
          {'\u{1F680}'} Deploy
        </button>
        <button className={`tab-btn${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
          {'\u{1F4CB}'} History
        </button>
      </div>

      {tab === 'deploy' && (
        <>
          <div className="card mb-4">
            <div className="card-header">New Deployment</div>
            <div className="form-row">
              <div className="form-group">
                <label>Target Environment</label>
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Branch / Tag</label>
                <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleDeploy} disabled={deploying}>
                  {deploying ? 'Deploying...' : 'Deploy'}
                </button>
              </div>
            </div>
          </div>

        </>
      )}

      {tab === 'history' && <BuildHistory />}
    </div>
  );
}

function BuildHistory() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [envFilter, setEnvFilter] = useState('');
  const [monthsFilter, setMonthsFilter] = useState('3');
  const [statusFilter, setStatusFilter] = useState('');
  const [repoFilter, setRepoFilter] = useState('');

  function fetchHistory() {
    setLoading(true);
    const params = { months: monthsFilter };
    if (envFilter) params.environment = envFilter;
    if (repoFilter) params.repo = repoFilter;
    getBuildHistory(params).then(data => {
      setRuns(data.runs || []);
      setSummary(data.summary || null);
      setLoading(false);
    }).catch(() => { setLoading(false); });
  }

  useEffect(() => { fetchHistory(); }, [envFilter, monthsFilter]);

  const filtered = statusFilter ? runs.filter(r => r.status === statusFilter) : runs;
  const sc = { success: 'var(--success)', failure: 'var(--error)', cancelled: 'var(--text-dim)', in_progress: 'var(--info)', queued: 'var(--warn)' };
  const ec = { prod: 'var(--error)', stage: 'var(--primary)', qa: 'var(--warn)', int: 'var(--info)', development: 'var(--text-dim)' };

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">Build & Deploy History</div>
        <div className="form-row">
          <div className="form-group">
            <label>Time Range</label>
            <select value={monthsFilter} onChange={e => setMonthsFilter(e.target.value)}>
              <option value="1">Last 1 month</option>
              <option value="3">Last 3 months</option>
              <option value="6">Last 6 months</option>
              <option value="12">Last 12 months</option>
            </select>
          </div>
          <div className="form-group">
            <label>Environment</label>
            <select value={envFilter} onChange={e => setEnvFilter(e.target.value)}>
              <option value="">All Environments</option>
              <option value="int">INT</option>
              <option value="qa">QA</option>
              <option value="stage">STAGE</option>
              <option value="prod">PROD</option>
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failure">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="in_progress">Running</option>
            </select>
          </div>
          <div className="form-group">
            <label>Repository</label>
            <input type="text" value={repoFilter} onChange={e => setRepoFilter(e.target.value)} placeholder="Filter by repo..." onBlur={fetchHistory} onKeyDown={e => e.key === 'Enter' && fetchHistory()} />
          </div>
        </div>
      </div>

      {summary && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card" style={{ borderTop: '3px solid var(--primary)' }}>
            <div className="stat-label">Total Runs</div>
            <div className="stat-value" style={{ color: 'var(--primary)' }}>{summary.total}</div>
          </div>
          {Object.entries(summary.byEnvironment || {}).map(([env, count]) => (
            <div key={env} className="stat-card" style={{ borderTop: `3px solid ${ec[env] || 'var(--text-dim)'}`, cursor: 'pointer' }} onClick={() => setEnvFilter(env)}>
              <div className="stat-label">{env.toUpperCase()}</div>
              <div className="stat-value" style={{ color: ec[env] || 'var(--text-dim)' }}>{count}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1 }}>Pipeline Runs ({filtered.length})</span>
          <button className="btn btn-sm" onClick={fetchHistory} disabled={loading}>{loading ? '...' : 'Refresh'}</button>
        </div>
        {loading ? (
          <div className="loading-center"><span className="spinner" /> Fetching build history from GitHub Actions...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No pipeline runs found for the selected filters.</div>
        ) : (
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Repository</th>
                  <th>Branch</th>
                  <th>Environment</th>
                  <th>Commit</th>
                  <th>Triggered by</th>
                  <th>Duration</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/repos/${r.triggeredBy || 'askboppana'}/${r.repo}/runs/${r.id}`)}>
                    <td><span className="badge" style={{ background: `${sc[r.status] || 'var(--text-dim)'}18`, color: sc[r.status] || 'var(--text-dim)' }}>{r.status || '?'}</span></td>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{r.repo}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{r.branch}</td>
                    <td><span className="badge" style={{ background: `${ec[r.environment] || 'var(--text-dim)'}18`, color: ec[r.environment] || 'var(--text-dim)' }}>{(r.environment || '').toUpperCase()}</span></td>
                    <td><code style={{ fontSize: 11 }}>{r.commitSha}</code> <span className="text-dim text-sm">{(r.commitMessage || '').substring(0, 30)}</span></td>
                    <td className="text-dim text-sm">{r.triggeredBy}</td>
                    <td className="text-dim text-sm">{r.duration ? (r.duration < 60 ? r.duration + 's' : Math.floor(r.duration / 60) + 'm') : '—'}</td>
                    <td className="text-dim text-sm">{timeAgo(r.startedAt)}</td>
                    <td>
                      <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={e => { e.stopPropagation(); navigate(`/repos/${r.triggeredBy || 'askboppana'}/${r.repo}/runs/${r.id}`); }}>
                        View Logs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
