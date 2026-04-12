import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { runDiscoveryScan, getQuickDiscovery, getForgeOpsRepos, onboardRepo, bulkOnboard, timeAgo } from '../api';

const STATUS_META = {
  forgeops_active:     { label: 'ForgeOps Active',     color: 'var(--success)', icon: '\u2705', desc: 'Calls ForgeOps workflows with recent runs (<30d)' },
  forgeops_configured: { label: 'ForgeOps Configured', color: 'var(--info)',    icon: '\u{1F527}', desc: 'Has ForgeOps patterns but no recent runs' },
  registered:          { label: 'Registered',          color: 'var(--primary)', icon: '\u{1F4CB}', desc: 'Listed in forgeops-config.json project registry' },
  has_ci:              { label: 'Other CI/CD',         color: 'var(--warn)',    icon: '\u{1F504}', desc: 'Has CI workflows but not using ForgeOps templates' },
  candidates:          { label: 'No CI/CD',            color: '#ef4444',        icon: '\u{1F4E5}', desc: 'Active repos with no CI — ready to onboard' },
  excluded:            { label: 'Excluded',            color: 'var(--text-dim)',icon: '\u{1F6AB}', desc: 'Archived, forks, stale, or empty' },
};

const STACK_COLORS = {
  java: '#f89820', javascript: '#f7df1e', python: '#3776ab', dotnet: '#512bd4', other: '#6b7280',
};

function RunBadge({ status }) {
  const colors = { success: 'var(--success)', failure: 'var(--error)', cancelled: 'var(--text-dim)', in_progress: 'var(--info)' };
  return (
    <span className="badge" style={{ background: `${colors[status] || 'var(--text-dim)'}18`, color: colors[status] || 'var(--text-dim)' }}>
      {status || 'none'}
    </span>
  );
}

