import { useState, useEffect, useMemo } from 'react';
import { Shield, ShieldCheck, AlertTriangle, AlertOctagon, Info, CheckCircle2, Clock, Plus, Download, Key, Lock, Bot, BarChart3, GitMerge, Rocket, Eye } from 'lucide-react';
import { loadPolicies, savePolicies, loadViolations, saveViolation, getComplianceScore, getSecretRotationStatus, isInFreezeWindow } from '../data/policyEngine';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';

/* ── Default policy sets ── */

const DEF_PIPELINE = [
  { id: 'P-001', name: 'Security scan required', description: 'Every pipeline must include SCA or SAST scan before deploy', enforcement: 'block', enabled: true, scope: 'org' },
  { id: 'P-002', name: 'Unit tests required', description: 'Tests must pass before deploy stage executes', enforcement: 'block', enabled: true, scope: 'org' },
  { id: 'P-003', name: 'No direct PROD deploy', description: 'Must go through at least one lower environment first', enforcement: 'block', enabled: true, scope: 'org' },
  { id: 'P-004', name: 'Approval gate before PROD', description: 'At least 2 approvals required before production deploy', enforcement: 'block', enabled: true, scope: 'org' },
  { id: 'P-005', name: 'Docker images from approved registry', description: 'Only company registry allowed, no Docker Hub direct pulls', enforcement: 'warn', enabled: true, scope: 'org' },
  { id: 'P-006', name: 'Build timeout limit', description: 'Max 30 min build time, auto-kill after timeout', enforcement: 'warn', enabled: false, scope: 'org' },
  { id: 'P-007', name: 'Artifact signing required', description: 'All build artifacts must be signed before deploy', enforcement: 'block', enabled: false, scope: 'org' },
  { id: 'P-008', name: 'No skip-ci commits', description: 'Block commits with [skip ci] tag on protected branches', enforcement: 'warn', enabled: true, scope: 'org' },
];

const DEF_BRANCH = [
  { id: 'B-001', name: 'No direct commits to main', description: 'All changes must go through pull requests', enforcement: 'block', enabled: true },
  { id: 'B-002', name: 'PR requires code review', description: 'Minimum 1 approval before merge allowed', enforcement: 'block', enabled: true },
  { id: 'B-003', name: 'SCA pass before merge', description: 'Critical and high findings block merge', enforcement: 'block', enabled: true },
  { id: 'B-004', name: 'Code coverage threshold', description: 'Coverage must stay above configured threshold', enforcement: 'warn', enabled: true, config: { threshold: 80 } },
  { id: 'B-005', name: 'Cherry-pick to main requires approval', description: '2 approvals required for any cherry-pick to main/prod', enforcement: 'block', enabled: true },
  { id: 'B-006', name: 'Branch naming convention', description: 'Must match: feature/*, fix/*, hotfix/*, release/*', enforcement: 'warn', enabled: true, config: { pattern: '^(feature|fix|hotfix|release)/' } },
  { id: 'B-007', name: 'Stale branch cleanup', description: 'Auto-delete branches 30 days after merge', enforcement: 'info', enabled: false, config: { days: 30 } },
  { id: 'B-008', name: 'Max PR size', description: 'Warn if PR has more than 500 lines changed', enforcement: 'warn', enabled: false, config: { maxLines: 500 } },
];

const DEF_SECRETS = [
  { id: 'S-001', name: 'Secret rotation every 90 days', description: 'Alert 14 days before expiry, block at expiry', enforcement: 'block', enabled: true },
  { id: 'S-002', name: 'No hardcoded secrets in code', description: 'Gitleaks scan in every pipeline', enforcement: 'block', enabled: true },
  { id: 'S-003', name: 'PROD secrets restricted', description: 'Only main/prod branch can access production secrets', enforcement: 'block', enabled: true },
  { id: 'S-004', name: 'API keys must have expiry', description: 'No permanent tokens allowed', enforcement: 'warn', enabled: true },
  { id: 'S-005', name: 'No .env files in repo', description: 'Block commits containing .env, .key, .pem, .p12 files', enforcement: 'block', enabled: true },
];

