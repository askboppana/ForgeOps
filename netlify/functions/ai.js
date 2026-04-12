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

async function callClaude(systemPrompt, userMessage, maxTokens = 4096) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw { status: response.status, body: data };

  const text = data.content && data.content[0] && data.content[0].text;
  return { text, usage: data.usage };
}

function parseJSON(text) {
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    return JSON.parse(match ? match[1].trim() : text);
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const fullPath = event.path || '';
  const pathParts = fullPath.split('/').filter(Boolean);
  let segments = [];
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'ai') {
      segments = pathParts.slice(i + 1);
      break;
    }
  }
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // POST /analyze-transcript
    if (segments[0] === 'analyze-transcript' && method === 'POST') {
      const { transcript, meetingName, participants, model } = body;

      if (!transcript) {
        return respond(400, { error: 'transcript is required' });
      }

      const systemPrompt = `You are a meeting analyst. Analyze the following meeting transcript and provide:
1. **Summary**: A concise summary of the meeting
2. **Key Decisions**: List of decisions made
3. **Action Items**: List of action items with assignees (if mentioned)
4. **Topics Discussed**: Main topics covered
5. **Follow-ups**: Items that need follow-up

Format your response as JSON with keys: summary, keyDecisions, actionItems, topicsDiscussed, followUps.
Each action item should have: description, assignee (or "Unassigned"), priority (High/Medium/Low).`;

      const userMessage = [
        meetingName ? `Meeting: ${meetingName}` : '',
        participants ? `Participants: ${participants.join(', ')}` : '',
        `\nTranscript:\n${transcript}`,
      ].filter(Boolean).join('\n');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return respond(response.status, data);
      }

      const textContent = data.content && data.content[0] && data.content[0].text;
      return respond(200, { result: textContent, usage: data.usage });
    }

    // POST /code-review
    if (segments[0] === 'code-review' && method === 'POST') {
      const { diff, repo, branch } = body;
      if (!diff) return respond(400, { error: 'diff is required' });

      const systemPrompt = `You are an expert code reviewer. Review the provided code diff for bugs, security issues, code smells, and best practices violations. Return your response as JSON with the following structure:
{
  "findings": [
    { "severity": "critical|high|medium|low", "line": <number or null>, "file": "<filename>", "message": "<description>", "suggestion": "<how to fix>" }
  ],
  "summary": "<brief overall assessment>",
  "riskLevel": "critical|high|medium|low|none"
}
If there are no issues, return an empty findings array with riskLevel "none".`;

      const userMessage = `Repository: ${repo || 'unknown'}\nBranch: ${branch || 'unknown'}\n\nDiff:\n${diff.substring(0, 30000)}`;

      const { text, usage } = await callClaude(systemPrompt, userMessage);
      const parsed = parseJSON(text);

      if (parsed) {
        return respond(200, { ...parsed, usage });
      } else {
        return respond(200, { findings: [], summary: text, riskLevel: 'unknown', usage });
      }
    }

    // POST /pr-description
    if (segments[0] === 'pr-description' && method === 'POST') {
      const { diff, commits, ticketKey, ticketSummary } = body;
      if (!diff && (!commits || commits.length === 0)) {
        return respond(400, { error: 'diff or commits required' });
      }

      const systemPrompt = `You are a technical writer generating pull request descriptions. Generate a clear, professional PR description. Return JSON with:
{
  "title": "<concise PR title, max 72 chars>",
  "body": "<markdown PR body with ## Summary, ## Changes, ## Impact sections>",
  "testSuggestions": ["<test case suggestion 1>", "<test case suggestion 2>"]
}`;

      const parts = [];
      if (ticketKey) parts.push(`Jira Ticket: ${ticketKey} - ${ticketSummary || ''}`);
      if (commits && commits.length > 0) parts.push(`Commits:\n${commits.join('\n')}`);
      if (diff) parts.push(`Diff:\n${diff.substring(0, 25000)}`);

      const { text, usage } = await callClaude(systemPrompt, parts.join('\n\n'));
      const parsed = parseJSON(text);

      if (parsed) {
        return respond(200, { ...parsed, usage });
      } else {
        return respond(200, { title: '', body: text, testSuggestions: [], usage });
      }
    }

    // POST /root-cause
    if (segments[0] === 'root-cause' && method === 'POST') {
      const { logs, error, repo, branch } = body;
      if (!logs && !error) return respond(400, { error: 'logs or error is required' });

      const systemPrompt = `You are a DevOps incident analyst. Analyze the pipeline failure logs and identify the root cause. Return JSON with:
{
  "rootCause": "<clear description of what caused the failure>",
  "suggestedFix": "<step-by-step instructions to fix>",
  "severity": "critical|high|medium|low",
  "confidence": "<high|medium|low>",
  "similarIssues": ["<description of similar known issue 1>"]
}`;

      const parts = [];
      if (repo) parts.push(`Repository: ${repo}`);
      if (branch) parts.push(`Branch: ${branch}`);
      if (error) parts.push(`Error: ${error}`);
      if (logs) parts.push(`Logs:\n${logs.substring(0, 30000)}`);

      const { text, usage } = await callClaude(systemPrompt, parts.join('\n'));
      const parsed = parseJSON(text);

      if (parsed) {
        return respond(200, { ...parsed, usage });
      } else {
        return respond(200, { rootCause: text, suggestedFix: '', severity: 'unknown', confidence: 'low', similarIssues: [], usage });
      }
    }

    // POST /changelog
    if (segments[0] === 'changelog' && method === 'POST') {
      const { tickets, fromVersion, toVersion } = body;
      if (!tickets || tickets.length === 0) return respond(400, { error: 'tickets array is required' });

      const systemPrompt = `You are a release manager generating release notes. Generate professional release notes from the provided Jira tickets. Group items by: Features, Bug Fixes, Breaking Changes. Return JSON with:
{
  "changelog": "<full markdown changelog>",
  "features": [{ "key": "<ticket key>", "summary": "<description>" }],
  "bugFixes": [{ "key": "<ticket key>", "summary": "<description>" }],
  "breakingChanges": [{ "key": "<ticket key>", "summary": "<description>" }]
}`;

      const ticketList = tickets.map(t => `- ${t.key} (${t.type || 'Task'}): ${t.summary}`).join('\n');
      const userMessage = `Release: ${fromVersion || '?'} -> ${toVersion || '?'}\n\nTickets:\n${ticketList}`;

      const { text, usage } = await callClaude(systemPrompt, userMessage);
      const parsed = parseJSON(text);

      if (parsed) {
        return respond(200, { ...parsed, usage });
      } else {
        return respond(200, { changelog: text, features: [], bugFixes: [], breakingChanges: [], usage });
      }
    }

    // POST /chat
    if (segments[0] === 'chat' && method === 'POST') {
      const { message, context } = body;
      if (!message) return respond(400, { error: 'message is required' });

      const systemPrompt = `You are ForgeBot, the AI assistant for ForgeOps — an enterprise DevSecOps platform. You help users with:
1. Platform onboarding — how to use ForgeOps features
2. DevSecOps best practices — CI/CD, security scanning, branching strategies
3. Troubleshooting — pipeline failures, merge conflicts, Jira integration issues
4. Training — explaining concepts like SCA, SAST, DAST, SBOM, DORA metrics
5. Support — helping users create support tickets with the right details

ForgeOps modules: Overview, Pipelines (repo discovery), Commit & Merge (branch diff, SCA scan, AI code review), CI/CD (deploy, environments), ALM/Jira (cascading ticket selector), Security, Meetings (AI transcript analysis), Notifications, Settings.

Key features:
- Every merge requires mandatory SCA scan (Black Duck + OWASP + Gitleaks)
- AI code review runs on every merge (Phase 1.5)
- Jira tickets use US-NNN for stories, DEF-NNN for defects
- 4 environments: INT → QA → STAGE → PROD
- Tickets auto-transition on merge events

Be concise, helpful, and always suggest creating a support ticket if the user has an unresolved issue. Format responses with markdown.`;

      const contextInfo = context ? `\n\n[Context: User is on page "${context.page || 'unknown'}"]` : '';
      const userMessage = message + contextInfo;

      const { text, usage } = await callClaude(systemPrompt, userMessage, 2048);

      const suggestTicket = /ticket|issue|problem|error|fail|broken|bug|help/i.test(message);

      return respond(200, { response: text, suggestTicket, usage });
    }

    return respond(404, { error: 'Not found' });
  } catch (err) {
    if (err.status) return respond(err.status, err.body);
    console.error('AI function error:', err.message);
    return respond(500, { error: err.message });
  }
};
