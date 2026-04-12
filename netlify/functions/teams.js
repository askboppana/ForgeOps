const fetch = require('node-fetch');

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const fullPath = event.path || '';
  const pathParts = fullPath.split('/').filter(Boolean);
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'teams') {
      segments = pathParts.slice(i + 1);
      break;
    }
  }
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // POST /notify
    if (segments[0] === 'notify' && method === 'POST') {
      const { webhookUrl, card } = body;
      const url = webhookUrl || process.env.TEAMS_WEBHOOK_URL;

      if (!url) {
        return respond(400, { error: 'No webhook URL provided. Set TEAMS_WEBHOOK_URL or pass webhookUrl in body.' });
      }

      if (!card) {
        return respond(400, { error: 'card payload is required' });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      });

      const text = await response.text();

      if (!response.ok) {
        return respond(response.status, { error: text });
      }

      return respond(200, { success: true, response: text });
    }

    return respond(404, { error: 'Not found' });
  } catch (err) {
    console.error('Teams function error:', err.message);
    return respond(500, { error: err.message });
  }
};
