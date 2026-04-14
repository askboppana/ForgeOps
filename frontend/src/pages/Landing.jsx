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

const integrations = [
  { initial: 'G', name: 'GitHub', color: '#24292E' },
  { initial: 'J', name: 'Jira', color: '#0052CC' },
  { initial: 'S', name: 'Splunk', color: '#65A637' },
  { initial: 'BD', name: 'Black Duck', color: '#3C3C3C' },
  { initial: 'T', name: 'Teams', color: '#5B5FC7' },
  { initial: 'Ch', name: 'Cherwell', color: '#D44638' },
  { initial: 'AI', name: 'Copilot', color: '#7F77DD' },
];

const blogPosts = [
  { title: 'How we reduced deploy time by 80%', time: '3 min read' },
  { title: 'Zero to 700 repos: our CI/CD journey', time: '5 min read' },
  { title: 'AI-powered pipeline debugging', time: '4 min read' },
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
          className="px-10 py-3.5 rounded-lg text-base font-semibold border-none cursor-pointer transition-transform hover:scale-105"
          style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 4px 14px rgba(127,119,221,0.35)' }}
        >
          Open Dashboard
        </button>
      </section>

      {/* Integrations */}
      <section className="max-w-3xl mx-auto px-6 pb-12">
        <p className="text-center text-xs font-medium tracking-wider mb-6" style={{ color: 'var(--text-tertiary)' }}>
          INTEGRATED WITH
        </p>
        <div className="flex justify-center gap-6 flex-wrap">
          {integrations.map(intg => (
            <div key={intg.name} className="flex flex-col items-center gap-1.5" style={{ width: 72 }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: intg.color, color: 'white' }}>
                {intg.initial}
              </div>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{intg.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
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

      {/* Blog / Insights */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <h2 className="text-sm font-semibold mb-4 text-center" style={{ color: 'var(--text-primary)' }}>From the engineering blog</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {blogPosts.map(post => (
            <div key={post.title} className="rounded-xl p-5 transition-colors cursor-pointer hover:shadow-md"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{post.title}</h4>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{post.time}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Read more &rarr;</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-xs" style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--border)' }}>
        ForgeOps Platform v7.0
      </footer>

      {/* WhatsApp floating button — landing page only */}
      <a
        href="https://wa.me/919876543210"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110"
        style={{ bottom: 24, left: 24, width: 48, height: 48, background: '#25D366', zIndex: 50 }}
        title="Chat with us on WhatsApp"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.37 0-4.567-.696-6.418-1.882l-.448-.292-2.644.887.887-2.644-.292-.448C1.696 16.567 1 14.37 1 12 1 5.935 5.935 1 12 1s11 4.935 11 11-4.935 11-11 11z"/>
        </svg>
      </a>
    </div>
  );
}
