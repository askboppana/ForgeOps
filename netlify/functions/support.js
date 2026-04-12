// NOTE: This uses in-memory storage which is ephemeral on Netlify.
// For production, replace with a database (e.g., FaunaDB, Supabase, etc.)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

// In-memory ticket store (ephemeral — resets on each cold start)
let tickets = [];

function nextId() {
  if (tickets.length === 0) return 'SUP-001';
  const nums = tickets.map(t => parseInt(t.id.replace('SUP-', ''), 10)).filter(n => !isNaN(n));
  const max = Math.max(0, ...nums);
  return `SUP-${String(max + 1).padStart(3, '0')}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

    const fullPath = event.path || '';
  const pathParts = fullPath.split('/').filter(Boolean);
  // Find 'support' in path and take everything after it
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'support') {
      segments = pathParts.slice(i + 1);
      break;
    }
  }
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};
  const query = event.queryStringParameters || {};

  try {
    // GET /stats
    if (segments[0] === 'stats' && method === 'GET') {
      const byStatus = {};
      const byPriority = {};
      const byCategory = {};

      for (const t of tickets) {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
        byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
        byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      }

      return respond(200, { total: tickets.length, byStatus, byPriority, byCategory });
    }

    // POST /tickets/:id/comment
    if (segments[0] === 'tickets' && segments.length === 3 && segments[2] === 'comment' && method === 'POST') {
      const id = segments[1];
      const idx = tickets.findIndex(t => t.id === id);
      if (idx === -1) return respond(404, { error: 'Ticket not found' });

      const comment = {
        author: body.author || 'Anonymous',
        text: body.text || '',
        timestamp: new Date().toISOString(),
      };

      tickets[idx].comments.push(comment);
      tickets[idx].updatedAt = new Date().toISOString();
      return respond(200, tickets[idx]);
    }

    // GET /tickets/:id
    if (segments[0] === 'tickets' && segments.length === 2 && method === 'GET') {
      const id = segments[1];
      const ticket = tickets.find(t => t.id === id);
      if (!ticket) return respond(404, { error: 'Ticket not found' });
      return respond(200, ticket);
    }

    // PUT /tickets/:id
    if (segments[0] === 'tickets' && segments.length === 2 && method === 'PUT') {
      const id = segments[1];
      const idx = tickets.findIndex(t => t.id === id);
      if (idx === -1) return respond(404, { error: 'Ticket not found' });

      const ticket = tickets[idx];

      for (const key of Object.keys(body)) {
        if (key !== 'id' && key !== 'createdAt') {
          ticket[key] = body[key];
        }
      }

      ticket.updatedAt = new Date().toISOString();

      if (body.status === 'Resolved' || body.status === 'Closed') {
        ticket.resolvedAt = ticket.resolvedAt || new Date().toISOString();
      }

      tickets[idx] = ticket;
      return respond(200, ticket);
    }

    // POST /tickets (create)
    if (segments[0] === 'tickets' && segments.length === 1 && method === 'POST') {
      const id = nextId();
      const now = new Date().toISOString();

      const ticket = {
        id,
        userName: body.userName || '',
        employeeId: body.employeeId || '',
        email: body.email || '',
        category: body.category || 'General Question',
        subcategory: body.subcategory || '',
        priority: body.priority || 'Medium',
        status: 'Open',
        subject: body.subject || '',
        description: body.description || '',
        environment: body.environment || 'N/A',
        repository: body.repository || '',
        branch: body.branch || '',
        screenshots: body.screenshots || [],
        attachments: body.attachments || [],
        comments: [],
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
        assignee: body.assignee || 'Unassigned',
        tags: body.tags || [],
      };

      tickets.push(ticket);
      return respond(200, ticket);
    }

    // GET /tickets (list all with filters)
    if (segments[0] === 'tickets' && segments.length === 1 && method === 'GET') {
      let filtered = [...tickets];
      const { status, priority, category, search } = query;

      if (status) filtered = filtered.filter(t => t.status === status);
      if (priority) filtered = filtered.filter(t => t.priority === priority);
      if (category) filtered = filtered.filter(t => t.category === category);
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(t =>
          (t.subject || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.id || '').toLowerCase().includes(q)
        );
      }

      return respond(200, filtered);
    }

    return respond(404, { error: 'Not found' });
  } catch (err) {
    console.error('Support function error:', err.message);
    return respond(500, { error: err.message });
  }
};
