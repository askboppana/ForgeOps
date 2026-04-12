const fetch = require('node-fetch');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

function respond(statusCode, body) {
  return { statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

const GITHUB_API = 'https://api.github.com';
const DATA_FILE = 'data/support-tickets.json';

function ghHeaders() {
  return {
    'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

function getRepo() {
  return `${process.env.GITHUB_ORG || 'askboppana'}/ForgeOps`;
}

// Read tickets from GitHub repo file
async function readTickets() {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${getRepo()}/contents/${DATA_FILE}`, { headers: ghHeaders() });
    if (res.status === 404) return { tickets: [], sha: null };
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { tickets: JSON.parse(content), sha: data.sha };
  } catch {
    return { tickets: [], sha: null };
  }
}

// Write tickets to GitHub repo file
async function writeTickets(tickets, sha) {
  const content = Buffer.from(JSON.stringify(tickets, null, 2)).toString('base64');
  const body = {
    message: 'chore: update support tickets [skip ci]',
    content,
  };
  if (sha) body.sha = sha;
  
  await fetch(`${GITHUB_API}/repos/${getRepo()}/contents/${DATA_FILE}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify(body),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const fullPath = event.path || '';
  const pathParts = fullPath.split('/').filter(Boolean);
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'support') { segments = pathParts.slice(i + 1); break; }
  }
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};
  const query = event.queryStringParameters || {};

  try {
    // GET /stats
    if (segments[0] === 'stats' && method === 'GET') {
      const { tickets } = await readTickets();
      const byStatus = {}, byPriority = {}, byCategory = {};
      tickets.forEach(t => {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
        byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
        byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      });
      return respond(200, { total: tickets.length, byStatus, byPriority, byCategory });
    }

    // GET /tickets
    if (segments[0] === 'tickets' && !segments[1] && method === 'GET') {
      const { tickets } = await readTickets();
      let filtered = tickets;
      if (query.status) filtered = filtered.filter(t => t.status === query.status);
      if (query.priority) filtered = filtered.filter(t => t.priority === query.priority);
      if (query.category) filtered = filtered.filter(t => t.category === query.category);
      if (query.search) {
        const s = query.search.toLowerCase();
        filtered = filtered.filter(t => (t.subject || '').toLowerCase().includes(s) || (t.description || '').toLowerCase().includes(s));
      }
      return respond(200, filtered);
    }

    // GET /tickets/:id
    if (segments[0] === 'tickets' && segments[1] && !segments[2] && method === 'GET') {
      const { tickets } = await readTickets();
      const ticket = tickets.find(t => t.id === segments[1]);
      if (!ticket) return respond(404, { error: 'Ticket not found' });
      return respond(200, ticket);
    }

    // POST /tickets (create)
    if (segments[0] === 'tickets' && !segments[1] && method === 'POST') {
      const { tickets, sha } = await readTickets();
      const maxId = tickets.reduce((max, t) => {
        const num = parseInt((t.id || '').replace('SUP-', ''));
        return num > max ? num : max;
      }, 0);
      const newTicket = {
        id: `SUP-${String(maxId + 1).padStart(3, '0')}`,
        ...body,
        status: body.status || 'Open',
        comments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolvedAt: null,
      };
      tickets.unshift(newTicket);
      await writeTickets(tickets, sha);
      return respond(201, newTicket);
    }

    // PUT /tickets/:id (update)
    if (segments[0] === 'tickets' && segments[1] && !segments[2] && method === 'PUT') {
      const { tickets, sha } = await readTickets();
      const idx = tickets.findIndex(t => t.id === segments[1]);
      if (idx === -1) return respond(404, { error: 'Ticket not found' });
      tickets[idx] = { ...tickets[idx], ...body, updatedAt: new Date().toISOString() };
      if (body.status === 'Resolved') tickets[idx].resolvedAt = new Date().toISOString();
      await writeTickets(tickets, sha);
      return respond(200, tickets[idx]);
    }

    // POST /tickets/:id/comment
    if (segments[0] === 'tickets' && segments[1] && segments[2] === 'comment' && method === 'POST') {
      const { tickets, sha } = await readTickets();
      const idx = tickets.findIndex(t => t.id === segments[1]);
      if (idx === -1) return respond(404, { error: 'Ticket not found' });
      const comment = { author: body.author || 'System', text: body.text, timestamp: new Date().toISOString() };
      if (!tickets[idx].comments) tickets[idx].comments = [];
      tickets[idx].comments.push(comment);
      tickets[idx].updatedAt = new Date().toISOString();
      await writeTickets(tickets, sha);
      return respond(201, comment);
    }

    return respond(404, { error: 'Not found', path: segments.join('/') });
  } catch (err) {
    console.error('Support error:', err);
    return respond(500, { error: err.message });
  }
};
