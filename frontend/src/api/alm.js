const API = '/api';

const ALM_TOOLS = {
  jira: {
    name: 'Jira',
    icon: '\u{1F537}',
    getReleases: async () => { const r = await fetch(API + '/jira/versions'); return r.json(); },
    getReleaseCounts: async () => { const r = await fetch(API + '/jira/release-counts'); return r.json(); },
    getTickets: async (params) => { const r = await fetch(API + '/jira/tickets?' + new URLSearchParams(params)); return r.json(); },
    getTicket: async (key) => { const r = await fetch(API + '/jira/issue/' + key); return r.json(); },
    getTransitions: async (key) => { const r = await fetch(API + '/jira/issue/' + key + '/transitions'); return r.json(); },
    transitionTicket: async (key, tid) => { const r = await fetch(API + '/jira/issue/' + key + '/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transitionId: tid }) }); return r.json(); },
    addComment: async (key, body) => { const r = await fetch(API + '/jira/issue/' + key + '/comment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) }); return r.json(); },
    getComments: async (key) => { const r = await fetch(API + '/jira/issue/' + key + '/comment'); return r.json(); },
    createTicket: async (data) => { const r = await fetch(API + '/jira/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return r.json(); },
    types: ['Story', 'Bug', 'Epic', 'Task'],
    statuses: ['To Do', 'In Progress', 'In Review', 'Ready for Unit Testing', 'Unit Testing Complete', 'Ready for SIT', 'SIT Complete', 'Ready for UAT', 'UAT Complete', 'Deployed to Production', 'Done'],
  },
  salesforce: {
    name: 'Salesforce',
    icon: '\u2601\uFE0F',
    getReleases: async () => [],
    getReleaseCounts: async () => ({ releases: [], totalOpen: 0, byType: {}, byStatus: {} }),
    getTickets: async () => ({ issues: [], total: 0 }),
    types: ['User Story', 'Bug', 'Epic'],
    statuses: ['New', 'Active', 'Resolved', 'Closed'],
  },
  azure: {
    name: 'Azure DevOps',
    icon: '\u{1F536}',
    getReleases: async () => [],
    getReleaseCounts: async () => ({ releases: [], totalOpen: 0, byType: {}, byStatus: {} }),
    getTickets: async () => ({ issues: [], total: 0 }),
    types: ['User Story', 'Bug', 'Feature', 'Task'],
    statuses: ['New', 'Active', 'Resolved', 'Closed'],
  },
};

export function getALMTool() {
  return ALM_TOOLS[localStorage.getItem('fg_alm_tool') || 'jira'] || ALM_TOOLS.jira;
}

export function getALMToolName() {
  return localStorage.getItem('fg_alm_tool') || 'jira';
}

export function setALMTool(name) {
  localStorage.setItem('fg_alm_tool', name);
}

export { ALM_TOOLS };
