import { useEffect } from 'react';

// Supabase가 URL의 인증 토큰을 자동 처리하므로(detectSessionInUrl) 홈으로만 보낸다
export default function AuthCallback() {
  useEffect(() => {
    window.location.replace('/');
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Processing authentication...</p>
      </div>
    </div>
  );
}
