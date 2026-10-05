import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </OfficeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;