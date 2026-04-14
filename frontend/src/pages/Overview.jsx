import { useState, useEffect } from 'react';
import { FolderGit2, Ticket, Activity, Loader2, Server, CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react';
import StatCard from '../components/StatCard';
import TicketRow from '../components/TicketRow';
import Badge from '../components/Badge';
import { api, displayKey, timeAgo } from '../api';
import { getComplianceScore } from '../data/policyEngine';

export default function Overview() {
  const [loading, setLoading] = useState(true);
  const [repoCount, setRepoCount] = useState(null);
  const [ticketCount, setTicketCount] = useState(null);
  const [pipelineHealth, setPipelineHealth] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [recentBuilds, setRecentBuilds] = useState([]);
  const [environments, setEnvironments] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [discovery, jira, builds, envData] = await Promise.all([
          api.discovery.quick(),
          api.jira.search('status != Done ORDER BY updated DESC', 'summary,status,priority,issuetype,labels,assignee', 10),
          api.github.buildHistory(),
          api.github.environments(),
        ]);
        setRepoCount(discovery?.total ?? discovery?.repos?.length ?? discovery?.repoCount ?? 0);
        setTicketCount(jira?.total ?? jira?.issues?.length ?? 0);
        setTickets(jira?.issues || []);
        setEnvironments(envData?.environments || []);

        const buildList = builds?.builds || builds?.runs || (Array.isArray(builds) ? builds : []);
        setRecentBuilds(buildList.slice(0, 10));

        if (buildList.length > 0) {
          const recent = buildList.slice(0, 20);
          const passed = recent.filter((b) => (b?.conclusion || b?.status) === 'success').length;
          setPipelineHealth(recent.length > 0 ? Math.round((passed / recent.length) * 100) : 0);
        } else {
          setPipelineHealth(builds?.healthPercent ?? 0);
        }
      } catch {
        // fail silently
      }
      setLoading(false);
    }
    load();
  }, []);

  const statusIcon = (s) => {
    if (s === 'success') return <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />;
    if (s === 'failure') return <XCircle size={14} style={{ color: 'var(--danger)' }} />;
    return <Clock size={14} style={{ color: 'var(--warning)' }} />;
  };

  const envStatusColor = (s) => {
    if (s === 'healthy') return 'var(--success)';
    if (s === 'degraded') return 'var(--warning)';
    return 'var(--danger)';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Overview</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard value={repoCount} label="ForgeOps Repos" icon={FolderGit2} color="var(--accent)" />
        <StatCard value={ticketCount} label="Open Tickets" icon={Ticket} color="var(--info)" />
        <StatCard value={pipelineHealth != null ? `${pipelineHealth}%` : '--'} label="Pipeline Health" icon={Activity} color="var(--success)" />
        <StatCard value={`${getComplianceScore().score}%`} label="Policy Compliance" icon={ShieldCheck} color="var(--warning)" />
      </div>

      {/* Environment Status */}
      {environments.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Environment Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {environments.map((e) => (
              <div key={e.name} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{e.name}</span>
                  <span className="w-2 h-2 rounded-full" style={{ background: envStatusColor(e.status) }} />
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{e.version} (build #{e.build})</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(e.deployed_at)} ago</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Pipeline Activity */}
      {recentBuilds.length > 0 && (
        <div className="rounded-lg overflow-hidden mb-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 text-sm font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            Recent Pipeline Activity
          </div>
          <table className="w-full text-sm">
            <tbody>
              {recentBuilds.map((b, i) => (
                <tr key={b?.id || b?.run_id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2.5">{statusIcon(b?.conclusion || b?.status)}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-primary)' }}>{b?.repo || b?.name || 'Build'}</td>
                  <td className="px-4 py-2.5">
                    <Badge text={b?.branch || b?.head_branch || 'main'} color="var(--info)" />
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {b?.environment && <span className="mr-2">{b.environment}</span>}
                    {timeAgo(b?.startedAt || b?.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent tickets */}
      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="px-4 py-3 text-sm font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          Recent Activity
        </div>
        {tickets.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            No recent tickets found
          </div>
        ) : (
          tickets.map((t) => <TicketRow key={t.key} issue={t} />)
        )}
      </div>
    </div>
  );
}
