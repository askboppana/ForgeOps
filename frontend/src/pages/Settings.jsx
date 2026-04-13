import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, CheckCircle2, Shield, Layers } from 'lucide-react';
import { ENV_PROFILES, MOCK_REPO_PROFILES, getRepoProfile, setRepoProfile } from '../data/envProfiles';
import EnvFlow from '../components/EnvFlow';

const STORAGE_KEY = 'forgeops_settings';

const defaultSettings = {
  jiraUrl: '',
  jiraProject: '',
  githubOrg: '',
  githubToken: '',
  teamsWebhook: '',
  aiModel: 'gpt-4',
  scaBlockCritical: true,
  scaBlockHigh: false,
  scaBlockMedium: false,
  scaLicenseCheck: true,
};

const ALL_REPO_NAMES = Object.keys(MOCK_REPO_PROFILES);

export default function Settings() {
  const [settings, setSettings] = useState(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('integrations');

  // Profiles
  const [assignRepo, setAssignRepo] = useState('');
  const [assignProfile, setAssignProfile] = useState('standard');
  const [assignments, setAssignments] = useState({});

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      setSettings({ ...defaultSettings, ...s });
    } catch {
      setSettings(defaultSettings);
    }
    // Load profile assignments
    const a = {};
    ALL_REPO_NAMES.forEach(name => {
      a[name] = getRepoProfile(name).id;
    });
    setAssignments(a);
  }, []);

  const update = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAssign = () => {
    if (!assignRepo) return;
    setRepoProfile(assignRepo, assignProfile);
    setAssignments(prev => ({ ...prev, [assignRepo]: assignProfile }));
    setAssignRepo('');
  };

  const Field = ({ label, field, type = 'text', placeholder }) => (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type={type}
        className="w-full px-3 py-2 rounded-lg text-sm border-none outline-none"
        style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        value={settings[field] || ''}
        onChange={(e) => update(field, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );

  const Toggle = ({ label, field, desc }) => (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</div>
        {desc && <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{desc}</div>}
      </div>
      <button
        onClick={() => update(field, !settings[field])}
        className="w-10 h-5 rounded-full relative cursor-pointer border-none transition-colors"
        style={{ background: settings[field] ? 'var(--accent)' : 'var(--border)' }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
          style={{ left: settings[field] ? 20 : 2 }}
        />
      </button>
    </div>
  );

  const profileRepos = (profileId) =>
    Object.entries(assignments).filter(([, pid]) => pid === profileId).map(([name]) => name);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h1>
        <button
          onClick={save}
          className="px-5 py-2 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-2"
          style={{ background: saved ? 'var(--success)' : 'var(--accent)', color: 'white' }}
        >
          {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saved ? 'Saved' : 'Save Settings'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {[
          { id: 'integrations', label: 'Integrations', icon: SettingsIcon },
          { id: 'profiles', label: 'Profiles', icon: Layers },
          { id: 'policy', label: 'SCA Policy', icon: Shield },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer flex items-center gap-1.5"
            style={{
              background: activeTab === t.id ? 'var(--accent)' : 'var(--bg-card)',
              color: activeTab === t.id ? 'white' : 'var(--text-secondary)',
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'integrations' && (
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 text-sm font-semibold flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <SettingsIcon size={14} style={{ color: 'var(--accent)' }} /> Integrations
          </div>
          <div className="p-4 space-y-4">
            <Field label="Jira URL" field="jiraUrl" placeholder="https://your-org.atlassian.net" />
            <Field label="Jira Project Key" field="jiraProject" placeholder="PROJ" />
            <Field label="GitHub Organization" field="githubOrg" placeholder="your-org" />
            <Field label="GitHub Token" field="githubToken" type="password" placeholder="ghp_..." />
            <Field label="Teams Webhook URL" field="teamsWebhook" placeholder="https://outlook.office.com/webhook/..." />
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>AI Model</label>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                value={settings.aiModel}
                onChange={(e) => update('aiModel', e.target.value)}
              >
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="claude-3">Claude 3</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'profiles' && (
        <div className="space-y-6">
          {/* Profile table */}
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="px-4 py-3 text-sm font-semibold flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="flex items-center gap-2"><Layers size={14} style={{ color: 'var(--accent)' }} /> Environment Profiles</span>
              <button className="px-3 py-1 rounded text-xs font-medium border-none cursor-pointer"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                + Create Profile
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Profile</th>
                  <th className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Environment Flow</th>
                  <th className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Repos</th>
                  <th className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {ENV_PROFILES.map(p => {
                  const repos = profileRepos(p.id);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <EnvFlow profile={p} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{repos.length}</span>
                        {repos.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {repos.slice(0, 5).map(r => (
                              <span key={r} className="px-1.5 py-0.5 rounded text-[10px]"
                                style={{ background: p.color + '18', color: p.color }}>
                                {r}
                              </span>
                            ))}
                            {repos.length > 5 && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>+{repos.length - 5} more</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{p.description}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Assign repo */}
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Assign Repository to Profile</div>
            <div className="flex gap-3">
              <select className="px-3 py-2 rounded-lg text-sm flex-1"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                value={assignRepo} onChange={e => setAssignRepo(e.target.value)}>
                <option value="">Select repository...</option>
                {ALL_REPO_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <select className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                value={assignProfile} onChange={e => setAssignProfile(e.target.value)}>
                {ENV_PROFILES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={handleAssign} disabled={!assignRepo}
                className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer"
                style={{ background: 'var(--accent)', color: 'white', opacity: assignRepo ? 1 : 0.5 }}>
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'policy' && (
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 text-sm font-semibold flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <Shield size={14} style={{ color: 'var(--accent)' }} /> SCA Policy
          </div>
          <div className="p-4">
            <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
              Configure which vulnerability severity levels should block merges.
            </p>
            <Toggle label="Block on Critical" field="scaBlockCritical" desc="Prevent merges with critical vulnerabilities" />
            <Toggle label="Block on High" field="scaBlockHigh" desc="Prevent merges with high severity issues" />
            <Toggle label="Block on Medium" field="scaBlockMedium" desc="Prevent merges with medium severity issues" />
            <div className="my-3" style={{ borderTop: '1px solid var(--border)' }} />
            <Toggle label="License Compliance" field="scaLicenseCheck" desc="Check for incompatible open source licenses" />
          </div>
        </div>
      )}
    </div>
  );
}
