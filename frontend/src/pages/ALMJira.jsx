import { useState, useEffect } from 'react';
import { displayKey, typeIcon, statusColor, priorityColor } from '../api';
import ALMSelector from '../components/ALMSelector';
import TicketDetailPanel from '../components/TicketDetailPanel';

const API = '/api';
const BOARD_COLUMNS = ['To Do', 'In Progress', 'In Review', 'Done'];

function classifyColumn(statusName) {
  const s = (statusName || '').toLowerCase();
  if (s.includes('progress')) return 'In Progress';
  if (s.includes('review') || s.includes('test') || s.includes('qa')) return 'In Review';
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'Done';
  return 'To Do';
}

export default function ALMJira() {
  const [view, setView] = useState('list');
  const [detailTicket, setDetailTicket] = useState(null);
  const [stats, setStats] = useState({ total: 0, stories: 0, defects: 0, inProgress: 0 });
  const [boardTickets, setBoardTickets] = useState([]);
  const [loadingBoard, setLoadingBoard] = useState(false);

  // Fetch stats from release-counts
  useEffect(() => {
    fetch(`${API}/jira/release-counts`)
      .then(r => r.ok ? r.json() : {})
      .then(d => {
        if (d && typeof d === 'object') {
          // release-counts may be { "Release 1": 10, "Release 2": 20 } or stats object
          // Sum all counts for total
          const values = Object.values(d);
          const total = values.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
          setStats(prev => ({ ...prev, total: total || prev.total }));
        }
      })
      .catch(() => {});

    // Also fetch a general search for stat cards
    fetch(`${API}/jira/tickets?maxResults=200`)
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        const issues = data?.issues || data || [];
        if (!Array.isArray(issues)) return;
        const open = issues.filter(i => {
          const s = (i.fields?.status?.name || '').toLowerCase();
          return !s.includes('done') && !s.includes('closed') && !s.includes('resolved');
        }).length;
        const stories = issues.filter(i => i.fields?.issuetype?.name === 'Story').length;
        const defects = issues.filter(i => i.fields?.issuetype?.name === 'Bug').length;
        const inProg = issues.filter(i => (i.fields?.status?.name || '').toLowerCase().includes('progress')).length;
        setStats({ total: open, stories, defects, inProgress: inProg });
        setBoardTickets(issues);
      })
      .catch(() => {});
  }, []);

  // Load board tickets when switching to board view
  useEffect(() => {
    if (view === 'board' && boardTickets.length === 0) {
      setLoadingBoard(true);
      fetch(`${API}/jira/tickets?maxResults=200`)
        .then(r => r.ok ? r.json() : {})
        .then(data => {
          const issues = data?.issues || data || [];
          setBoardTickets(Array.isArray(issues) ? issues : []);
        })
        .catch(() => setBoardTickets([]))
        .finally(() => setLoadingBoard(false));
    }
  }, [view]);

  // Build kanban columns
  const columnMap = {};
  BOARD_COLUMNS.forEach(c => (columnMap[c] = []));
  boardTickets.forEach(issue => {
    const col = classifyColumn(issue.fields?.status?.name);
    if (columnMap[col]) columnMap[col].push(issue);
  });

  function handleRefresh() {
    fetch(`${API}/jira/tickets?maxResults=200`)
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        const issues = data?.issues || data || [];
        setBoardTickets(Array.isArray(issues) ? issues : []);
      })
      .catch(() => {});
  }

  return (
    <div>
      <div className="page-header">
        <h1>ALM / Jira</h1>
        <p>Manage stories, defects, and tasks across releases</p>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Open</div>
          <div className="stat-value" style={{ color: 'var(--warn)' }}>{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stories</div>
          <div className="stat-value" style={{ color: 'var(--info)' }}>{stats.stories}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Defects</div>
          <div className="stat-value" style={{ color: 'var(--error)' }}>{stats.defects}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Progress</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{stats.inProgress}</div>
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button
          className={`btn btn-sm${view === 'list' ? ' btn-primary' : ''}`}
          onClick={() => setView('list')}
        >
          List view
        </button>
        <button
          className={`btn btn-sm${view === 'board' ? ' btn-primary' : ''}`}
          onClick={() => setView('board')}
        >
          Board view
        </button>
      </div>

      {/* List view */}
      {view === 'list' && (
        <div className="card">
          <ALMSelector
            showExpandedDetail={true}
            onTicketSelect={(issue) => setDetailTicket(issue)}
          />
        </div>
      )}

      {/* Board view */}
      {view === 'board' && (
        loadingBoard ? (
          <div className="loading-center"><span className="spinner" /> Loading board...</div>
        ) : (
          <div className="kanban-board">
            {BOARD_COLUMNS.map(col => (
              <div key={col} className="kanban-column">
                <div className="kanban-column-header">
                  {col}
                  <span className="col-count">{columnMap[col].length}</span>
                </div>
                {columnMap[col].map(issue => (
                  <div
                    key={issue.key}
                    className="kanban-card"
                    onClick={() => setDetailTicket(issue)}
                  >
                    <div className="kc-key">{typeIcon(issue)} {displayKey(issue)}</div>
                    <div className="kc-summary">{issue.fields?.summary}</div>
                    <div className="kc-footer">
                      <span
                        className="priority-dot"
                        style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: priorityColor(issue.fields?.priority?.name),
                        }}
                      />
                      <span className="text-dim text-sm">
                        {issue.fields?.assignee?.displayName || 'Unassigned'}
                      </span>
                    </div>
                  </div>
                ))}
                {columnMap[col].length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>No tickets in this column</div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Detail panel */}
      {detailTicket && (
        <TicketDetailPanel
          issue={detailTicket}
          onClose={() => setDetailTicket(null)}
          onUpdate={handleRefresh}
        />
      )}
    </div>
  );
}
