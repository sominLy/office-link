import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import Login from '@/pages/Login';
import ProfileSetup from '@/pages/ProfileSetup';
import OfficeSetup from '@/pages/OfficeSetup';
import Home from '@/pages/Home';

export default function AuthenticatedApp() {
  const { user, profile, loading: authLoading } = useAuth();
  const { office, loading: officeLoading } = useOffice();

  if (authLoading || officeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50">
        <div className="text-center">
          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-3 animate-pulse">
            <span className="text-2xl">🏢</span>
          </div>
          <p className="text-gray-500 text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;
  if (!profile) return <ProfileSetup />;
  if (!office) return <OfficeSetup />;
  return <Home />;
}