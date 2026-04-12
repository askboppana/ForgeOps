const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

function respond(statusCode, body) {
  return { statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function generateLogs(context, count) {
  const hosts = ['runner-east-01', 'runner-west-02', 'runner-central-03'];
  const severities = ['INFO', 'INFO', 'INFO', 'WARN', 'ERROR', 'INFO', 'DEBUG', 'INFO'];
  const now = Date.now();
  const logs = [];

  const templates = {
    pipeline: [
      'Pipeline triggered by push event on {branch}',
      'Checkout: fetching repository {repo}',
      'Build started: {repo} on {host}',
      'Running unit tests: 142 tests found',
      'Test suite passed: 142/142 (100%)',
      'SCA scan initiated: Gitleaks + OWASP DC',
      'Gitleaks: scanning for secrets... 0 findings',
      'OWASP DC: checking 87 dependencies... 0 critical',
      'Build artifact created: {repo}-1.0.0.jar (24MB)',
      'Deploying to {env} environment...',
      'Health check passed: HTTP 200 in 1.2s',
      'Pipeline completed successfully in 4m 32s',
    ],
    deploy: [
      'Deployment initiated: {repo} → {env}',
      'Pulling image: registry.internal/{repo}:latest',
      'Rolling update started: 3 replicas',
      'Pod {repo}-7d8f9c-xk2pl: Running',
      'Pod {repo}-7d8f9c-m4n5o: Running',
      'Pod {repo}-7d8f9c-p6q7r: Running',
      'Service endpoint healthy: {env}.internal:443',
      'Deployment verified: all pods running',
      'Jira ticket transitioned: Ready for {env_status}',
      'Teams notification sent to #forgeops-alerts',
    ],
    error: [
      'ERROR: Connection refused to {env}-db-01:5432',
      'WARN: Retry 1/3 for database connection',
      'ERROR: Build failed: test suite error in LoginTest.java',
      'WARN: SCA finding: CVE-2024-38816 in spring-webmvc:6.1.6',
      'ERROR: Deploy health check failed: HTTP 503',
      'WARN: Memory usage at 85% on {host}',
    ],
  };

  const queryType = (context || '').toLowerCase().includes('error') ? 'error' :
                    (context || '').toLowerCase().includes('deploy') ? 'deploy' : 'pipeline';
  const msgs = templates[queryType];

  for (let i = 0; i < (count || 15); i++) {
    const msg = msgs[i % msgs.length]
      .replace('{repo}', 'forgeopstest-java-auth-svc')
      .replace('{branch}', 'feature/US-301')
      .replace('{host}', hosts[i % hosts.length])
      .replace('{env}', ['INT', 'QA', 'STAGE', 'PROD'][i % 4])
      .replace('{env_status}', ['Unit Testing', 'SIT', 'UAT', 'Production'][i % 4]);

    logs.push({
      timestamp: new Date(now - (count - i) * 30000).toISOString(),
      source: 'forgeops-pipeline',
      host: hosts[i % hosts.length],
      message: msg,
      severity: msg.startsWith('ERROR') ? 'ERROR' : msg.startsWith('WARN') ? 'WARN' : severities[i % severities.length],
      index: 'forgeops',
      sourcetype: '_json',
    });
  }
  return logs;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const fullPath = event.path || '';
  const pathParts = fullPath.split('/').filter(Boolean);
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'splunk') { segments = pathParts.slice(i + 1); break; }
  }
  const method = event.httpMethod;
  const query = event.queryStringParameters || {};

  try {
    const isConnected = !!process.env.SPLUNK_URL;

    // GET /search
    if (segments[0] === 'search' && method === 'GET') {
      if (isConnected) {
        // Real Splunk query would go here
        return respond(200, { results: [], mock: false, message: 'Splunk integration configured but query not implemented yet' });
      }
      const results = generateLogs(query.query, parseInt(query.count) || 15);
      return respond(200, { results, mock: true, message: 'Mock data — configure SPLUNK_URL for real logs' });
    }

    // GET /logs/:runId
    if (segments[0] === 'logs' && segments[1] && method === 'GET') {
      const results = generateLogs('pipeline', 20);
      return respond(200, { results, runId: segments[1], mock: !isConnected });
    }

    // GET /status
    if (segments[0] === 'status' && method === 'GET') {
      return respond(200, {
        connected: isConnected,
        url: isConnected ? process.env.SPLUNK_URL : null,
        message: isConnected ? 'Connected to Splunk' : 'Not configured — set SPLUNK_URL and SPLUNK_TOKEN',
      });
    }

    return respond(404, { error: 'Not found', path: segments.join('/') });
  } catch (err) {
    return respond(500, { error: err.message });
  }
};
