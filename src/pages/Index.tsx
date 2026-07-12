import { isSupabaseConfigured } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AuthenticatedApp from '@/components/AuthenticatedApp';

function SetupGuide() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-4">
      <Card className="w-full max-w-lg shadow-lg border-0">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center">
            <span className="text-3xl">🏢</span>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-800">연결오피스</CardTitle>
          <p className="text-gray-500 text-sm mt-1">함께 일하는 가상 오피스</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="font-semibold text-amber-800 text-sm mb-2">⚙️ Supabase 연결이 필요합니다</h3>
            <p className="text-amber-700 text-xs leading-relaxed">
              이 앱을 사용하려면 Supabase 프로젝트를 연결해야 합니다.
              플랫폼 설정에서 Supabase를 연결한 후 환경변수를 설정해 주세요.
            </p>
          </div>
          <div className="space-y-3">
            <h4 className="font-medium text-gray-700 text-sm">주요 기능</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white border border-gray-100 rounded-lg p-3">
                <span className="text-lg">⏰</span>
                <p className="text-xs text-gray-600 mt-1">출근/퇴근 관리</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-lg p-3">
                <span className="text-lg">👥</span>
                <p className="text-xs text-gray-600 mt-1">실시간 상태 확인</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-lg p-3">
                <span className="text-lg">📋</span>
                <p className="text-xs text-gray-600 mt-1">주간 업무 관리</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-lg p-3">
                <span className="text-lg">🎯</span>
                <p className="text-xs text-gray-600 mt-1">집중 타이머</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Index() {
  if (!isSupabaseConfigured()) {
    return <SetupGuide />;
  }

  return <AuthenticatedApp />;
}