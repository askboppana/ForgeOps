import { useState, useEffect, useRef } from 'react';
import { getTickets, createTicket, updateTicket, addTicketComment, getTicketStats, timeAgo } from '../api';

const CATEGORIES = ['Pipeline Issue','Security Scan','Jira Integration','Merge Conflict','Access Request','Deployment Failure','General Question','Bug Report','Feature Request'];
const PRIORITIES = ['Critical','High','Medium','Low'];
const STATUSES = ['Open','In Progress','Waiting on User','Resolved','Closed'];
const ENVIRONMENTS = ['N/A','INT','QA','STAGE','PROD'];

const PRIORITY_COLORS = { Critical: 'var(--error)', High: '#f97316', Medium: 'var(--warn)', Low: 'var(--success)' };
const STATUS_COLORS = { Open: 'var(--info)', 'In Progress': '#0284c7', 'Waiting on User': 'var(--warn)', Resolved: 'var(--success)', Closed: 'var(--text-dim)' };

function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{ position:'fixed', top:20, right:20, zIndex:9999, background:'var(--gradient-success)', color:'#fff', padding:'12px 20px', borderRadius:'var(--radius)', boxShadow:'var(--shadow-lg)', fontWeight:600, fontSize:13, animation:'slideUp 0.25s ease' }}>
      {msg}
    </div>
  );
}

