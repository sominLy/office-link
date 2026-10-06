import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { OfficeProvider } from '@/contexts/OfficeContext';
import Index from './pages/Index';
import Tasks from './pages/Tasks';
import ClockOut from './pages/ClockOut';
import Report from './pages/Report';
import Profile from './pages/Profile';
import Feed from './pages/Feed';
import OfficeSetup from './pages/OfficeSetup';
import Guide from './pages/Guide';
import Retro from './pages/Retro';
import Trophies from './pages/Trophies';
import TrophyWatcher from '@/components/awards/TrophyWatcher';
import UsageTracker from '@/components/UsageTracker';

// 운영 대시보드는 차트 라이브러리가 커서 열 때만 불러온다
const Admin = lazy(() => import('./pages/Admin'));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <OfficeProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            {/* 할 일 완료·집중·출근 때 새 트로피가 열리면 축하 */}
            <TrophyWatcher />
            {/* 운영 대시보드용 이용 기록 (화면에 그리는 것 없음) */}
            <UsageTracker />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/clock-out" element={<ClockOut />} />
              <Route path="/report" element={<Report />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/office-setup" element={<OfficeSetup />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/retro" element={<Retro />} />
              <Route path="/trophies" element={<Trophies />} />
              <Route path="/admin" element={<Suspense fallback={null}><Admin /></Suspense>} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </OfficeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;