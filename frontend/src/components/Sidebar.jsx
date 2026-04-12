import { NavLink, useNavigate } from 'react-router-dom';

const sections = [
  {
    label: 'DELIVERY',
    items: [
      { to: '/overview', icon: '\u{1F4CA}', label: 'Overview' },
      { to: '/commit', icon: '\u270F\uFE0F', label: 'Commit' },
      { to: '/pull-requests', icon: '\u{1F500}', label: 'Merge' },
      { to: '/deploy', icon: '\u{1F680}', label: 'CI/CD' },
    ],
  },
  {
    label: 'QUALITY',
    items: [
      { to: '/security',  icon: '\u{1F6E1}\uFE0F', label: 'Security' },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { to: '/meetings', icon: '\u{1F399}\uFE0F', label: 'Meetings' },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { to: '/notifications', icon: '\u{1F514}', label: 'Notifications' },
      { to: '/team',          icon: '\u{1F465}', label: 'Team' },
      { to: '/support',       icon: '\u{1F3AB}', label: 'Support' },
      { to: '/settings',      icon: '\u2699\uFE0F', label: 'Settings' },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogoClick = () => {
    navigate('/');
    window.location.reload();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
        <span className="logo-icon">
          <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
            <path d="M22 6L10 24h8l-3 12L30 16h-8l3-10z" fill="white" opacity="0.95"/>
            <path d="M22 6L10 24h8l-3 12L30 16h-8l3-10z" fill="url(#bolt-glow)" opacity="0.3"/>
            <defs>
              <linearGradient id="bolt-glow" x1="10" y1="6" x2="30" y2="36">
                <stop offset="0%" stopColor="white"/>
                <stop offset="100%" stopColor="white" stopOpacity="0"/>
              </linearGradient>
            </defs>
          </svg>
        </span>
        <span style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          ForgeOps
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 500, marginLeft: 'auto', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>v7.0</span>
      </div>

      {sections.map((section) => (
        <div key={section.label}>
          <div className="sidebar-section">{section.label}</div>
          <ul className="sidebar-nav">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => isActive ? 'active' : ''}
                  end={item.to === '/overview'}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div style={{ marginTop: 'auto', padding: '14px 16px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite' }} />
        All systems operational
      </div>
    </aside>
  );
}