const DEF_DEPLOY = [
  { id: 'D-001', name: 'Deploy freeze window', description: 'No PROD deploys during configured windows', enforcement: 'block', enabled: true },
  { id: 'D-002', name: 'Max PROD deploys per day', description: 'Limit production deploys per day', enforcement: 'warn', enabled: true, config: { maxPerDay: 2 } },
  { id: 'D-003', name: 'Rollback available', description: 'Previous version must be reachable within 5 minutes', enforcement: 'block', enabled: true },
  { id: 'D-004', name: 'PROD requires Cherwell CHG', description: 'Change request must exist before PROD deploy', enforcement: 'block', enabled: true },
  { id: 'D-005', name: 'Environment promotion order', description: 'Must follow assigned profile path', enforcement: 'block', enabled: true },
  { id: 'D-006', name: 'Canary required for critical repos', description: 'Repos tagged critical must do canary deploy first', enforcement: 'warn', enabled: false },
  { id: 'D-007', name: 'Health check after deploy', description: 'Auto health check within 2 min, auto-rollback if fail', enforcement: 'block', enabled: true },
];

const DEF_COMPLIANCE = [
  { id: 'C-001', name: 'Cherwell change request for PROD', description: 'Auto-create CHG, block deploy without approval', enforcement: 'block', enabled: true },
  { id: 'C-002', name: 'Audit trail retention 365 days', description: 'All actions logged and retained for SOX compliance', enforcement: 'block', enabled: true, config: { days: 365 } },
  { id: 'C-003', name: 'Approval comments required', description: 'Every approval must include a written justification', enforcement: 'warn', enabled: true },
  { id: 'C-004', name: 'Separation of duties', description: 'Code author cannot approve their own PR or deploy', enforcement: 'block', enabled: true },
  { id: 'C-005', name: 'License compliance', description: 'Block GPL/AGPL dependencies in proprietary repos', enforcement: 'warn', enabled: true },
  { id: 'C-006', name: 'Change approval board', description: 'High-impact changes require CAB review', enforcement: 'block', enabled: false },
];

const DEF_AI = [
  { id: 'AI-001', name: 'AI code review before merge', description: 'Claude reviews every PR for bugs, security, and performance', enforcement: 'block', enabled: true },
  { id: 'AI-002', name: 'AI risk assessment before PROD', description: 'AI analyzes changes and flags high-risk deployments', enforcement: 'warn', enabled: true },
  { id: 'AI-003', name: 'AI schema change detection', description: 'Auto-flag any deploy that modifies database tables or columns', enforcement: 'warn', enabled: true },
  { id: 'AI-004', name: 'AI PII detection in logs', description: 'Scan pipeline output for exposed emails, SSNs, credit cards', enforcement: 'block', enabled: true },
  { id: 'AI-005', name: 'AI dependency risk scoring', description: 'Rate new dependencies by maintainer activity and CVE history', enforcement: 'warn', enabled: true },
  { id: 'AI-006', name: 'AI pipeline optimization', description: 'Suggest caching, parallel execution, and unused stage removal', enforcement: 'info', enabled: true },
  { id: 'AI-007', name: 'AI auto-fix on failure', description: 'Autonomously create fix branch when pipeline fails', enforcement: 'info', enabled: false },
];

const DEF_SECRETS_TRACKER = [
  { name: 'GITHUB_APP_PRIVATE_KEY', lastRotated: '2026-04-01', rotationDays: 90 },
  { name: 'JIRA_TOKEN', lastRotated: '2026-01-18', rotationDays: 90 },
  { name: 'ANTHROPIC_API_KEY', lastRotated: '2026-03-15', rotationDays: 90 },
  { name: 'SPLUNK_TOKEN', lastRotated: '2026-01-02', rotationDays: 90 },
  { name: 'TEAMS_WEBHOOK_URL', lastRotated: '2026-03-01', rotationDays: 90 },
  { name: 'BLACKDUCK_TOKEN', lastRotated: '2026-02-10', rotationDays: 90 },
];

const DEF_FREEZE = [
  { name: 'Weekends', start: 'Fri 5:00 PM', end: 'Mon 8:00 AM', recurring: true },
  { name: 'Holiday freeze', start: '2026-12-20', end: '2027-01-03', recurring: false },
  { name: 'Quarter-end', start: 'Last 3 days of quarter', end: 'First day of next quarter', recurring: true },
];

