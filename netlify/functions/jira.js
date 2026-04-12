const fetch = require('node-fetch');

function getAuth() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

function getBaseUrl() {
  return process.env.JIRA_URL;
}

function getProject() {
  return process.env.JIRA_PROJECT || 'SCRUM';
}

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

// In-memory cache for release-counts
let releaseCountsCache = { data: null, timestamp: 0 };
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

    const fullPath = event.path || '';
  const pathParts = fullPath.split('/').filter(Boolean);
  // Find 'jira' in path and take everything after it
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'jira') {
      segments = pathParts.slice(i + 1);
      break;
    }
  }
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};
  const query = event.queryStringParameters || {};

  try {
    // GET /myself
    if (segments[0] === 'myself' && method === 'GET') {
      const response = await fetch(`${getBaseUrl()}/rest/api/2/myself`, {
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json' },
      });
      const data = await response.json();
      return respond(response.status, data);
    }

    // POST /search
    if (segments[0] === 'search' && method === 'POST') {
      const { jql, maxResults, fields, nextPageToken } = body;
      const fieldArray = Array.isArray(fields) ? fields : (fields || 'summary,status').split(',').map(f => f.trim());
      const reqBody = {
        jql: jql || 'project=' + getProject(),
        maxResults: parseInt(maxResults) || 100,
        fields: fieldArray,
      };
      if (nextPageToken) reqBody.nextPageToken = nextPageToken;
      console.log('Jira search:', reqBody.jql.substring(0, 80), 'max:', reqBody.maxResults);
      const response = await fetch(`${getBaseUrl()}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Jira search error:', response.status, JSON.stringify(data).substring(0, 200));
      }
      return respond(response.status, data);
    }

    // GET /search-all
    if (segments[0] === 'search-all' && method === 'GET') {
      const { jql, fields } = query;
      const allIssues = [];
      const fieldArray = fields ? fields.split(',').map(f => f.trim()) : ['summary', 'status', 'priority', 'issuetype', 'fixVersions', 'assignee'];
      let nextPageToken = null;

      do {
        const reqBody = { jql, maxResults: 100, fields: fieldArray };
        if (nextPageToken) reqBody.nextPageToken = nextPageToken;

        const response = await fetch(`${getBaseUrl()}/rest/api/3/search/jql`, {
          method: 'POST',
          headers: { 'Authorization': getAuth(), 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        });
        const data = await response.json();

        if (!response.ok) {
          return respond(response.status, data);
        }

        allIssues.push(...(data.issues || []));
        nextPageToken = data.nextPageToken || null;
      } while (nextPageToken);

      return respond(200, { issues: allIssues, total: allIssues.length });
    }

    // GET /tickets
    if (segments[0] === 'tickets' && method === 'GET') {
      const { release, type, status, search, maxResults } = query;
      const project = getProject();

      let jql = `project=${project} AND status!=Done`;

      if (release) {
        jql += ` AND fixVersion="${release}"`;
      }
      if (type === 'Story') jql += ' AND issuetype=Story';
      else if (type === 'Bug' || type === 'Defect') jql += ' AND (issuetype=Bug OR labels in (defect, bug))';
      else if (type === 'Task') jql += ' AND issuetype=Task AND labels not in (defect, bug)';
      else if (type === 'Epic') jql += ' AND issuetype=Epic';

      if (status && status !== 'all') {
        jql += ` AND status="${status}"`;
      }

      if (search) {
        jql += ` AND (summary~"${search}" OR description~"${search}")`;
      }

      jql += ' ORDER BY priority ASC, updated DESC';

      const fields = ['summary', 'status', 'priority', 'issuetype', 'fixVersions', 'assignee', 'updated'];

      const reqBody = {
        jql,
        maxResults: parseInt(maxResults) || 100,
        fields,
      };

      console.log('Tickets query:', jql.substring(0, 120));

      const response = await fetch(`${getBaseUrl()}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const data = await response.json();

      if (!response.ok) {
        console.error('Tickets error:', response.status, JSON.stringify(data).substring(0, 200));
      }

      return respond(response.status, data);
    }

    // GET /release-counts
    if (segments[0] === 'release-counts' && method === 'GET') {
      // Return cached data if still fresh
      if (releaseCountsCache.data && (Date.now() - releaseCountsCache.timestamp) < CACHE_TTL) {
        return respond(200, releaseCountsCache.data);
      }

      const project = getProject();
      const jql = `project=${project} AND status!=Done`;
      const fields = ['issuetype', 'fixVersions', 'status', 'summary', 'labels'];
      const allIssues = [];
      let nextPageToken = null;

      do {
        const reqBody = { jql, maxResults: 100, fields };
        if (nextPageToken) reqBody.nextPageToken = nextPageToken;

        const response = await fetch(`${getBaseUrl()}/rest/api/3/search/jql`, {
          method: 'POST',
          headers: { 'Authorization': getAuth(), 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        });
        const data = await response.json();

        if (!response.ok) {
          return respond(response.status, data);
        }

        allIssues.push(...(data.issues || []));
        nextPageToken = data.nextPageToken || null;
      } while (nextPageToken);

      // Group and count
      const releaseMap = {};
      const byType = {};
      const byStatus = {};

      for (const issue of allIssues) {
        const typeName = issue.fields?.issuetype?.name || 'Unknown';
        const summary = issue.fields?.summary || '';
        const labels = issue.fields?.labels || [];
        const isDefect = typeName === 'Bug' || summary.startsWith('[Defect]') || labels.includes('defect') || labels.includes('bug');
        const statusName = issue.fields?.status?.name || 'Unknown';
        const versions = issue.fields?.fixVersions || [];

        const effectiveType = isDefect ? 'Defect' : typeName;
        byType[effectiveType] = (byType[effectiveType] || 0) + 1;

        byStatus[statusName] = (byStatus[statusName] || 0) + 1;

        if (versions.length === 0) {
          if (!releaseMap['Unassigned']) releaseMap['Unassigned'] = { stories: 0, defects: 0, tasks: 0, total: 0 };
          releaseMap['Unassigned'].total++;
          if (typeName === 'Story') releaseMap['Unassigned'].stories++;
          else if (isDefect) releaseMap['Unassigned'].defects++;
          else releaseMap['Unassigned'].tasks++;
        } else {
          for (const v of versions) {
            const vName = v.name || 'Unknown';
            if (!releaseMap[vName]) releaseMap[vName] = { stories: 0, defects: 0, tasks: 0, total: 0 };
            releaseMap[vName].total++;
            if (typeName === 'Story') releaseMap[vName].stories++;
            else if (isDefect) releaseMap[vName].defects++;
            else releaseMap[vName].tasks++;
          }
        }
      }

      const releases = Object.entries(releaseMap).map(([name, counts]) => ({ name, ...counts }));

      const result = {
        releases,
        totalOpen: allIssues.length,
        byType,
        byStatus,
      };

      releaseCountsCache = { data: result, timestamp: Date.now() };

      return respond(200, result);
    }

    // GET /versions
    if (segments[0] === 'versions' && method === 'GET') {
      const project = query.project || getProject();
      const response = await fetch(`${getBaseUrl()}/rest/api/2/project/${project}/versions`, {
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json' },
      });
      const data = await response.json();
      return respond(response.status, data);
    }

    // GET /issue/:key/transitions
    if (segments[0] === 'issue' && segments.length === 3 && segments[2] === 'transitions' && method === 'GET') {
      const key = segments[1];
      const response = await fetch(`${getBaseUrl()}/rest/api/2/issue/${key}/transitions`, {
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json' },
      });
      const data = await response.json();
      return respond(response.status, data);
    }

    // POST /issue/:key/transition
    if (segments[0] === 'issue' && segments.length === 3 && segments[2] === 'transition' && method === 'POST') {
      const key = segments[1];
      const { transitionId } = body;
      const response = await fetch(`${getBaseUrl()}/rest/api/2/issue/${key}/transitions`, {
        method: 'POST',
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ transition: { id: transitionId } }),
      });

      if (response.status === 204) {
        return respond(200, { success: true });
      }
      const data = await response.json();
      return respond(response.status, data);
    }

    // GET /issue/:key/comment
    if (segments[0] === 'issue' && segments.length === 3 && segments[2] === 'comment' && method === 'GET') {
      const key = segments[1];
      const response = await fetch(`${getBaseUrl()}/rest/api/2/issue/${key}/comment`, {
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json' },
      });
      const data = await response.json();
      return respond(response.status, data);
    }

    // POST /issue/:key/comment
    if (segments[0] === 'issue' && segments.length === 3 && segments[2] === 'comment' && method === 'POST') {
      const key = segments[1];
      const { body: commentBody } = body;
      const response = await fetch(`${getBaseUrl()}/rest/api/2/issue/${key}/comment`, {
        method: 'POST',
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody }),
      });
      const data = await response.json();
      return respond(response.status, data);
    }

    // POST /issue (create) — must come after 3-segment checks
    if (segments[0] === 'issue' && segments.length === 1 && method === 'POST') {
      const { project, summary, issuetype, priority, fixVersion, description, labels } = body;
      const fields = {
        project: { key: project || getProject() },
        summary,
        issuetype: { name: issuetype || 'Task' },
      };

      if (priority) fields.priority = { name: priority };
      if (fixVersion) fields.fixVersions = [{ name: fixVersion }];
      if (description) fields.description = description;
      if (labels) fields.labels = labels;

      const response = await fetch(`${getBaseUrl()}/rest/api/2/issue`, {
        method: 'POST',
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      const data = await response.json();
      return respond(response.status, data);
    }

    // GET /issue/:key
    if (segments[0] === 'issue' && segments.length === 2 && method === 'GET') {
      const key = segments[1];
      const response = await fetch(`${getBaseUrl()}/rest/api/2/issue/${key}`, {
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json' },
      });
      const data = await response.json();
      return respond(response.status, data);
    }

    // PUT /issue/:key
    if (segments[0] === 'issue' && segments.length === 2 && method === 'PUT') {
      const key = segments[1];
      const response = await fetch(`${getBaseUrl()}/rest/api/2/issue/${key}`, {
        method: 'PUT',
        headers: { 'Authorization': getAuth(), 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status === 204) {
        return respond(200, { success: true });
      }
      const data = await response.json();
      return respond(response.status, data);
    }

    return respond(404, { error: 'Not found' });
  } catch (err) {
    console.error('Jira function error:', err.message);
    return respond(500, { error: err.message });
  }
};
