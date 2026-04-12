import { useNavigate } from 'react-router-dom';
import { BarChart3, GitMerge, Shield, Rocket, Mic, Headphones } from 'lucide-react';

const features = [
  { icon: BarChart3, title: 'Release Tracking', desc: 'Monitor Jira tickets, story progress, and release health across all active sprints.' },
  { icon: GitMerge, title: 'Branch Management', desc: 'Create branches, review diffs, run SCA scans, and merge with full audit trails.' },
  { icon: Rocket, title: 'CI/CD Pipelines', desc: 'Deploy to any environment and monitor GitHub Actions build history in real time.' },
  { icon: Shield, title: 'Security Scanning', desc: 'Automated SCA vulnerability detection with severity classification and remediation guidance.' },
  { icon: Mic, title: 'Meeting Intelligence', desc: 'AI-powered transcript analysis that extracts action items, decisions, and key insights.' },
  { icon: Headphones, title: 'Support Operations', desc: 'Internal support ticket management with priority routing and SLA tracking.' },
];

export default function Landing() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #F0F1F6 0%, #FFFFFF 40%, #EEF0FF 100%)' }}>
      {/* Nav */}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="var(--accent)" />
            <path d="M16 6L9 18h5l-2 8L21 14h-5l2-8z" fill="white" />
          </svg>
          <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>ForgeOps</span>
        </div>
        <button
          onClick={() => nav('/app')}
          className="px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          Open Dashboard
        </button>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6"
          style={{ background: 'rgba(127,119,221,0.12)', color: 'var(--accent)', border: '1px solid rgba(127,119,221,0.2)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
          Platform v7.0
        </div>
        <h1 className="text-5xl font-bold mb-4 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          ForgeOps
        </h1>
        <p className="text-xl mb-8 max-w-xl" style={{ color: 'var(--text-secondary)' }}>
          Enterprise DevSecOps Command Center. Unified delivery, security, and operations management for engineering teams.
        </p>
        <button
          onClick={() => nav('/app')}
          className="px-8 py-3 rounded-lg text-base font-semibold border-none cursor-pointer transition-transform hover:scale-105"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          Open Dashboard
        </button>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl p-6 transition-colors"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                style={{ background: 'rgba(127,119,221,0.1)' }}
              >
                <f.icon size={20} style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{f.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-xs" style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--border)' }}>
        ForgeOps Platform v7.0
      </footer>
    </div>
  );
}