export default function Support() {
  const [tab, setTab] = useState('create');
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  // Filters for All Tickets
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // User email stored for "My Tickets"
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('fg_user_email') || '');

  // Form state
  const emptyForm = { userName:'', employeeId:'', email:'', category:'Pipeline Issue', subcategory:'', priority:'Medium', environment:'N/A', repository:'', branch:'', subject:'', description:'', screenshots:[] };
  const [form, setForm] = useState(emptyForm);
  const [previews, setPreviews] = useState([]);

  const loadTickets = async (params = {}) => {
    try {
      const data = await getTickets(params);
      setTickets(data);
    } catch { /* ignore */ }
  };

  const loadStats = async () => {
    try { setStats(await getTicketStats()); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (tab === 'my') loadTickets({ search: userEmail });
    else if (tab === 'all') {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (filterCategory) params.category = filterCategory;
      if (searchQuery) params.search = searchQuery;
      loadTickets(params);
    }
    if (tab === 'all') loadStats();
  }, [tab, filterStatus, filterPriority, filterCategory, searchQuery, userEmail]);

  const handleFiles = (e) => {
    const files = Array.from(e.target.files);
    const readers = files.map(f => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(f);
      });
    });
    Promise.all(readers).then(results => {
      setPreviews(results);
      setForm(prev => ({ ...prev, screenshots: results }));
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const ticket = await createTicket(form);
      setToast(`Ticket ${ticket.id} created`);
      setForm(emptyForm);
      setPreviews([]);
      // Save email for "My Tickets"
      if (form.email) {
        localStorage.setItem('fg_user_email', form.email);
        setUserEmail(form.email);
      }
    } catch (err) {
      setToast('Error creating ticket');
    }
    setLoading(false);
  };

  return (
    <div className="animate-fade">
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}

      <div className="page-header">
        <h1>Support</h1>
        <p>Create and track support tickets for ForgeOps platform issues</p>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>Create Ticket</button>
        <button className={`tab-btn ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>My Tickets</button>
        <button className={`tab-btn ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All Tickets</button>
      </div>

      {tab === 'create' && (
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group" style={{ flex:1 }}>
                <label>Your Name *</label>
                <input type="text" value={form.userName} onChange={e => setForm({...form, userName:e.target.value})} required />
              </div>
              <div className="form-group" style={{ flex:1 }}>
                <label>Employee ID *</label>
                <input type="text" placeholder="EMP-12345" value={form.employeeId} onChange={e => setForm({...form, employeeId:e.target.value})} required />
              </div>
              <div className="form-group" style={{ flex:1 }}>
                <label>Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} required />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex:1 }}>
                <label>Category *</label>
                <select value={form.category} onChange={e => setForm({...form, category:e.target.value})} required>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex:1 }}>
                <label>Subcategory</label>
                <input type="text" placeholder="e.g., Gitleaks false positive" value={form.subcategory} onChange={e => setForm({...form, subcategory:e.target.value})} />
              </div>
              <div className="form-group" style={{ flex:1 }}>
                <label>Priority</label>
                <select value={form.priority} onChange={e => setForm({...form, priority:e.target.value})}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex:1 }}>
                <label>Environment</label>
                <select value={form.environment} onChange={e => setForm({...form, environment:e.target.value})}>
                  {ENVIRONMENTS.map(env => <option key={env}>{env}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex:1 }}>
                <label>Repository</label>
                <input type="text" placeholder="e.g., java-svc-001" value={form.repository} onChange={e => setForm({...form, repository:e.target.value})} />
              </div>
              <div className="form-group" style={{ flex:1 }}>
                <label>Branch</label>
                <input type="text" placeholder="e.g., feature/US-377" value={form.branch} onChange={e => setForm({...form, branch:e.target.value})} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex:1 }}>
                <label>Subject *</label>
                <input type="text" value={form.subject} onChange={e => setForm({...form, subject:e.target.value})} required />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex:1 }}>
                <label>Description *</label>
                <textarea style={{ minHeight:150 }} placeholder="Describe the issue in detail..." value={form.description} onChange={e => setForm({...form, description:e.target.value})} required />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex:1 }}>
                <label>Screenshots</label>
                <input type="file" accept=".png,.jpg,.jpeg,.gif" multiple onChange={handleFiles} style={{ background:'none', border:'none', padding:0 }} />
                {previews.length > 0 && (
                  <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                    {previews.map((src, i) => <img key={i} src={src} alt="" style={{ width:80, height:60, objectFit:'cover', borderRadius:'var(--radius)', border:'1px solid var(--border)' }} />)}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop:12 }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <><span className="spinner" style={{ width:14, height:14 }} /> Creating...</> : 'Create Support Ticket'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'my' && (
        <div className="card">
          <div className="form-row" style={{ marginBottom:16 }}>
            <div className="form-group" style={{ maxWidth:300 }}>
              <label>Your Email</label>
              <input type="email" placeholder="Enter your email to find tickets" value={userEmail} onChange={e => { setUserEmail(e.target.value); localStorage.setItem('fg_user_email', e.target.value); }} />
            </div>
          </div>
          <TicketTable tickets={tickets} onSelect={setSelected} />
        </div>
      )}

      {tab === 'all' && (
        <div className="card">
          {stats && (
            <div className="stat-grid" style={{ marginBottom:20 }}>
              <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{stats.total}</div></div>
              <div className="stat-card"><div className="stat-label">Open</div><div className="stat-value">{stats.byStatus?.Open || 0}</div></div>
              <div className="stat-card"><div className="stat-label">In Progress</div><div className="stat-value">{stats.byStatus?.['In Progress'] || 0}</div></div>
              <div className="stat-card"><div className="stat-label">Resolved</div><div className="stat-value">{stats.byStatus?.Resolved || 0}</div></div>
            </div>
          )}
          <div className="toolbar">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ maxWidth:160 }}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ maxWidth:160 }}>
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ maxWidth:180 }}>
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <input type="search" className="search-input" placeholder="Search tickets..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <TicketTable tickets={tickets} onSelect={setSelected} />
        </div>
      )}

      {selected && <TicketDetailPanel ticket={selected} onClose={() => { setSelected(null); if (tab === 'my') loadTickets({ search: userEmail }); else if (tab === 'all') loadTickets({}); }} onUpdate={(updated) => setSelected(updated)} />}
    </div>
  );
}

