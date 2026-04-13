import { useState, useEffect } from 'react';
import { Loader2, Rocket, History, Play, CheckCircle2, XCircle, Clock, Eye, ChevronDown, ChevronRight, Server } from 'lucide-react';
import { api, timeAgo } from '../api';
import Badge from '../components/Badge';
import LogViewer from '../components/LogViewer';
import EnvFlow from '../components/EnvFlow';
import { getRepoProfile, getNextEnv } from '../data/envProfiles';

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

const stageStatusColor = (s) => {
  if (s === 'success') return 'var(--success)';
  if (s === 'failure') return 'var(--danger)';
  if (s === 'pending') return 'var(--text-tertiary)';
  return 'var(--warning)';
};

function StageBar({ stages }) {
  if (!stages || stages.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{'>'}</span>}
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ background: stageStatusColor(s.status) + '22', color: stageStatusColor(s.status) }}
            title={`${s.name}: ${s.status} (${s.duration}s)`}
          >
            {s.name}
          </span>
        </div>
      ))}
    </div>
  );
}

function generateMockLogs(build) {
  const lines = [
    { time: '00:00', level: 'INFO', message: `Pipeline #${build?.runNumber || build?.run_id || '?'} started for ${build?.repo || 'unknown'}` },
    { time: '00:01', level: 'INFO', message: `Branch: ${build?.branch || build?.head_branch || 'main'}` },
    { time: '00:02', level: 'INFO', message: `Commit: ${build?.commitSha || build?.commitMessage || 'n/a'}` },
  ];
  const stages = build?.stages || [];
  let elapsed = 3;
  for (const s of stages) {
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const ts = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    lines.push({
      time: ts,
      level: s.status === 'failure' ? 'ERROR' : s.status === 'pending' ? 'WARN' : 'INFO',
      message: `[${s.name}] ${s.status === 'success' ? 'completed' : s.status === 'failure' ? 'FAILED' : 'skipped'} (${s.duration}s)`,
    });
    elapsed += s.duration || 1;
  }
  const finalStatus = (build?.status || build?.conclusion || 'unknown');
  lines.push({ time: `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`, level: finalStatus === 'success' ? 'INFO' : 'ERROR', message: `Pipeline finished: ${finalStatus}` });
  return lines;
}

