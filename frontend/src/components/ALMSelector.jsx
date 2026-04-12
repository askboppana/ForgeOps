import { useState, useEffect, useMemo } from 'react';
import { displayKey, typeIcon, statusColor, priorityColor, timeAgo } from '../api';

const API = '/api';

export default function ALMSelector({
  onTicketSelect,
  compact = false,
  preSelectedRelease,
  preSelectedType,
  preSelectedStatus,
  multiSelect = false,
  onSelectionChange,
  showExpandedDetail = false,
  requireRelease = false,
}) {
  const [releases, setReleases] = useState([]);
  const [releaseCounts, setReleaseCounts] = useState({});
  const [selectedRelease, setSelectedRelease] = useState(preSelectedRelease || '');
  const [selectedType, setSelectedType] = useState(preSelectedType || 'all');
  const [selectedStatus, setSelectedStatus] = useState(preSelectedStatus || 'all');
  const [searchFilter, setSearchFilter] = useState('');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedTicket, setExpandedTicket] = useState(null);
  const [multiSelected, setMultiSelected] = useState(new Set());
  const [totalFromServer, setTotalFromServer] = useState(0);

  // Fetch releases and release counts on mount
  useEffect(() => {
    fetch(`${API}/jira/versions`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setReleases(Array.isArray(d) ? d.sort((a, b) => (a.name || '').localeCompare(b.name || '')) : []))
      .catch(() => setReleases([]));

    fetch(`${API}/jira/release-counts`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setReleaseCounts(d || {}))
      .catch(() => setReleaseCounts({}));
  }, []);

  // Fetch tickets when filters change
  useEffect(() => {
    fetchTickets();
  }, [selectedRelease, selectedType, selectedStatus]);

  async function fetchTickets() {
    if (requireRelease && !selectedRelease) {
      setTickets([]);
      setTotalFromServer(0);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedRelease) params.set('release', selectedRelease);
      if (selectedType && selectedType !== 'all') params.set('type', selectedType);
      if (selectedStatus && selectedStatus !== 'all') params.set('status', selectedStatus);
      params.set('maxResults', '100');

      const res = await fetch(`${API}/jira/tickets?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const issues = data?.issues || data || [];
      setTickets(Array.isArray(issues) ? issues : []);
      setTotalFromServer(data?.total || (Array.isArray(issues) ? issues.length : 0));
    } catch {
      setTickets([]);
      setTotalFromServer(0);
    }
    setLoading(false);
  }

  // Collect unique statuses from loaded tickets for the status dropdown
  const availableStatuses = useMemo(() => {
    const set = new Set();
    tickets.forEach(t => {
      const s = t.fields?.status?.name;
      if (s) set.add(s);
    });
    return [...set].sort();
  }, [tickets]);

  // Client-side search filter
  const filteredTickets = useMemo(() => {
    if (!searchFilter) return tickets;
    const q = searchFilter.toLowerCase();
    return tickets.filter(t =>
      displayKey(t).toLowerCase().includes(q) ||
      (t.fields?.summary || '').toLowerCase().includes(q) ||
      (t.fields?.assignee?.displayName || '').toLowerCase().includes(q)
    );
  }, [tickets, searchFilter]);

  function handleRowClick(issue) {
    if (multiSelect) {
      setMultiSelected(prev => {
        const next = new Set(prev);
        if (next.has(issue.key)) next.delete(issue.key);
        else next.add(issue.key);
        if (onSelectionChange) {
          onSelectionChange(tickets.filter(t => next.has(t.key)));
        }
        return next;
      });
    } else {
      if (onTicketSelect) onTicketSelect(issue);
      if (!compact) {
        setExpandedTicket(expandedTicket === issue.key ? null : issue.key);
      }
    }
  }

  // Build breadcrumb
  const breadcrumbParts = ['Jira'];
  if (selectedRelease) {
    const count = releaseCounts[selectedRelease] || filteredTickets.length;
    breadcrumbParts.push(`${selectedRelease} (${count} tickets)`);
  }
  if (selectedType && selectedType !== 'all') {
    breadcrumbParts.push(selectedType === 'Bug' ? 'Defects' : `${selectedType}s`);
  }

  return (
    <div style={{ padding: compact ? '8px' : '0' }}>
      {/* Row of 3 dropdowns */}
      <div className="form-row" style={{ marginBottom: compact ? 8 : 16 }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Release</label>
          <select
            value={selectedRelease}
            onChange={e => setSelectedRelease(e.target.value)}
          >
            <option value="">{requireRelease ? 'Select a release...' : 'All Releases'}</option>
            {releases.map(v => (
              <option key={v.id || v.name} value={v.name}>
                {v.name}{releaseCounts[v.name] != null ? ` (${releaseCounts[v.name]})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Type</label>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="Story">{'\u{1F4D8}'} Stories</option>
            <option value="Bug">{'\u{1F41E}'} Defects</option>
            <option value="Epic">{'\u26A1'} Epics</option>
            <option value="Task">{'\u2705'} Tasks</option>
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Status</label>
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            {availableStatuses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Search input */}
      <div style={{ marginBottom: compact ? 8 : 12 }}>
        <input
          type="search"
          className="search-input"
          style={{ width: '100%' }}
          placeholder="Search by key, summary, or assignee..."
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
        />
      </div>

      {/* Breadcrumb */}
      {!compact && (
        <div className="text-dim text-sm" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
          {breadcrumbParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span style={{ margin: '0 4px', color: 'var(--border-h)' }}>&gt;</span>}
              <span style={{ fontWeight: i === breadcrumbParts.length - 1 ? 600 : 400 }}>{part}</span>
            </span>
          ))}
        </div>
      )}

      {/* Ticket list */}
      {requireRelease && !selectedRelease ? (
        <div className="empty-state" style={{ padding: compact ? 20 : 40 }}>Select a release to view tickets</div>
      ) : loading ? (
        <div className="loading-center"><span className="spinner" /> Loading tickets...</div>
      ) : filteredTickets.length === 0 ? (
        <div className="empty-state">No tickets found</div>
      ) : (
        <div style={{ maxHeight: compact ? 300 : 500, overflowY: 'auto' }}>
          {filteredTickets.map(issue => {
            const status = issue.fields?.status?.name || '';
            const priority = issue.fields?.priority?.name || '';
            const isExpanded = expandedTicket === issue.key && showExpandedDetail && !compact;
            const isMultiChecked = multiSelected.has(issue.key);

            return (
              <div key={issue.key}>
                <div
                  className={`ticket-row${isMultiChecked ? ' selected' : ''}`}
                  onClick={() => handleRowClick(issue)}
                >
                  {multiSelect && (
                    <input
                      type="checkbox"
                      checked={isMultiChecked}
                      onChange={() => {}}
                      style={{ flexShrink: 0, cursor: 'pointer' }}
                    />
                  )}
                  <span className="ticket-type">{typeIcon(issue)}</span>
                  <span className="ticket-key" style={{ color: issue.fields?.issuetype?.name === 'Bug' ? 'var(--error)' : 'var(--primary)' }}>
                    {displayKey(issue)}
                  </span>
                  <span className="ticket-summary">{issue.fields?.summary || ''}</span>
                  <span
                    className="priority-dot"
                    style={{ background: priorityColor(priority) }}
                    title={priority}
                  />
                  <span
                    className="badge status-badge"
                    style={{
                      background: `${statusColor(status)}22`,
                      color: statusColor(status),
                    }}
                  >
                    {status}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    className="animate-fade"
                    style={{
                      padding: '12px 16px 12px 48px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--surface)',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 8 }}>
                      <div>
                        <span className="text-dim" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Priority</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: priorityColor(priority), display: 'inline-block' }} />
                          {priority || 'None'}
                        </div>
                      </div>
                      <div>
                        <span className="text-dim" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Assignee</span>
                        <div style={{ marginTop: 2 }}>{issue.fields?.assignee?.displayName || 'Unassigned'}</div>
                      </div>
                      <div>
                        <span className="text-dim" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Last Updated</span>
                        <div style={{ marginTop: 2 }}>{timeAgo(issue.fields?.updated)}</div>
                      </div>
                      <div>
                        <span className="text-dim" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Release</span>
                        <div style={{ marginTop: 2 }}>{issue.fields?.fixVersions?.[0]?.name || 'Unscheduled'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={(e) => { e.stopPropagation(); if (onTicketSelect) onTicketSelect(issue); }}
                      >
                        View full detail
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer: showing count */}
      {!loading && filteredTickets.length > 0 && (
        <div className="text-dim text-sm" style={{ padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 4 }}>
          Showing {filteredTickets.length} of {totalFromServer} tickets
        </div>
      )}

      {/* Multi-select bottom bar */}
      {multiSelect && multiSelected.size > 0 && (
        <div
          style={{
            padding: '8px 14px',
            background: 'var(--primary-bg)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--primary)',
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span style={{ color: 'var(--primary)' }}>{multiSelected.size} selected</span>
          <button
            className="btn btn-sm"
            onClick={() => { setMultiSelected(new Set()); if (onSelectionChange) onSelectionChange([]); }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
