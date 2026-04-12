const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

function respond(statusCode, body) {
  return { statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const fullPath = event.path || '';
  const pathParts = fullPath.split('/').filter(Boolean);
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'cherwell') { segments = pathParts.slice(i + 1); break; }
  }
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // Placeholder — Cherwell/ServiceNow integration coming soon
    return respond(200, { message: 'Cherwell ITSM integration coming soon. Configure in Settings.' });
  } catch (err) {
    return respond(500, { error: err.message });
  }
};
