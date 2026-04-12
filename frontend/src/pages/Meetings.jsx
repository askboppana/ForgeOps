import { useState, useEffect } from 'react';
import { analyzeTranscript } from '../api';

const STORAGE_KEY = 'forgeops-meeting-history';

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
}

export default function Meetings() {
  const [transcript, setTranscript] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleAnalyze = async () => {
    if (!transcript.trim()) return;
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      const result = await analyzeTranscript({ transcript });
      setAnalysis(result);
      const entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        preview: transcript.slice(0, 100) + (transcript.length > 100 ? '...' : ''),
        transcript,
        result,
      };
      const updated = [entry, ...history].slice(0, 20);
      setHistory(updated);
      saveHistory(updated);
      setToast('Transcript analyzed successfully');
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setError('Failed to analyze transcript. Check that the AI service is configured in Settings.');
      console.error(e);
    }
    setLoading(false);
  };

  const loadFromHistory = (entry) => {
    setSelectedHistory(entry.id);
    setTranscript(entry.transcript);
    setAnalysis(entry.result);
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const renderAnalysis = (data) => {
    if (!data) return null;
    if (typeof data === 'string') {
      return <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7 }}>{data}</div>;
    }
    return (
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        {data.summary && (
          <div className="mb-4">
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14, color: 'var(--primary)' }}>Summary</div>
            <p className="text-dim">{data.summary}</p>
          </div>
        )}
        {data.actionItems && data.actionItems.length > 0 && (
          <div className="mb-4">
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14, color: 'var(--primary)' }}>Action Items</div>
            <ul style={{ paddingLeft: 20 }}>
              {data.actionItems.map((item, i) => (
                <li key={i} className="text-dim" style={{ marginBottom: 6, lineHeight: 1.6 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data?.decisions && data.decisions.length > 0 && (
          <div className="mb-4">
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14, color: 'var(--primary)' }}>Decisions</div>
            <ul style={{ paddingLeft: 20 }}>
              {data.decisions?.map((d, i) => (
                <li key={i} className="text-dim" style={{ marginBottom: 6, lineHeight: 1.6 }}>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data?.risks && data.risks.length > 0 && (
          <div className="mb-4">
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14, color: 'var(--warn)' }}>Risks / Blockers</div>
            <ul style={{ paddingLeft: 20 }}>
              {data.risks?.map((r, i) => (
                <li key={i} className="text-dim" style={{ marginBottom: 6 }}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {!data.summary && !data.actionItems && (
          <pre style={{ fontSize: 12, background: 'var(--surface)', padding: 16, borderRadius: 8, overflow: 'auto' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    );
  };

  return (
    <div>
      {toast && <div className="toast toast-success">{toast}</div>}

      <div className="page-header">
        <h1>Meeting Intelligence</h1>
        <p>AI-powered meeting transcript analysis &mdash; extract action items, decisions, and risks</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: history.length > 0 ? '1fr 300px' : '1fr', gap: 20 }}>
        {/* Main Content */}
        <div>
          {/* Input Card */}
          <div className="card mb-4">
            <div className="card-header">Paste Transcript</div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your meeting transcript here. The AI will extract action items, decisions, risks, and a summary..."
              style={{ minHeight: 200 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={loading || !transcript.trim()}
              >
                {loading ? (
                  <><span className="spinner" style={{ width: 14, height: 14 }} /> Analyzing...</>
                ) : (
                  'Analyze with AI'
                )}
              </button>
              {transcript.trim() && (
                <span className="text-dim text-sm">{transcript.split(/\s+/).length} words</span>
              )}
            </div>
            {error && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, color: 'var(--error)', fontSize: 13 }}>
                {error}
              </div>
            )}
          </div>

          {/* Results Card */}
          {analysis ? (
            <div className="card animate-fade">
              <div className="card-header">
                <span style={{ flex: 1 }}>Analysis Results</span>
                <span className="badge badge-ok">Complete</span>
              </div>
              {renderAnalysis(analysis)}
            </div>
          ) : !loading && (
            <div className="card">
              <div className="empty-state-box">
                <div className="empty-icon">&#x1F399;&#xFE0F;</div>
                <div className="empty-title">No analysis yet</div>
                <div className="empty-desc">Paste a meeting transcript above and click &ldquo;Analyze with AI&rdquo; to extract action items, decisions, and a summary.</div>
              </div>
            </div>
          )}
        </div>

        {/* History Sidebar */}
        {history.length > 0 && (
          <div>
            <div className="card" style={{ position: 'sticky', top: 20 }}>
              <div className="card-header">
                <span style={{ flex: 1 }}>History</span>
                <button className="btn btn-sm" onClick={clearHistory}>Clear</button>
              </div>
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {history.map(entry => (
                  <div
                    key={entry.id}
                    onClick={() => loadFromHistory(entry)}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      background: selectedHistory === entry.id ? 'var(--primary-bg)' : 'transparent',
                      borderLeft: selectedHistory === entry.id ? '2px solid var(--primary)' : '2px solid transparent',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                      {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }} className="truncate">
                      {entry.preview}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
