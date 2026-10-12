import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';

/**
 * /login 전용 경로. 랜딩에서 넘어온 사람만 폼을 본다.
 * 이미 로그인한 상태로 이 주소를 열면 앱으로 돌려보낸다 — 로그인한 사람에게
 * 로그인 폼을 보여줄 이유가 없다.
 */
export default function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}