const DEF_VIOLATIONS = [
  { id: 'V-001', severity: 'Critical', policyId: 'S-002', description: 'Hardcoded API key detected in src/config.js', repo: 'node-api-gateway', timestamp: new Date(Date.now() - 3600000).toISOString(), action: 'Blocked' },
  { id: 'V-002', severity: 'Warning', policyId: 'B-006', description: 'Branch "update-deps" does not match naming convention', repo: 'react-customer-portal', timestamp: new Date(Date.now() - 86400000).toISOString(), action: 'Alert sent' },
  { id: 'V-003', severity: 'Critical', policyId: 'P-003', description: 'Direct PROD deploy attempted, skipping staging', repo: 'java-svc-payments', timestamp: new Date(Date.now() - 172800000).toISOString(), action: 'Blocked' },
  { id: 'V-004', severity: 'Warning', policyId: 'D-002', description: 'Third PROD deploy today exceeds limit of 2', repo: 'spring-boot-orders', timestamp: new Date(Date.now() - 259200000).toISOString(), action: 'Alert sent' },
  { id: 'V-005', severity: 'Info', policyId: 'AI-006', description: 'Pipeline has no cache step, build time could be reduced 40%', repo: 'py-data-pipeline', timestamp: new Date(Date.now() - 345600000).toISOString(), action: 'Logged' },
  { id: 'V-006', severity: 'Critical', policyId: 'S-001', description: 'JIRA_TOKEN expired 5 days ago, rotation overdue', repo: 'org-wide', timestamp: new Date(Date.now() - 432000000).toISOString(), action: 'Blocked' },
];

/* ── Helpers ── */

const CATS = [
  { key: 'pipeline', label: 'Pipeline', icon: Rocket, defaults: DEF_PIPELINE },
  { key: 'branch', label: 'Branch & Merge', icon: GitMerge, defaults: DEF_BRANCH },
  { key: 'secrets', label: 'Secrets', icon: Key, defaults: DEF_SECRETS },
  { key: 'deploy', label: 'Deployment', icon: Rocket, defaults: DEF_DEPLOY },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck, defaults: DEF_COMPLIANCE },
  { key: 'ai', label: 'AI Policies', icon: Bot, defaults: DEF_AI },
];

function enfBadge(e) {
  const map = { block: { bg: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }, warn: { bg: 'rgba(210,153,34,0.12)', color: 'var(--warning)' }, info: { bg: 'rgba(88,166,255,0.12)', color: 'var(--info)' } };
  const s = map[e] || { bg: 'var(--bg-secondary)', color: 'var(--text-tertiary)' };
  return <span className="px-2 py-0.5 rounded text-[10px] font-medium capitalize" style={{ background: s.bg, color: s.color }}>{e || 'off'}</span>;
}

function sevBadge(sev) {
  const map = { Critical: 'var(--danger)', Warning: 'var(--warning)', Info: 'var(--info)' };
  const c = map[sev] || 'var(--text-tertiary)';
  return <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: c + '1A', color: c }}>{sev}</span>;
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={onChange} className="relative border-none cursor-pointer rounded-full shrink-0" style={{ width: 32, height: 18, background: on ? 'var(--success)' : 'var(--border)' }}>
      <span className="absolute rounded-full bg-white transition-all" style={{ width: 14, height: 14, top: 2, left: on ? 16 : 2 }} />
    </button>
  );
}

function daysSince(dateStr) { return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000); }

/* ═══ MAIN COMPONENT ═══ */

export default function Policies() {
  const [tab, setTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'branch', label: 'Branch & Merge' },
    { id: 'secrets', label: 'Secrets' },
    { id: 'deploy', label: 'Deployment' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'ai', label: 'AI Policies' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Policies</h1>
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-3 py-2 rounded-lg text-sm font-medium border-none cursor-pointer shrink-0"
            style={{ background: tab === t.id ? 'var(--accent)' : 'var(--bg-card)', color: tab === t.id ? 'white' : 'var(--text-secondary)' }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'pipeline' && <PolicyTab category="pipeline" defaults={DEF_PIPELINE} />}
      {tab === 'branch' && <PolicyTab category="branch" defaults={DEF_BRANCH} />}
      {tab === 'secrets' && <SecretsTab />}
      {tab === 'deploy' && <DeployTab />}
      {tab === 'compliance' && <ComplianceTab />}
      {tab === 'ai' && <AITab />}
    </div>
  );
}

/* ═══ DASHBOARD ═══ */

