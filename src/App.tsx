import { useEffect, useRef } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { OfficeProvider } from '@/contexts/OfficeContext';
import { track } from '@/lib/analytics';
import Index from './pages/Index';
import Tasks from './pages/Tasks';
import ClockOut from './pages/ClockOut';
import Report from './pages/Report';
import Profile from './pages/Profile';
import Feed from './pages/Feed';
import OfficeSetup from './pages/OfficeSetup';
import Guide from './pages/Guide';

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
          <Toaster />
          <Analytics />
          <BrowserRouter>
            <RouteTracker />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/clock-out" element={<ClockOut />} />
              <Route path="/report" element={<Report />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/office-setup" element={<OfficeSetup />} />
              <Route path="/guide" element={<Guide />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </OfficeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;