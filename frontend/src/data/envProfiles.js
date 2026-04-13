export const ENV_PROFILES = [
  {
    id: 'full',
    name: 'Full',
    color: '#7F77DD',
    environments: ['DEV', 'INT', 'QA', 'STAGE', 'PROD'],
    description: 'Critical services, customer-facing apps',
    repoCount: 45
  },
  {
    id: 'standard',
    name: 'Standard',
    color: '#3FB950',
    environments: ['DEV', 'INT', 'QA', 'PROD'],
    description: 'Most repos — skip staging',
    repoCount: 98
  },
  {
    id: 'lightweight',
    name: 'Lightweight',
    color: '#D29922',
    environments: ['DEV', 'INT', 'PROD'],
    description: 'Internal tools, scripts, bots',
    repoCount: 42
  },
  {
    id: 'direct',
    name: 'Direct',
    color: '#F85149',
    environments: ['DEV', 'PROD'],
    description: 'Static sites, docs, config repos',
    repoCount: 15
  }
];

export const ALL_ENVS = ['DEV', 'INT', 'QA', 'STAGE', 'PROD'];

export const MOCK_REPO_PROFILES = {
  'ForgeOps': 'standard',
  'admin-dashboard-web': 'standard',
  'auth-service': 'full',
  'java-svc-payments': 'full',
  'java-svc-auth': 'full',
  'spring-boot-orders': 'full',
  'react-customer-portal': 'full',
  'node-api-gateway': 'full',
  'dotnet-billing': 'full',
  'py-data-pipeline': 'standard',
  'py-ml-analytics': 'standard',
  'react-admin-panel': 'standard',
  'node-notification-svc': 'standard',
  'uipath-bot-invoicing': 'lightweight',
  'uipath-bot-onboarding': 'lightweight',
  'rpa-expense-processor': 'lightweight',
  'sf-apex-triggers': 'lightweight',
  'sfdc-flow-automation': 'lightweight',
  'informatica-etl-pipeline': 'lightweight',
  'infa-mapping-customers': 'lightweight',
  'devops-scripts': 'direct',
  'ci-templates': 'direct',
  'infrastructure-config': 'direct',
  'docs-wiki': 'direct',
  'tool-secret-scanner': 'direct',
};

export function getRepoProfile(repoName) {
  const profileId = MOCK_REPO_PROFILES[repoName] || localStorage.getItem('profile_' + repoName) || 'standard';
  return ENV_PROFILES.find(p => p.id === profileId) || ENV_PROFILES[1];
}

export function setRepoProfile(repoName, profileId) {
  localStorage.setItem('profile_' + repoName, profileId);
}

export function getNextEnv(profile, currentEnv) {
  const envs = profile.environments;
  const idx = envs.indexOf(currentEnv);
  if (idx === -1 || idx === envs.length - 1) return null;
  return envs[idx + 1];
}
