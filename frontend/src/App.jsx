import { BrowserRouter, Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Landing from './pages/Landing';
import Overview from './pages/Overview';
import Pipelines from './pages/Pipelines';
import PullRequests from './pages/PullRequests';
import Deploy from './pages/Deploy';
import Environments from './pages/Environments';
import Security from './pages/Security';
import ALMJira from './pages/ALMJira';
import Meetings from './pages/Meetings';
import Notifications from './pages/Notifications';
import Team from './pages/Team';
import Settings from './pages/Settings';
import Repos from './pages/Repos';
import RepoDetail from './pages/RepoDetail';
import BranchDetail from './pages/BranchDetail';
import RunDetail from './pages/RunDetail';
import Compare from './pages/Compare';
import TicketDetail from './pages/TicketDetail';
import Support from './pages/Support';
import Commit from './pages/Commit';
import AIBot from './components/AIBot';

const PAGE_TITLES = {
  '/overview': 'Overview',
  '/pipelines': 'Pipelines',
  '/pull-requests': 'Merge',
  '/deploy': 'CI/CD',
  '/environments': 'Environments',
  '/security': 'Security',
  '/alm-jira': 'ALM / Jira',
  '/meetings': 'Meetings',
  '/notifications': 'Notifications',
  '/team': 'Team',
  '/settings': 'Settings',
  '/repos': 'Repositories',
  '/support': 'Support',
  '/commit': 'Commit',
};

function buildBreadcrumbs(pathname) {
  // Static pages
  if (PAGE_TITLES[pathname]) {
    return [{ label: PAGE_TITLES[pathname] }];
  }

  const parts = pathname.split('/').filter(Boolean);

  // /repos/:owner/:repo
  if (parts[0] === 'repos' && parts.length === 3) {
    return [
      { label: 'Repositories', to: '/repos' },
      { label: parts[2] },
    ];
  }

  // /repos/:owner/:repo/runs/:runId
  if (parts[0] === 'repos' && parts.length === 5 && parts[3] === 'runs') {
    return [
      { label: 'Repositories', to: '/repos' },
      { label: parts[2], to: `/repos/${parts[1]}/${parts[2]}` },
      { label: `Run #${parts[4]}` },
    ];
  }

  // /repos/:owner/:repo/branch/:branchName
  if (parts[0] === 'repos' && parts.length === 5 && parts[3] === 'branch') {
    return [
      { label: 'Repositories', to: '/repos' },
      { label: parts[2], to: `/repos/${parts[1]}/${parts[2]}` },
      { label: decodeURIComponent(parts[4]) },
    ];
  }

  // /repos/:owner/:repo/compare/:spec
  if (parts[0] === 'repos' && parts.length === 5 && parts[3] === 'compare') {
    return [
      { label: 'Repositories', to: '/repos' },
      { label: parts[2], to: `/repos/${parts[1]}/${parts[2]}` },
      { label: 'Compare' },
    ];
  }

  // /alm/ticket/:key
  if (parts[0] === 'alm' && parts[1] === 'ticket' && parts[2]) {
    return [
      { label: 'ALM / Jira', to: '/alm-jira' },
      { label: parts[2] },
    ];
  }

  return [{ label: 'ForgeOps' }];
}

function TopBar() {
  const location = useLocation();
  const crumbs = buildBreadcrumbs(location.pathname);
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-breadcrumb">
          <span className="text-dim">ForgeOps</span>
          {crumbs.map((crumb, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="topbar-sep">/</span>
              {crumb.to ? (
                <a href={crumb.to} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>{crumb.label}</a>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="topbar-right">
        <div className="topbar-status">
          <span className="topbar-status-dot" />
          <span className="text-sm">All systems operational</span>
        </div>
        <div className="topbar-time text-dim text-sm">
          {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
        <div className="topbar-avatar" title={greeting}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M5 20c0-4 3.5-7 7-7s7 3 7 7"/></svg>
        </div>
      </div>
    </div>
  );
}

function DashboardLayout() {
  const navigate = useNavigate();

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'k') { e.preventDefault(); /* focus search if exists */ }
        if (e.key === '1') { e.preventDefault(); navigate('/overview'); }
        if (e.key === '2') { e.preventDefault(); navigate('/pipelines'); }
        if (e.key === '3') { e.preventDefault(); navigate('/pull-requests'); }
        if (e.key === '4') { e.preventDefault(); navigate('/deploy'); }
        if (e.key === '5') { e.preventDefault(); navigate('/alm-jira'); }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigate]);

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-wrapper">
        <TopBar />
        <main className="main-content">
          <Routes>
            <Route path="/overview" element={<Overview />} />
            <Route path="/pipelines" element={<Pipelines />} />
            <Route path="/pull-requests" element={<PullRequests />} />
            <Route path="/deploy" element={<Deploy />} />
            <Route path="/environments" element={<Environments />} />
            <Route path="/security" element={<Security />} />
            <Route path="/alm-jira" element={<ALMJira />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/team" element={<Team />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/repos" element={<Repos />} />
            <Route path="/repos/:owner/:repo" element={<RepoDetail />} />
            <Route path="/repos/:owner/:repo/branch/:branchName" element={<BranchDetail />} />
            <Route path="/repos/:owner/:repo/runs/:runId" element={<RunDetail />} />
            <Route path="/repos/:owner/:repo/compare/:spec" element={<Compare />} />
            <Route path="/alm/ticket/:key" element={<TicketDetail />} />
            <Route path="/support" element={<Support />} />
            <Route path="/commit" element={<Commit />} />
          </Routes>
        </main>
        <AIBot />
      </div>
    </div>
  );
}

function LandingGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const hasEntered = sessionStorage.getItem('fg_entered') === '1';
  const [showLanding, setShowLanding] = useState(!hasEntered);

  function handleEnter() {
    sessionStorage.setItem('fg_entered', '1');
    setShowLanding(false);
  }

  // Only redirect to landing on cold start if user hasn't entered this session
  useEffect(() => {
    if (!hasEntered && location.pathname !== '/' && location.pathname !== '/landing') {
      navigate('/', { replace: true });
    }
  }, []);

  if (showLanding && (location.pathname === '/' || location.pathname === '/landing')) {
    return <Landing onEnter={handleEnter} />;
  }

  return (
    <Routes>
      <Route path="/*" element={<DashboardLayout />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<LandingGate />} />
      </Routes>
    </BrowserRouter>
  );
}
