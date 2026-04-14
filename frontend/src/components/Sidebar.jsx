import { NavLink } from 'react-router-dom';
import { BarChart3, Pencil, GitMerge, Rocket, Layers, Shield, ShieldCheck, Mic, Bell, Users, Headphones, Settings } from 'lucide-react';

const sections = [
  {
    label: 'DELIVERY',
    items: [
      { to: '/app', icon: BarChart3, text: 'Overview', end: true },
      { to: '/app/commit', icon: Pencil, text: 'Commit' },
      { to: '/app/merge', icon: GitMerge, text: 'Merge' },
      { to: '/app/cicd', icon: Rocket, text: 'CI/CD' },
      { to: '/app/pipelines', icon: Layers, text: 'Pipelines' },
    ],
  },
  {
    label: 'QUALITY',
    items: [
      { to: '/app/security', icon: Shield, text: 'Security' },
      { to: '/app/policies', icon: ShieldCheck, text: 'Policies' },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { to: '/app/meetings', icon: Mic, text: 'Meetings' },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { to: '/app/notifications', icon: Bell, text: 'Notifications' },
      { to: '/app/team', icon: Users, text: 'Team' },
      { to: '/app/support', icon: Headphones, text: 'Support' },
      { to: '/app/settings', icon: Settings, text: 'Settings' },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside
      className="flex flex-col h-screen shrink-0"
      style={{ width: 220, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="var(--accent)" />
          <path d="M16 6L9 18h5l-2 8L21 14h-5l2-8z" fill="white" />
        </svg>
        <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>ForgeOps</span>
        <span
          className="text-xs px-1.5 py-0.5 rounded font-medium"
          style={{ background: 'rgba(127,119,221,0.15)', color: 'var(--accent)' }}
        >
          v7.0
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {sections.map((sec) => (
          <div key={sec.label} className="mb-4">
            <div
              className="text-[10px] font-semibold tracking-wider px-2 mb-1.5"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {sec.label}
            </div>
            {sec.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm no-underline transition-colors mb-0.5"
                style={({ isActive }) => ({
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  background: isActive ? 'rgba(127,119,221,0.08)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                })}
              >
                <item.icon size={16} />
                {item.text}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="flex items-center gap-2 px-5 py-4 text-xs"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--text-tertiary)' }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
        All systems operational
      </div>
    </aside>
  );
}
