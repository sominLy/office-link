import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Award } from 'lucide-react';

// 포도 스티커판: 출근한 날 1알 + 할 일 3개 완료마다 1알. 30알 = 한 판 완성 → 상장!
const BOARD_SIZE = 30;
// 포도송이 모양 줄 배치 (합 30)
const ROWS = [4, 5, 6, 6, 5, 3, 1];

export default function GrapeBoard() {
  const { user, profile } = useAuth();
  const [workDays, setWorkDays] = useState(0);
  const [doneTasks, setDoneTasks] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [certOpen, setCertOpen] = useState(false);

  const fetchCounts = useCallback(async () => {
    if (!user) return;
    const [{ data: sessions }, { count }] = await Promise.all([
      supabase.from('work_sessions').select('started_at').eq('user_id', user.id),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'done'),
    ]);
    const days = new Set(
      (sessions || []).map(s =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(s.started_at))
      )
    ).size;
    setWorkDays(days);
    setDoneTasks(count || 0);
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const total = workDays + Math.floor(doneTasks / 3);
  const completedBoards = Math.floor(total / BOARD_SIZE);
  const current = total % BOARD_SIZE;

  let grapeIndex = 0;

  return (
    <Card className="border-purple-100 bg-gradient-to-br from-purple-50/60 to-amber-50/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">🍇 포도 스티커판</CardTitle>
        <CardDescription>
          출근한 날 1알, 할 일 3개 완료마다 1알! 30알을 다 모으면 상장이 나와요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 포도송이 */}
        <div className="flex flex-col items-center gap-1 py-1">
          <span className="text-2xl -mb-1">🌿</span>
          {ROWS.map((cols, r) => (
            <div key={r} className="flex gap-1">
              {Array.from({ length: cols }).map((_, c) => {
                const idx = grapeIndex++;
                const filled = idx < current;
                return (
                  <span
                    key={c}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all ${
                      filled
                        ? 'bg-gradient-to-br from-purple-400 to-purple-600 shadow-sm scale-100'
                        : 'bg-white border-2 border-dashed border-purple-200 scale-90'
                    }`}
                  >
                    {filled ? '🍇' : ''}
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        <div className="text-center space-y-1">
          <p className="text-sm text-gray-600">
            {loaded ? (
              <>
                <b className="text-purple-700">{current}</b> / {BOARD_SIZE}알
                <span className="text-gray-400 text-xs ml-2">(출근 {workDays}일 · 할 일 완료 {doneTasks}개)</span>
              </>
            ) : '세는 중...'}
          </p>
          {current >= BOARD_SIZE - 5 && current < BOARD_SIZE && (
            <p className="text-xs text-purple-600">거의 다 왔어요! {BOARD_SIZE - current}알만 더! 🔥</p>
          )}
        </div>

        {/* 완성한 판 = 상장 */}
        {completedBoards > 0 && (
          <div className="flex items-center justify-between bg-white/80 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-sm text-gray-700">
              🏆 완성한 포도판 <b className="text-amber-700">{completedBoards}개</b>
            </p>
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700" onClick={() => setCertOpen(true)}>
              <Award className="w-3.5 h-3.5 mr-1" /> 상장 보기
            </Button>
          </div>
        )}

        {/* 상장 다이얼로그 — 캡처해서 자랑하세요 */}
        <Dialog open={certOpen} onOpenChange={setCertOpen}>
          <DialogContent className="max-w-sm p-0 overflow-hidden bg-transparent border-0 shadow-none">
            <div className="bg-gradient-to-b from-amber-50 to-orange-50 border-[6px] border-double border-amber-500 rounded-lg p-6 text-center space-y-3 shadow-xl">
              <p className="text-xs tracking-[0.3em] text-amber-600 font-semibold">CERTIFICATE OF AWESOME</p>
              <p className="text-3xl">🏆</p>
              <h2 className="text-xl font-bold text-gray-800">상 장</h2>
              <p className="text-sm text-gray-500">제 {completedBoards} 호</p>
              <p className="text-lg font-semibold text-gray-800">{profile?.nickname} 님</p>
              <p className="text-sm text-gray-600 leading-relaxed px-2">
                위 사람은 포도알 {BOARD_SIZE * completedBoards}개를 모으는 동안
                <br />꾸준히 출근하고 할 일을 해내어
                <br />누가 봐도 <b className="text-purple-700">"님 좀 짱인 듯"</b> 이므로
                <br />이 상장을 수여함 🍇
              </p>
              <p className="text-xs text-gray-400 pt-1">
                {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <p className="text-sm font-semibold text-amber-700">연결오피스 🏢</p>
              <p className="text-[10px] text-gray-300">화면을 캡처해서 자랑해 보세요!</p>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
