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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <OfficeProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/clock-out" element={<ClockOut />} />
              <Route path="/report" element={<Report />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/feed" element={<Feed />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </OfficeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;