export default function CiCd() {
  const [tab, setTab] = useState('deploy');
  const [repos, setRepos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [env, setEnv] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);

  // History
  const [builds, setBuilds] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  const [viewLogs, setViewLogs] = useState(null);
  const [jobLogs, setJobLogs] = useState([]);

  // Environments
  const [environments, setEnvironments] = useState([]);

  // Profile for selected repo
  const repoName = selectedRepo ? selectedRepo.split('/').pop() : '';
  const profile = repoName ? getRepoProfile(repoName) : null;
  const profileEnvs = profile?.environments || ['DEV', 'INT', 'QA', 'STAGE', 'PROD'];

  useEffect(() => {
    async function load() {
      try {
        const r = await api.github.repos();
        const list = Array.isArray(r) ? r : r?.repos || [];
        setRepos(list.length > 0 ? list : MOCK_REPOS_FALLBACK);
      } catch {
        setRepos(MOCK_REPOS_FALLBACK);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    async function loadBranches() {
      try {
        const [o, r] = selectedRepo.split('/');
        const b = await api.github.branches(o, r);
        setBranches(Array.isArray(b) ? b : []);
      } catch {
        setBranches([]);
      }
    }
    loadBranches();
  }, [selectedRepo]);

  // Reset env when profile changes
  useEffect(() => {
    if (profileEnvs.length > 0 && !profileEnvs.includes(env)) {
      setEnv(profileEnvs[0]);
    }
  }, [selectedRepo]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
    if (tab === 'deploy') loadEnvironments();
  }, [tab]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await api.github.buildHistory();
      const list = res?.builds || res?.runs || (Array.isArray(res) ? res : []);
      setBuilds(list);
    } catch {
      setBuilds([]);
    }
    setHistoryLoading(false);
  };

  const loadEnvironments = async () => {
    try {
      const res = await api.github.environments();
      setEnvironments(res?.environments || []);
    } catch {
      setEnvironments([]);
    }
  };

  const deploy = async () => {
    if (!selectedRepo || !selectedBranch) return;
    setDeploying(true);
    setDeployResult(null);
    try {
      const [o, r] = selectedRepo.split('/');
      const res = await api.github.commitFiles(o, r, [], `deploy: ${env} from ${selectedBranch}`, selectedBranch);
      setDeployResult(res ? { success: true, msg: `Deployment to ${env} triggered` } : { success: false, msg: 'Deployment failed' });
    } catch {
      setDeployResult({ success: false, msg: 'Deployment error' });
    }
    setDeploying(false);
  };

  const showLogs = async (build) => {
    setViewLogs(build);
    try {
      const owner = build.repository?.owner?.login || build.owner || '';
      const repo = build.repository?.name || build.repo || '';
      const runId = build.id || build.run_id;
      if (owner && repo && runId) {
        const res = await api.github.runJobs(owner, repo, runId);
        const jobs = res?.jobs || [];
        if (jobs.length > 0) {
          setJobLogs(jobs.map((j) => ({
            time: timeAgo(j.started_at),
            level: j.conclusion === 'success' ? 'INFO' : j.conclusion === 'failure' ? 'ERROR' : 'WARN',
            message: `${j.name}: ${j.conclusion || j.status || 'running'}`,
          })));
          return;
        }
      }
      setJobLogs(generateMockLogs(build));
    } catch {
      setJobLogs(generateMockLogs(build));
    }
  };

  const conclusionIcon = (c) => {
    if (c === 'success') return <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />;
    if (c === 'failure') return <XCircle size={14} style={{ color: 'var(--danger)' }} />;
    return <Clock size={14} style={{ color: 'var(--warning)' }} />;
  };

  const envStatusColor = (s) => {
    if (s === 'healthy') return 'var(--success)';
    if (s === 'degraded') return 'var(--warning)';
    return 'var(--danger)';
  };

  const toggleExpand = (idx) => {
    setExpandedRow(expandedRow === idx ? null : idx);
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>CI/CD</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {['deploy', 'history'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer capitalize"
            style={{
              background: tab === t ? 'var(--accent)' : 'var(--bg-card)',
              color: tab === t ? 'white' : 'var(--text-secondary)',
            }}
          >
            {t === 'deploy' ? <span className="flex items-center gap-1.5"><Rocket size={14} /> Deploy</span> : <span className="flex items-center gap-1.5"><History size={14} /> History</span>}
          </button>
        ))}
      </div>

      {tab === 'deploy' && (
        <div>
          {/* Environment Status Cards */}
          {environments.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {environments.map((e) => (
                <div key={e.name} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Server size={14} style={{ color: 'var(--text-secondary)' }} />
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{e.name}</span>
                    </div>
                    <span className="w-2 h-2 rounded-full" style={{ background: envStatusColor(e.status) }} />
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{e.version} &middot; build #{e.build}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>deployed {timeAgo(e.deployed_at)} ago</div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Repository</label>
                <select
                  className="w-full px-3 py-2 rounded-lg text-sm"
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
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Target Environment</label>
                <select
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                >
                  {profileEnvs.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Branch</label>
                <select
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                  {branches.length === 0 && <option value="main">main</option>}
                </select>
              </div>
            </div>

            {/* Profile flow visualization */}
            {profile && selectedRepo && (
              <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: profile.color }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {profile.name} Profile — {profile.description}
                  </span>
                </div>
                <EnvFlow profile={profile} currentEnv={env} />
                {getNextEnv(profile, env) && (
                  <div className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Next promotion: {env} → {getNextEnv(profile, env)}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={deploy}
              disabled={deploying || !selectedRepo}
              className="px-6 py-2.5 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-2"
              style={{ background: 'var(--success)', color: 'white', opacity: deploying ? 0.6 : 1 }}
            >
              {deploying ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Deploy to {env || '...'}
            </button>
            {deployResult && (
              <div className="mt-3 text-sm px-3 py-2 rounded" style={{
                color: deployResult.success ? 'var(--success)' : 'var(--danger)',
                background: deployResult.success ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
              }}>
                {deployResult.msg}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div>
          {historyLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : builds.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>No build history available</div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)', width: 30 }}></th>
                    <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Status</th>
                    <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Repo</th>
                    <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Branch</th>
                    <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Env</th>
                    <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Commit</th>
                    <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>By</th>
                    <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Duration</th>
                    <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Time</th>
                    <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {builds.slice(0, 30).map((b, i) => {
                    const status = b?.conclusion || b?.status || 'unknown';
                    const isExpanded = expandedRow === i;
                    return (
                      <tr key={b?.id || b?.run_id || i} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                        <td colSpan={10} style={{ padding: 0 }}>
                          <div>
                            <div className="flex items-center" style={{ borderBottom: isExpanded ? '1px solid var(--border)' : 'none' }}>
                              <div className="px-4 py-3 cursor-pointer" onClick={() => toggleExpand(i)}>
                                {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />}
                              </div>
                              <div className="px-4 py-3">{conclusionIcon(status)}</div>
                              <div className="px-4 py-3" style={{ color: 'var(--text-primary)', minWidth: 120 }}>{b?.repo || b?.name || 'Build'}</div>
                              <div className="px-4 py-3">
                                <Badge text={b?.branch || b?.head_branch || 'main'} color="var(--info)" />
                              </div>
                              <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)', minWidth: 60 }}>{b?.environment || '--'}</div>
                              <div className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-tertiary)', minWidth: 70 }}>{b?.commitSha?.substring(0, 7) || '--'}</div>
                              <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)', minWidth: 60 }}>{b?.triggeredBy || '--'}</div>
                              <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)', minWidth: 50 }}>{b?.duration ? `${b.duration}s` : '--'}</div>
                              <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)', minWidth: 40 }}>{timeAgo(b?.startedAt || b?.created_at)}</div>
                              <div className="px-4 py-3">
                                <button
                                  onClick={(e) => { e.stopPropagation(); showLogs(b); }}
                                  className="flex items-center gap-1 text-xs border-none bg-transparent cursor-pointer"
                                  style={{ color: 'var(--accent)' }}
                                >
                                  <Eye size={12} /> Logs
                                </button>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="px-12 py-3" style={{ background: 'var(--bg-secondary)' }}>
                                <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Pipeline Stages</div>
                                <StageBar stages={b?.stages || []} />
                                {b?.commitMessage && (
                                  <div className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                    Commit: {b.commitMessage}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Job logs panel */}
          {viewLogs && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Logs: {viewLogs.repo || viewLogs.name || viewLogs.workflow?.name || 'Build'} #{viewLogs.runNumber || viewLogs.run_id || ''}
                </span>
                <button
                  onClick={() => { setViewLogs(null); setJobLogs([]); }}
                  className="text-xs bg-transparent border-none cursor-pointer"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Close
                </button>
              </div>
              <LogViewer logs={jobLogs} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
