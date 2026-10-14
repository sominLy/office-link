import { useEffect, useRef } from 'react';
import { SnackbarProvider } from '@/seed/ui/snackbar';
import { SnackbarBridge } from '@/lib/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { OfficeProvider } from '@/contexts/OfficeContext';
import { track } from '@/lib/funnel';
import Index from './pages/Index';
import Tasks from './pages/Tasks';
import ClockOut from './pages/ClockOut';
import Report from './pages/Report';
import Profile from './pages/Profile';
import Feed from './pages/Feed';
import OfficeSetup from './pages/OfficeSetup';
import Guide from './pages/Guide';
import LoginRoute from './pages/LoginRoute';
import Retro from './pages/Retro';
import Trophies from './pages/Trophies';
import Alerts from './pages/Alerts';
import { Privacy, Terms } from './pages/Legal';
import TrophyWatcher from '@/components/awards/TrophyWatcher';
import UsageTracker from '@/components/UsageTracker';
import MultiOfficeSyncDialog from '@/components/MultiOfficeSyncDialog';

// 운영 대시보드는 차트 라이브러리가 커서 열 때만 불러온다
const Admin = lazy(() => import('./pages/Admin'));

const queryClient = new QueryClient();


// 앱 진입 1회(app_open)와 화면 이동(page_view)을 적재한다.
// 체류 시간은 같은 visitor_id의 첫·마지막 이벤트 간격으로 분석 때 계산한다.
function RouteTracker() {
  const location = useLocation();
  const { loading } = useAuth();
  const openedRef = useRef(false);

  // 세션 복원이 끝난 뒤에 보낸다. 먼저 보내면 재방문 로그인 유저의 app_open도
  // user_id가 null로 적재돼 user 기준 DAU·리텐션을 뽑을 수 없다.
  useEffect(() => {
    if (loading || openedRef.current) return;
    openedRef.current = true;
    track('app_open');
  }, [loading]);

  useEffect(() => {
    track('page_view', { path: location.pathname });
  }, [location.pathname]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <OfficeProvider>
        <TooltipProvider>
          <SnackbarProvider>
            <SnackbarBridge />
            <Analytics />
            <BrowserRouter>
            {/* 퍼널 이벤트 적재 (화면에 그리는 것 없음) */}
            <RouteTracker />
            <MultiOfficeSyncDialog />
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
              <Route path="/login" element={<LoginRoute />} />
              <Route path="/retro" element={<Retro />} />
              <Route path="/trophies" element={<Trophies />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/admin" element={<Suspense fallback={null}><Admin /></Suspense>} />
              {/* 없는 주소는 빈 화면 대신 첫 화면으로 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          </SnackbarProvider>
        </TooltipProvider>
      </OfficeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;