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

function generateMockLogs(query, count) {
  const severities = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
  const hosts = ['runner-01', 'runner-02', 'runner-03', 'build-agent-01', 'build-agent-02'];
  const sources = ['forgeops-pipeline', 'github-actions', 'deploy-service', 'test-runner', 'artifact-manager'];
  const messageTemplates = [
    'Pipeline started for {query}',
    'Building artifact for {query}',
    'Running unit tests for {query}',
    'Deploying {query} to staging',
    'Health check passed for {query}',
    'Container image pushed for {query}',
    'Code analysis completed for {query}',
    'Integration tests passed for {query}',
    'Rollback triggered for {query}',
    'Scaling service {query} to 3 replicas',
    'Cache invalidated for {query}',
    'Security scan completed for {query}',
    'Dependency check passed for {query}',
    'Notification sent for {query}',
    'Metrics collected for {query}',
    'Log rotation completed for {query}',
    'Backup snapshot created for {query}',
    'SSL certificate verified for {query}',
    'DNS resolution completed for {query}',
    'Load balancer updated for {query}',
  ];

  const numEntries = Math.min(count || 15, 50);
  const now = Date.now();
  const results = [];

  for (let i = 0; i < numEntries; i++) {
    const timestamp = new Date(now - i * 30000).toISOString();
    const template = messageTemplates[i % messageTemplates.length];
    const message = template.replace('{query}', query || 'unknown-service');
    results.push({
      timestamp,
      source: sources[i % sources.length],
      host: hosts[i % hosts.length],
      message,
      severity: severities[Math.floor(Math.random() * severities.length)],
    });
  }

  return results;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const fullPath = event.path || '';
  const pathParts = fullPath.split('/').filter(Boolean);
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'splunk') {
      segments = pathParts.slice(i + 1);
      break;
    }
  }
  const method = event.httpMethod;
  const query = event.queryStringParameters || {};

  try {
    // GET /search
    if (segments[0] === 'search' && method === 'GET') {
      const results = generateMockLogs(query.query, parseInt(query.count, 10) || 15);
      return respond(200, { results });
    }

    // GET /logs/:runId
    if (segments[0] === 'logs' && segments.length === 2 && method === 'GET') {
      const runId = segments[1];
      const results = generateMockLogs(`run-${runId}`, 20);
      return respond(200, { results });
    }

    return respond(404, { error: 'Not found' });
  } catch (err) {
    console.error('Splunk function error:', err.message);
    return respond(500, { error: err.message });
  }
};
