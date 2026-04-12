import { useState, useEffect } from 'react';
import { getForgeOpsRepos, jiraSearch, displayKey, typeIcon, statusColor, timeAgo } from '../api';

function StatCard({ label, value, color, icon, subtitle }) {
  return (
    <div className="stat-card animate-fade" style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value" style={{ color, WebkitTextFillColor: color, background: 'none' }}>{value}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{subtitle}</div>}
        </div>
        <div style={{ fontSize: 28, opacity: 0.3 }}>{icon}</div>
      </div>
    </div>
  );
}

function ActivityRow({ issue, onClick }) {
  const status = issue.fields?.status?.name || '';
  const updated = issue.fields?.updated;
  return (
    <div
      className="ticket-row"
      onClick={onClick}
      style={{ borderLeft: `3px solid ${statusColor(status)}`, marginBottom: 2, borderRadius: 6 }}
    >
      <span className="ticket-type">{typeIcon(issue)}</span>
      <span className="ticket-key">{displayKey(issue)}</span>
      <span className="ticket-summary">{issue.fields?.summary || ''}</span>
      <span className="badge" style={{ background: `${statusColor(status)}18`, color: statusColor(status) }}>{status}</span>
      <span className="text-dim text-sm" style={{ flexShrink: 0, minWidth: 50, textAlign: 'right' }}>{timeAgo(updated)}</span>
    </div>
  );
}

export default function Overview() {
  const [stats, setStats] = useState({ repos: 0, openTickets: 0, stories: 0, defects: 0 });
  const [recentIssues, setRecentIssues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [repoData, recentData, openData] = await Promise.allSettled([
          getForgeOpsRepos(),
          jiraSearch('project != "" ORDER BY updated DESC', ['summary', 'status', 'issuetype', 'priority', 'updated', 'fixVersions', 'assignee'], 15),
          jiraSearch('project != "" AND status != Done', ['summary', 'status', 'issuetype'], 1),
        ]);

        const repos = repoData.status === 'fulfilled' ? (repoData.value?.count || 0) : 0;
        const issues = recentData.status === 'fulfilled' ? (recentData.value?.issues || []) : [];
        const openTotal = openData.status === 'fulfilled' ? (openData.value?.total || issues.length) : 0;

        const stories = issues.filter(i => i.fields?.issuetype?.name === 'Story').length;
        const defects = issues.filter(i => i.fields?.issuetype?.name === 'Bug' || (i.fields?.labels || []).includes('defect')).length;

        setStats({
          repos,
          openTickets: openTotal,
          stories,
          defects,
        });
        setRecentIssues(issues.slice(0, 12));
      } catch (e) {
        console.error('Overview load error', e);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1>Overview</h1><p>Loading platform data...</p></div>
        <div className="stat-grid">
          {[1,2,3,4,5].map(i => <div key={i} className="stat-card"><div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8 }} /><div className="skeleton" style={{ height: 32, width: '40%' }} /></div>)}
        </div>
        <div className="card"><div className="skeleton" style={{ height: 200 }} /></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Command Center</h1>
        <p>Enterprise DevSecOps platform health and real-time activity</p>
      </div>

      <div className="stat-grid">
        <StatCard label="ForgeOps Repos" value={stats.repos} color="var(--primary)" icon={'\u{1F4E6}'} subtitle="with CI/CD workflows" />
        <StatCard label="Pipeline Health" value={'\u2014'} color="var(--success)" icon={'\u2705'} subtitle="Run pipeline discovery to see real stats" />
        <StatCard label="Open Tickets" value={stats.openTickets} color="var(--warn)" icon={'\u{1F4CB}'} subtitle="across all releases" />
        <StatCard label="Security Score" value={'\u2014'} color="var(--success)" icon={'\u{1F6E1}'} subtitle="Run a scan" />
        <StatCard label="DORA: Deploy Freq" value={'\u2014'} color="var(--info)" icon={'\u{1F680}'} subtitle="Coming soon" />
      </div>


      {/* Activity feed */}
      <div className="card animate-fade">
        <div className="card-header">
          <span style={{ flex: 1 }}>Recent Activity</span>
          <span className="badge badge-primary">{recentIssues.length} items</span>
        </div>
        {recentIssues.length === 0 ? (
          <div className="empty-state">No recent activity. Connect Jira in Settings to see tickets here.</div>
        ) : (
          <div>
            {recentIssues.map(issue => (
              <ActivityRow key={issue.key} issue={issue} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