export default function Pipelines() {
  const navigate = useNavigate();
  const [quickStats, setQuickStats] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  const [search, setSearch] = useState('');
  const [expandedRepo, setExpandedRepo] = useState(null);
  const [viewMode, setViewMode] = useState('forgeops'); // 'forgeops' or 'all'
  const [forgeopsRepos, setForgeopsRepos] = useState(null);
  const [loadingForgeops, setLoadingForgeops] = useState(true);

  useEffect(() => {
    getQuickDiscovery().then(setQuickStats).catch(() => {});
    setLoadingForgeops(true);
    getForgeOpsRepos().then(d => { setForgeopsRepos(d); setLoadingForgeops(false); }).catch(() => setLoadingForgeops(false));
  }, []);

  async function doScan() {
    setScanning(true);
    try {
      const result = await runDiscoveryScan();
      setScanResult(result);
      setActiveTab('active');
    } catch (e) {
      console.error('Scan failed:', e);
    }
    setScanning(false);
  }

  const repos = scanResult?.classified?.[activeTab] || [];
  const filtered = search
    ? repos.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || (r.description || '').toLowerCase().includes(search.toLowerCase()))
    : repos;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1>Pipelines</h1>
          <p>Monitor DevSecOps activity across your organization</p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
          <button className={`btn btn-sm${viewMode === 'forgeops' ? ' btn-primary' : ''}`} style={{ fontSize: 11 }} onClick={() => setViewMode('forgeops')}>
            ForgeOps Repos ({forgeopsRepos?.count ?? '...'})
          </button>
          <button className={`btn btn-sm${viewMode === 'all' ? ' btn-primary' : ''}`} style={{ fontSize: 11 }} onClick={() => setViewMode('all')}>
            All Repos ({quickStats?.total ?? '...'})
          </button>
        </div>
      </div>

      {/* ForgeOps repos view (default) */}
      {viewMode === 'forgeops' && (
        <>
          <div className="stat-grid">
            <div className="stat-card" style={{ borderTop: '3px solid var(--success)' }}>
              <div className="stat-label">ForgeOps Repos</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{forgeopsRepos?.count ?? '...'}</div>
              <div className="text-dim" style={{ fontSize: 10, marginTop: 4 }}>with CI/CD workflows</div>
            </div>
            <div className="stat-card" style={{ borderTop: '3px solid var(--primary)' }}>
              <div className="stat-label">Total Org Repos</div>
              <div className="stat-value" style={{ color: 'var(--primary)' }}>{forgeopsRepos?.totalOrg ?? '...'}</div>
              <div className="text-dim" style={{ fontSize: 10, marginTop: 4 }}>in GitHub organization</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{'\u2705'} ForgeOps Enabled Repositories ({forgeopsRepos?.repos?.length || 0})</span>
              <button className="btn btn-sm" onClick={() => { setLoadingForgeops(true); getForgeOpsRepos().then(d => { setForgeopsRepos(d); setLoadingForgeops(false); }); }} disabled={loadingForgeops}>{loadingForgeops ? '...' : 'Refresh'}</button>
            </div>
            {loadingForgeops ? (
              <div className="loading-center"><span className="spinner" /> Scanning for ForgeOps patterns...</div>
            ) : !forgeopsRepos?.repos?.length ? (
              <div className="empty-state">No repos with ForgeOps patterns found. Switch to "All Repos" to onboard repositories.</div>
            ) : (
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {(forgeopsRepos?.repos || []).filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase())).map(r => (
                  <div key={r.name}>
                    <div className="ticket-row" onClick={() => setExpandedRepo(expandedRepo === r.name ? null : r.name)}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: STACK_COLORS[r.language?.toLowerCase()] || '#6b7280', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, minWidth: 180, fontSize: 13 }}>{r.name}</span>
                      <span className="text-dim text-sm truncate" style={{ flex: 1 }}>{r.description}</span>
                      {r.language && r.language !== 'Unknown' && <span className="badge badge-dim" style={{ fontSize: 9 }}>{r.language}</span>}
                      <span className="badge" style={{ fontSize: 9, background: 'rgba(5,150,105,0.12)', color: 'var(--success)' }}>{r.patternCount}/4 patterns</span>
                      <span className="badge badge-primary" style={{ fontSize: 9 }}>{r.workflows?.length || 0} wf</span>
                      <span className="text-dim" style={{ fontSize: 10, flexShrink: 0 }}>{timeAgo(r.pushed_at)}</span>
                      <span className="text-dim" style={{ fontSize: 10 }}>{expandedRepo === r.name ? '\u25B2' : '\u25BC'}</span>
                    </div>
                    {expandedRepo === r.name && (
                      <div className="animate-fade" style={{ padding: '10px 14px 14px 30px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 12, marginBottom: 10 }}>
                          <div><span className="text-dim">Full name: </span>{r.full_name}</div>
                          <div><span className="text-dim">Branch: </span><code>{r.default_branch}</code></div>
                          <div><span className="text-dim">Registered: </span>{r.isRegistered ? '\u2705 Yes' : 'No'}</div>
                          <div><span className="text-dim">ForgeOps workflow: </span>{r.hasForgeOpsWorkflow ? '\u2705 Yes' : 'No'}</div>
                          <div><span className="text-dim">Config file: </span>{r.hasForgeOpsConfig ? '\u2705 Yes' : 'No'}</div>
                          <div><span className="text-dim">.forgeops dir: </span>{r.hasForgeOpsDir ? '\u2705 Yes' : 'No'}</div>
                        </div>
                        {r.workflows?.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <span className="text-dim" style={{ fontSize: 11 }}>Workflows: </span>
                            {r.workflows.map(w => <code key={w} style={{ fontSize: 10, marginRight: 6, padding: '1px 6px', background: 'var(--bg)', borderRadius: 4 }}>{w}</code>)}
                          </div>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); navigate(`/repos/${r.full_name}`); }}>View Details</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* All repos view (discovery/onboarding) */}
      {viewMode === 'all' && !scanResult && (
        <div className="stat-grid">
          <div className="stat-card" style={{ borderTop: '3px solid var(--primary)' }}>
            <div className="stat-label">Total Repositories</div>
            <div className="stat-value" style={{ color: 'var(--primary)' }}>{quickStats?.total ?? '...'}</div>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--success)' }}>
            <div className="stat-label">Recently Active</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>{quickStats?.active ?? '...'}</div>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--text-dim)' }}>
            <div className="stat-label">Stale (&gt;6 months)</div>
            <div className="stat-value" style={{ color: 'var(--text-dim)' }}>{quickStats?.stale ?? '...'}</div>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid var(--warn)' }}>
            <div className="stat-label">Archived / Forks</div>
            <div className="stat-value" style={{ color: 'var(--warn)' }}>{(quickStats?.archived || 0) + (quickStats?.forks || 0)}</div>
          </div>
        </div>
      )}

      {viewMode === 'all' && <>
      {/* Scan button */}
      <div className="card mb-4">
        {!scanResult ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              {quickStats ? `${quickStats.total} repositories found in your organization` : 'Scan your organization to discover DevSecOps activity'}
            </div>
            <p className="text-dim text-sm" style={{ marginBottom: 16, maxWidth: 540, margin: '0 auto 16px' }}>
              ForgeOps scans each repository for workflow files, recent CI/CD runs, dependency files, and classifies them as Active, Configured, Candidates for onboarding, Inactive, or Excluded.
            </p>
            <button className="btn btn-primary" onClick={doScan} disabled={scanning} style={{ padding: '12px 32px', fontSize: 14 }}>
              {scanning ? 'Scanning repositories...' : '\u{1F50D} Run Discovery Scan'}
            </button>
            {scanning && (
              <div className="text-dim text-sm" style={{ marginTop: 12 }}>
                This may take 1-2 minutes for large organizations...
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
              Scan complete: {scanResult?.summary?.total || 0} repos classified
            </span>
            <span className="text-dim text-sm">{new Date(scanResult?.scannedAt).toLocaleString()}</span>
            <button className="btn btn-sm" onClick={doScan} disabled={scanning}>{scanning ? '...' : 'Re-scan'}</button>
          </div>
        )}
      </div>

      {/* Results */}
      {scanResult && (
        <>
          {/* Classification cards */}
          <div className="stat-grid">
            {Object.entries(STATUS_META).map(([key, meta]) => {
              const count = scanResult?.summary?.[key] || 0;
              return (
                <div key={key} className="stat-card" style={{ borderTop: `3px solid ${meta.color}`, cursor: 'pointer', outline: activeTab === key ? `2px solid ${meta.color}` : 'none' }} onClick={() => setActiveTab(key)}>
                  <div className="stat-label">{meta.icon} {meta.label}</div>
                  <div className="stat-value" style={{ color: meta.color }}>{count}</div>
                  <div className="text-dim" style={{ fontSize: 10, marginTop: 4 }}>{meta.desc}</div>
                </div>
              );
            })}
          </div>

          {/* Language breakdown */}
          <div className="card mb-4">
            <div className="card-header">Technology Stack</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {Object.entries(scanResult?.summary?.languages || {}).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([lang, count]) => (
                <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STACK_COLORS[lang?.toLowerCase()] || '#6b7280' }} />
                  <span style={{ fontWeight: 600 }}>{lang}</span>
                  <span className="text-dim">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Repo list */}
          <div className="card">
            <div className="card-header">
              <span style={{ flex: 1 }}>{STATUS_META[activeTab]?.icon} {STATUS_META[activeTab]?.label} ({filtered.length})</span>
              <input type="search" placeholder="Search repos..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 220, padding: '6px 10px', fontSize: 12 }} />
            </div>

            {activeTab === 'candidates' && filtered.length > 0 && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: '#ef4444' }}>
                {'\u{1F6A8}'} These repos have active code but <strong>zero CI/CD pipelines</strong>. Onboard them with the ForgeOps consumer CI template.
              </div>
            )}
            {activeTab === 'has_ci' && filtered.length > 0 && (
              <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: 'var(--warn)' }}>
                {'\u{1F504}'} These repos have CI/CD workflows but are <strong>not using ForgeOps reusable templates</strong>. Migrate them to get centralized security scanning, Jira integration, and deployment tracking.
              </div>
            )}
            {activeTab === 'forgeops_active' && filtered.length > 0 && (
              <div style={{ padding: '10px 14px', background: 'rgba(5,150,105,0.06)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: 'var(--success)' }}>
                {'\u2705'} These repos are fully onboarded to ForgeOps with active pipeline runs. Matched patterns: reusable workflow calls, CI template names, config registry, or .forgeops directory.
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="empty-state-box">
                <div className="empty-icon">&#x1F504;</div>
                <div className="empty-title">No repositories in this category</div>
                <div className="empty-desc">Run a discovery scan to detect repositories and their pipeline status.</div>
              </div>
            ) : (
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {filtered.map(r => (
                  <div key={r.name}>
                    <div className="ticket-row" onClick={() => setExpandedRepo(expandedRepo === r.name ? null : r.name)}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: STACK_COLORS[r.stack] || '#6b7280', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, minWidth: 180, fontSize: 13 }}>{r.name}</span>
                      <span className="text-dim text-sm truncate" style={{ flex: 1 }}>{r.description}</span>
                      {r.language && r.language !== 'Unknown' && <span className="badge badge-dim" style={{ fontSize: 9 }}>{r.language}</span>}
                      {r.forgeopsPatterns && r.forgeopsPatterns.length > 0 && <span className="badge" style={{ fontSize: 9, background: 'rgba(5,150,105,0.12)', color: 'var(--success)' }}>{r.forgeopsPatterns.length}/4 patterns</span>}
                      {r.hasWorkflows && <span className="badge badge-primary" style={{ fontSize: 9 }}>{r.workflows.length} wf</span>}
                      {r.lastRunStatus && <RunBadge status={r.lastRunStatus} />}
                      <span className="text-dim" style={{ fontSize: 10, flexShrink: 0 }}>{timeAgo(r.pushed_at)}</span>
                      <span className="text-dim" style={{ fontSize: 10 }}>{expandedRepo === r.name ? '\u25B2' : '\u25BC'}</span>
                    </div>
                    {expandedRepo === r.name && (
                      <div className="animate-fade" style={{ padding: '10px 14px 14px 30px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 12, marginBottom: 10 }}>
                          <div><span className="text-dim">Full name: </span>{r.full_name}</div>
                          <div><span className="text-dim">Branch: </span><code>{r.default_branch}</code></div>
                          <div><span className="text-dim">Size: </span>{r.size > 1000 ? (r.size / 1000).toFixed(1) + ' MB' : r.size + ' KB'}</div>
                          <div><span className="text-dim">Visibility: </span>{r.private ? 'Private' : 'Public'}</div>
                          {r.lastRunDate && <div><span className="text-dim">Last CI run: </span>{new Date(r.lastRunDate).toLocaleString()}</div>}
                          {r.lastRunStatus && <div><span className="text-dim">Result: </span><RunBadge status={r.lastRunStatus} /></div>}
                        </div>
                        {r.workflows.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <span className="text-dim" style={{ fontSize: 11 }}>Workflows: </span>
                            {r.workflows.map(w => <code key={w} style={{ fontSize: 10, marginRight: 6, padding: '1px 6px', background: 'var(--bg)', borderRadius: 4 }}>{w}</code>)}
                          </div>
                        )}
                        <div style={{ fontSize: 11 }}>
                          <span className="text-dim">Signals: </span>
                          {r.signals.map((s, i) => <span key={i} style={{ display: 'block', color: 'var(--text-dim)', paddingLeft: 8 }}>{'\u2022'} {s}</span>)}
                        </div>
                        {activeTab === 'candidates' && (
                          <div style={{ marginTop: 10 }}>
                            <button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); navigate(`/repos/${r.full_name}`); }}>
                              {'\u{1F680}'} Add ForgeOps CI Template
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      </>}
    </div>
  );
}
