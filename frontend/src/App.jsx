import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Overview from './pages/Overview';
import Commit from './pages/Commit';
import Merge from './pages/Merge';
import CiCd from './pages/CiCd';
import Security from './pages/Security';
import Meetings from './pages/Meetings';
import Notifications from './pages/Notifications';
import Team from './pages/Team';
import Support from './pages/Support';
import Settings from './pages/Settings';
import Pipelines from './pages/Pipelines';
import Policies from './pages/Policies';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="commit" element={<Commit />} />
          <Route path="merge" element={<Merge />} />
          <Route path="cicd" element={<CiCd />} />
          <Route path="pipelines" element={<Pipelines />} />
          <Route path="security" element={<Security />} />
          <Route path="policies" element={<Policies />} />
          <Route path="meetings" element={<Meetings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="team" element={<Team />} />
          <Route path="support" element={<Support />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