function TicketTable({ tickets, onSelect }) {
  if (tickets.length === 0) return (
    <div className="empty-state-box">
      <div className="empty-icon">&#x1F3AB;</div>
      <div className="empty-title">No tickets found</div>
      <div className="empty-desc">No support tickets match your criteria. Create a new ticket using the form above.</div>
    </div>
  );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Created</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map(t => (
            <tr key={t.id}>
              <td style={{ fontFamily:"'JetBrains Mono', monospace", fontWeight:700, color:'var(--primary)', fontSize:12 }}>{t.id}</td>
              <td className="truncate" style={{ maxWidth:250 }}>{t.subject}</td>
              <td><span className="badge badge-info">{t.category}</span></td>
              <td><span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:'50%', background:PRIORITY_COLORS[t.priority] || 'var(--text-dim)', boxShadow:`0 0 6px ${PRIORITY_COLORS[t.priority] || 'var(--text-dim)'}` }} /><span style={{ fontSize:12 }}>{t.priority}</span></span></td>
              <td><span className="badge" style={{ background:`${STATUS_COLORS[t.status]}18`, color:STATUS_COLORS[t.status] }}>{t.status}</span></td>
              <td style={{ fontSize:12, color:'var(--text-dim)' }}>{timeAgo(t.createdAt)}</td>
              <td><button className="btn btn-sm" onClick={() => onSelect(t)}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketDetailPanel({ ticket, onClose, onUpdate }) {
  const [commentText, setCommentText] = useState('');
  const [data, setData] = useState(ticket);
  const [lightbox, setLightbox] = useState(null);

  const handleComment = async () => {
    if (!commentText.trim()) return;
    try {
      const updated = await addTicketComment(data.id, data.userName || 'User', commentText);
      setData(updated);
      onUpdate(updated);
      setCommentText('');
    } catch { /* ignore */ }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const updated = await updateTicket(data.id, { status: newStatus });
      setData(updated);
      onUpdate(updated);
    } catch { /* ignore */ }
  };

  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <div className="detail-panel">
        <button className="dp-close" onClick={onClose}>x</button>
        <div className="dp-header">
          <div className="dp-title">
            <span style={{ fontFamily:"'JetBrains Mono', monospace", color:'var(--primary)' }}>{data.id}</span>
            <span>{data.subject}</span>
          </div>
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            <span className="badge" style={{ background:`${STATUS_COLORS[data.status]}18`, color:STATUS_COLORS[data.status] }}>{data.status}</span>
            <span className="badge" style={{ background:`${PRIORITY_COLORS[data.priority]}18`, color:PRIORITY_COLORS[data.priority] }}>{data.priority}</span>
            <span className="badge badge-info">{data.category}</span>
          </div>
        </div>
        <div className="dp-body">
          <div className="dp-actions">
            {STATUSES.map(s => (
              <button key={s} className={`btn btn-sm ${s === data.status ? 'btn-primary' : ''}`} onClick={() => handleStatusChange(s)}>{s}</button>
            ))}
          </div>

          <div className="dp-field"><div className="dp-field-label">Submitted By</div><div className="dp-field-value">{data.userName} ({data.employeeId}) - {data.email}</div></div>
          <div className="dp-field"><div className="dp-field-label">Subcategory</div><div className="dp-field-value">{data.subcategory || '-'}</div></div>
          <div className="dp-field"><div className="dp-field-label">Environment</div><div className="dp-field-value">{data.environment}</div></div>
          {data.repository && <div className="dp-field"><div className="dp-field-label">Repository</div><div className="dp-field-value">{data.repository}</div></div>}
          {data.branch && <div className="dp-field"><div className="dp-field-label">Branch</div><div className="dp-field-value">{data.branch}</div></div>}
          <div className="dp-field"><div className="dp-field-label">Description</div><div className="dp-field-value" style={{ whiteSpace:'pre-wrap' }}>{data.description}</div></div>
          <div className="dp-field"><div className="dp-field-label">Created</div><div className="dp-field-value">{new Date(data.createdAt).toLocaleString()}</div></div>
          {data.resolvedAt && <div className="dp-field"><div className="dp-field-label">Resolved</div><div className="dp-field-value">{new Date(data.resolvedAt).toLocaleString()}</div></div>}
          <div className="dp-field"><div className="dp-field-label">Assignee</div><div className="dp-field-value">{data.assignee}</div></div>

          {data?.screenshots && data.screenshots.length > 0 && (
            <div className="dp-field">
              <div className="dp-field-label">Screenshots</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
                {data.screenshots?.map((src, i) => (
                  <img key={i} src={src} alt="" style={{ width:100, height:75, objectFit:'cover', borderRadius:'var(--radius)', border:'1px solid var(--border)', cursor:'pointer' }} onClick={() => setLightbox(src)} />
                ))}
              </div>
            </div>
          )}

          <div className="dp-comments">
            <div className="dp-field-label">Comments ({data.comments?.length || 0})</div>
            {(data.comments || []).map((c, i) => (
              <div key={i} className="dp-comment">
                <div className="dp-comment-author">{c.author}</div>
                <div className="dp-comment-body">{c.text}</div>
                <div className="dp-comment-date">{timeAgo(c.timestamp)}</div>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <input type="text" placeholder="Add a comment..." value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleComment(); }} />
              <button className="btn btn-sm btn-primary" onClick={handleComment}>Add</button>
            </div>
          </div>
        </div>
      </div>

      {lightbox && (
        <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" style={{ maxWidth:'90vw', maxHeight:'90vh', borderRadius:8 }} />
        </div>
      )}
    </>
  );
}
