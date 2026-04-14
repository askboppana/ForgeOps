const POLICY_KEYS = {
  pipeline: 'axops_pipeline_policies',
  branch: 'axops_branch_policies',
  secrets: 'axops_secret_policies',
  deploy: 'axops_deploy_policies',
  compliance: 'axops_compliance_policies',
  ai: 'axops_ai_policies',
  violations: 'axops_violations',
  secretTracker: 'axops_secrets',
  freezeWindows: 'axops_freeze_windows',
};

function load(key, fallback) {
  try { const d = JSON.parse(localStorage.getItem(key)); return d || fallback; } catch { return fallback; }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function loadPolicies(category) {
  return load(POLICY_KEYS[category], null);
}

export function savePolicies(category, data) {
  save(POLICY_KEYS[category], data);
}

export function loadViolations() {
  return load(POLICY_KEYS.violations, []);
}

export function saveViolation(v) {
  const list = loadViolations();
  list.unshift(v);
  save(POLICY_KEYS.violations, list.slice(0, 200));
}

export function checkPipelinePolicy(policyId) {
  const policies = load(POLICY_KEYS.pipeline, []);
  const p = policies.find(x => x.id === policyId);
  if (!p || !p.enabled) return { allowed: true };
  if (p.enforcement === 'block') return { allowed: false, policy: p, message: p.description };
  if (p.enforcement === 'warn') return { allowed: true, warning: p.description };
  return { allowed: true };
}

export function checkMergePolicy(context) {
  const policies = load(POLICY_KEYS.branch, []);
  const violations = [];
  for (const p of policies) {
    if (!p.enabled) continue;
    if (p.id === 'B-001' && context?.directCommit) violations.push({ policy: p, message: 'Direct commits to main are blocked' });
    if (p.id === 'B-002' && !context?.hasApproval) violations.push({ policy: p, message: 'PR requires at least 1 code review' });
    if (p.id === 'B-003' && context?.scaFailed) violations.push({ policy: p, message: 'SCA scan must pass before merge' });
    if (p.id === 'B-005' && context?.isCherryPick && !context?.hasDoubleApproval) violations.push({ policy: p, message: 'Cherry-pick to main requires 2 approvals' });
  }
  return violations;
}

export function checkDeployPolicy(targetEnv) {
  const policies = load(POLICY_KEYS.deploy, []);
  const violations = [];
  const freeze = isInFreezeWindow();
  if (freeze.frozen && targetEnv === 'PROD') {
    violations.push({ policy: { id: 'D-001', name: 'Deploy freeze' }, message: `Deploy freeze active until ${freeze.endsAt}` });
  }
  for (const p of policies) {
    if (!p.enabled) continue;
    if (p.id === 'D-004' && targetEnv === 'PROD') violations.push({ policy: p, message: p.description, enforcement: p.enforcement });
  }
  return { allowed: violations.filter(v => v.enforcement === 'block' || v.policy?.enforcement === 'block').length === 0, violations };
}

export function isInFreezeWindow() {
  const windows = load(POLICY_KEYS.freezeWindows, []);
  const now = new Date();
  const day = now.getDay();
  for (const w of windows) {
    if (w.name === 'Weekends' && w.recurring && (day === 0 || day === 6)) {
      return { frozen: true, window: w.name, endsAt: 'Mon 8:00 AM' };
    }
    if (!w.recurring && w.start && w.end) {
      const s = new Date(w.start);
      const e = new Date(w.end);
      if (now >= s && now <= e) return { frozen: true, window: w.name, endsAt: w.end };
    }
  }
  return { frozen: false };
}

export function getComplianceScore() {
  const categories = ['pipeline', 'branch', 'secrets', 'deploy', 'compliance', 'ai'];
  let active = 0;
  let total = 0;
  for (const cat of categories) {
    const policies = load(POLICY_KEYS[cat], []);
    total += policies.length;
    active += policies.filter(p => p.enabled).length;
  }
  const violations = loadViolations().filter(v => {
    const d = new Date(v.timestamp);
    return Date.now() - d.getTime() < 7 * 86400000;
  });
  const base = total > 0 ? Math.round((active / total) * 100) : 100;
  const penalty = Math.min(violations.length * 3, 30);
  return { score: Math.max(base - penalty, 0), active, total, violations7d: violations.length };
}

export function getSecretRotationStatus() {
  return load(POLICY_KEYS.secretTracker, []);
}