function DashboardTab() {
  const score = getComplianceScore();
  const violations = useMemo(() => {
    const v = loadViolations();
    return v.length > 0 ? v : DEF_VIOLATIONS;
  }, []);

  const catScores = useMemo(() => {
    return CATS.map(c => {
      const policies = loadPolicies(c.key) || c.defaults;
      const enabled = policies.filter(p => p.enabled).length;
      const pct = policies.length > 0 ? Math.round((enabled / policies.length) * 100) : 100;
      return { ...c, pct };
    });
  }, []);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard value={score.active} label="Policies active" icon={ShieldCheck} color="var(--success)" />
        <StatCard value={score.violations7d} label="Violations 7d" icon={AlertTriangle} color="var(--danger)" />
        <StatCard value={violations.filter(v => v.action === 'Blocked').length} label="Blocked actions" icon={AlertOctagon} color="var(--warning)" />
        <StatCard value={`${score.score}%`} label="Compliance score" icon={BarChart3} color="var(--info)" />
      </div>

      {/* Compliance by category */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {catScores.map(c => (
          <div key={c.key} className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="text-2xl font-bold mb-1" style={{ color: c.pct >= 90 ? 'var(--success)' : c.pct >= 70 ? 'var(--warning)' : 'var(--danger)' }}>{c.pct}%</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Recent violations */}
      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="px-4 py-3 text-sm font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          Recent Violations
        </div>
        {violations.slice(0, 10).map((v, i) => (
          <div key={v.id || i} className="flex items-center gap-3 px-4 py-2.5 text-sm" style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${v.severity === 'Critical' ? 'var(--danger)' : v.severity === 'Warning' ? 'var(--warning)' : 'var(--info)'}` }}>
            {sevBadge(v.severity)}
            <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>{v.policyId}</span>
            <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{v.description}</span>
            <span className="text-xs shrink-0" style={{ color: 'var(--info)' }}>{v.repo}</span>
            <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>{new Date(v.timestamp).toLocaleDateString()}</span>
            {enfBadge(v.action === 'Blocked' ? 'block' : v.action === 'Alert sent' ? 'warn' : 'info')}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ GENERIC POLICY TAB ═══ */

function PolicyTab({ category, defaults }) {
  const [policies, setPolicies] = useState(() => loadPolicies(category) || defaults);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEnf, setNewEnf] = useState('warn');

  const toggle = (idx) => {
    const next = policies.map((p, i) => i === idx ? { ...p, enabled: !p.enabled } : p);
    setPolicies(next);
    savePolicies(category, next);
  };

  const changeEnf = (idx, enforcement) => {
    const next = policies.map((p, i) => i === idx ? { ...p, enforcement } : p);
    setPolicies(next);
    savePolicies(category, next);
  };

  const addPolicy = () => {
    if (!newName.trim()) return;
    const id = category.charAt(0).toUpperCase() + '-' + String(policies.length + 1).padStart(3, '0');
    const next = [...policies, { id, name: newName, description: newDesc, enforcement: newEnf, enabled: true }];
    setPolicies(next);
    savePolicies(category, next);
    setNewName(''); setNewDesc(''); setAdding(false);
  };

  const updateConfig = (idx, key, value) => {
    const next = policies.map((p, i) => i === idx ? { ...p, config: { ...(p.config || {}), [key]: value } } : p);
    setPolicies(next);
    savePolicies(category, next);
  };

  const selectStyle = { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' };

  return (
    <div>
      <div className="rounded-lg overflow-hidden mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{policies.length} policies</span>
          <button onClick={() => setAdding(!adding)} className="px-3 py-1 rounded text-xs font-medium border-none cursor-pointer flex items-center gap-1"
            style={{ background: 'var(--accent)', color: 'white' }}>
            <Plus size={12} /> Add policy
          </button>
        </div>

        {adding && (
          <div className="p-4 flex flex-wrap gap-3 items-end" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Name</label>
              <input className="w-full px-2 py-1 rounded text-sm outline-none" style={selectStyle} value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Description</label>
              <input className="w-full px-2 py-1 rounded text-sm outline-none" style={selectStyle} value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Enforcement</label>
              <select className="px-2 py-1 rounded text-sm" style={selectStyle} value={newEnf} onChange={e => setNewEnf(e.target.value)}>
                <option value="block">Block</option><option value="warn">Warn</option><option value="info">Info</option>
              </select>
            </div>
            <button onClick={addPolicy} className="px-3 py-1 rounded text-xs font-medium border-none cursor-pointer" style={{ background: 'var(--success)', color: 'white' }}>Save</button>
          </div>
        )}

        {policies.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <Toggle on={p.enabled} onChange={() => toggle(i)} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: p.enabled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{p.name}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{p.description}</div>
              {p.config && Object.entries(p.config).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 mt-1">
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{k}:</span>
                  <input className="px-1.5 py-0.5 rounded text-xs w-20 outline-none" style={selectStyle}
                    value={v} onChange={e => updateConfig(i, k, e.target.value)} />
                </div>
              ))}
            </div>
            <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>{p.id}</span>
            <select className="px-2 py-1 rounded text-xs shrink-0" style={selectStyle} value={p.enforcement} onChange={e => changeEnf(i, e.target.value)}>
              <option value="block">Block</option><option value="warn">Warn</option><option value="info">Info</option>
            </select>
            {enfBadge(p.enforcement)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ SECRETS TAB ═══ */

function SecretsTab() {
  const [secrets, setSecrets] = useState(() => {
    const s = loadPolicies('secretTracker');
    return s || DEF_SECRETS_TRACKER;
  });

  const rotate = (idx) => {
    const next = secrets.map((s, i) => i === idx ? { ...s, lastRotated: new Date().toISOString().split('T')[0] } : s);
    setSecrets(next);
    savePolicies('secretTracker', next);
  };

  return (
    <div>
      <PolicyTab category="secrets" defaults={DEF_SECRETS} />

      <div className="rounded-lg overflow-hidden mt-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="px-4 py-3 text-sm font-semibold flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <Key size={14} style={{ color: 'var(--accent)' }} /> Secret Rotation Tracker
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Secret</th>
              <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Last Rotated</th>
              <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Days Remaining</th>
              <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Status</th>
              <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}></th>
            </tr>
          </thead>
          <tbody>
            {secrets.map((s, i) => {
              const elapsed = daysSince(s.lastRotated);
              const remaining = s.rotationDays - elapsed;
              const color = remaining > 30 ? 'var(--success)' : remaining > 7 ? 'var(--warning)' : 'var(--danger)';
              const label = remaining > 0 ? `${remaining}d` : `${Math.abs(remaining)}d overdue`;
              return (
                <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{s.name}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{s.lastRotated}</td>
                  <td className="px-4 py-2 text-xs font-medium" style={{ color }}>{label}</td>
                  <td className="px-4 py-2"><span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} /></td>
                  <td className="px-4 py-2">
                    <button onClick={() => rotate(i)} className="px-2 py-0.5 rounded text-[10px] font-medium border-none cursor-pointer"
                      style={{ background: 'var(--accent)', color: 'white' }}>Rotate now</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══ DEPLOY TAB ═══ */

function DeployTab() {
  const [freezeWindows, setFreezeWindows] = useState(() => {
    const f = loadPolicies('freezeWindows');
    return f || DEF_FREEZE;
  });
  const freeze = isInFreezeWindow();

  return (
    <div>
      {freeze.frozen && (
        <div className="rounded-lg p-3 mb-6 text-sm flex items-center gap-2" style={{ background: 'rgba(248,81,73,0.1)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          <AlertOctagon size={14} /> DEPLOY FREEZE ACTIVE — PROD deploys blocked until {freeze.endsAt}
        </div>
      )}
      <PolicyTab category="deploy" defaults={DEF_DEPLOY} />

      <div className="rounded-lg p-4 mt-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Clock size={14} style={{ color: 'var(--accent)' }} /> Deploy Freeze Windows
        </div>
        <div className="flex flex-wrap gap-2">
          {freezeWindows.map((w, i) => (
            <span key={i} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(248,81,73,0.08)', color: 'var(--danger)', border: '1px solid rgba(248,81,73,0.2)' }}>
              {w.name}: {w.start} — {w.end} {w.recurring && '(recurring)'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══ COMPLIANCE TAB ═══ */

function ComplianceTab() {
  const exportReport = (type) => {
    const data = {
      type,
      generatedAt: new Date().toISOString(),
      policies: CATS.flatMap(c => (loadPolicies(c.key) || c.defaults).map(p => ({ category: c.label, ...p }))),
      violations: loadViolations().length > 0 ? loadViolations() : DEF_VIOLATIONS,
      score: getComplianceScore(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${type}-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div>
      <PolicyTab category="compliance" defaults={DEF_COMPLIANCE} />
      <div className="rounded-lg p-4 mt-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Compliance Reports</div>
        <div className="flex flex-wrap gap-3">
          {['SOX', 'ISO 27001', 'Audit Trail'].map(r => (
            <button key={r} onClick={() => exportReport(r.toLowerCase().replace(/\s/g, '-'))}
              className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-1.5"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              <Download size={14} /> Export {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══ AI TAB ═══ */

function AITab() {
  return (
    <div>
      <PolicyTab category="ai" defaults={DEF_AI} />
      <div className="rounded-lg p-4 mt-6" style={{ background: 'var(--bg-card)', borderLeft: '3px solid var(--accent)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>
          <Bot size={14} /> Why AI policies matter
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Traditional CI/CD tools enforce static YAML rules. AXOps AI policies understand code context — they read actual changes, analyze dependency graphs, detect PII patterns, and make intelligent risk assessments. This means fewer false positives, smarter gating, and engineering teams that spend less time fighting their pipeline.
        </p>
      </div>
    </div>
  );
}
