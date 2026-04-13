import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AiAssistant from './AiAssistant';
import ENV from '../data/envBanner';

const ENV_BANNERS = {
  INT: { bg: '#0969DA', label: 'INT Environment — integration testing' },
  QA: { bg: '#D29922', label: 'QA Environment — system integration testing' },
  STAGE: { bg: '#7F77DD', label: 'STAGE Environment — user acceptance testing' },
};

export default function Layout() {
  const banner = ENV_BANNERS[ENV];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {banner && (
        <div className="flex items-center justify-center text-xs font-medium shrink-0"
          style={{ height: 24, background: banner.bg, color: 'white' }}>
          {banner.label}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
          <div className="p-6 max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
        <AiAssistant />
      </div>
    </div>
  );
}
