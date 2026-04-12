import { useState, useEffect } from 'react';
import { getScaConfig } from '../api';

export default function Settings() {
  const [jiraUrl, setJiraUrl] = useState('');
  const [githubOrg, setGithubOrg] = useState('');
  const [teamsWebhook, setTeamsWebhook] = useState('');
  const [saved, setSaved] = useState(false);

  // SCA settings
  const [scaConfig, setScaConfig] = useState(null);
  const [bdUrl, setBdUrl] = useState('');
  const [bdToken, setBdToken] = useState('');
  const [scaBlockCritical, setScaBlockCritical] = useState(true);
  const [scaBlockHigh, setScaBlockHigh] = useState(true);
  const [scaBlockMedium, setScaBlockMedium] = useState(false);
  const [scaEnabled, setScaEnabled] = useState(true);
  const [owaspEnabled, setOwaspEnabled] = useState(true);
  const [gitleaksEnabled, setGitleaksEnabled] = useState(true);
  const [licenseEnabled, setLicenseEnabled] = useState(true);
  const [sastEnabled, setSastEnabled] = useState(true);

  useEffect(() => {
    getScaConfig().then(c => {
      setScaConfig(c);
      if (c?.blackDuck?.url) setBdUrl(c.blackDuck.url);
    }).catch(() => {});
  }, []);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Platform configuration and security scan policies</p>
      </div>

      {/* Integrations */}
      <div className="card mb-4">
        <div className="card-header">Integrations</div>
        <div className="form-group mb-4">
          <label>Jira Base URL</label>
          <input type="text" value={jiraUrl} onChange={e => setJiraUrl(e.target.value)} placeholder="https://your-org.atlassian.net" />
        </div>
        <div className="form-group mb-4">
          <label>GitHub Organization</label>
          <input type="text" value={githubOrg} onChange={e => setGithubOrg(e.target.value)} placeholder="your-org" />
        </div>
        <div className="form-group mb-4">
          <label>Teams Webhook URL</label>
          <input type="text" value={teamsWebhook} onChange={e => setTeamsWebhook(e.target.value)} placeholder="https://outlook.office.com/webhook/..." />
        </div>
        <button className="btn btn-primary" onClick={handleSave}>{saved ? 'Saved!' : 'Save Settings'}</button>
      </div>

      {/* SCA / Security Scan Configuration */}
      <div className="card mb-4" style={{ borderTop: '3px solid var(--error)' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{'\uD83D\uDD12'}</span>
          Security Scan Configuration (SCA)
          <span className="badge" style={{ marginLeft: 'auto', background: 'rgba(220,38,38,0.1)', color: 'var(--error)', fontSize: 10 }}>MANDATORY FOR MERGE</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.6 }}>
          Every merge triggers a mandatory SCA scan. Merge is blocked if findings violate the gate policy below.
          Scans include dependency vulnerability checks, license compliance, secret detection, and static analysis.
        </p>

        {/* Scanner toggles */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 8 }}>Active Scanners</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Black Duck SCA', desc: 'Open-source vulnerability and license scanning', enabled: scaEnabled, set: setScaEnabled, color: '#dc2626' },
              { label: 'OWASP Dependency Check', desc: 'CVE database lookup for all dependencies', enabled: owaspEnabled, set: setOwaspEnabled, color: '#d97706' },
              { label: 'Gitleaks Secret Detection', desc: 'Scans for hardcoded secrets, API keys, passwords', enabled: gitleaksEnabled, set: setGitleaksEnabled, color: '#7c3aed' },
              { label: 'Black Duck License Compliance', desc: 'Detects copyleft and restricted licenses', enabled: licenseEnabled, set: setLicenseEnabled, color: '#0284c7' },
              { label: 'ForgeOps SAST', desc: 'Static analysis: eval(), SQL injection, XSS patterns', enabled: sastEnabled, set: setSastEnabled, color: '#059669' },
            ].map(s => (
              <label key={s.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, background: 'var(--surface)', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)' }}>
                <input type="checkbox" checked={s.enabled} onChange={e => s.set(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                    {s.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{s.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Black Duck configuration */}
        <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Black Duck Server (Optional)</div>
          <p style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
            Connect to your Black Duck server for enterprise-grade SCA. Without it, ForgeOps uses its built-in vulnerability database.
          </p>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Black Duck URL</label>
              <input type="text" value={bdUrl} onChange={e => setBdUrl(e.target.value)} placeholder="https://blackduck.company.com" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>API Token</label>
              <input type="password" value={bdToken} onChange={e => setBdToken(e.target.value)} placeholder="Bearer token" />
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            Set BLACKDUCK_URL and BLACKDUCK_TOKEN in backend/.env for server-side scanning.
          </div>
        </div>

        {/* Gate policy */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 8 }}>Merge Gate Policy</div>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
            Merge is blocked if any finding matches the checked severity levels below. Uncheck to allow merge with those findings (advisory only).
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Block on Critical', color: '#dc2626', checked: scaBlockCritical, set: setScaBlockCritical },
              { label: 'Block on High', color: '#d97706', checked: scaBlockHigh, set: setScaBlockHigh },
              { label: 'Block on Medium', color: '#eab308', checked: scaBlockMedium, set: setScaBlockMedium },
            ].map(p => (
              <label key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', padding: '6px 12px', background: p.checked ? `${p.color}15` : 'transparent', border: `1px solid ${p.checked ? p.color : 'var(--border)'}`, borderRadius: 20 }}>
                <input type="checkbox" checked={p.checked} onChange={e => p.set(e.target.checked)} style={{ width: 14, height: 14 }} />
                <span style={{ color: p.checked ? p.color : 'var(--text-dim)', fontWeight: 600 }}>{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSave}>{saved ? 'Saved!' : 'Save SCA Settings'}</button>
      </div>

      {/* Backend info */}
      <div className="card">
        <div className="card-header">Backend Status</div>
        <div style={{ fontSize: 13 }}>
          <div className="mb-2"><span className="text-dim">API: </span><code style={{ color: 'var(--primary)' }}>/api (Netlify Functions)</code></div>
          <div className="mb-2"><span className="text-dim">Platform: </span><code style={{ color: 'var(--primary)' }}>Netlify Serverless</code></div>
          <div className="mb-2"><span className="text-dim">SCA Scanners: </span><code style={{ color: 'var(--success)' }}>5 active</code></div>
        </div>
      </div>
    </div>
  );
}
