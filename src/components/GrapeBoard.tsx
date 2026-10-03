import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Award, ChevronLeft, ChevronRight } from 'lucide-react';
import AwardCertificate from '@/components/awards/AwardCertificate';
import { certDate, templateAt } from '@/lib/awards';
import { kstToday } from '@/lib/dates';

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
  const [certNo, setCertNo] = useState(1); // 몇 번째 판의 상장을 보고 있는지

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
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700" onClick={() => { setCertNo(completedBoards); setCertOpen(true); }}>
              <Award className="w-3.5 h-3.5 mr-1" /> 상장 보기
            </Button>
          </div>
        )}

        {/* 상장 다이얼로그 — 판마다 다른 디자인, ◀▶로 지난 상장도 */}
        <Dialog open={certOpen} onOpenChange={setCertOpen}>
          <DialogContent className="max-w-sm">
            <AwardCertificate
              data={{
                template: templateAt(certNo - 1),
                serial: `제 ${certNo} 호`,
                awardEmoji: '🍇',
                awardTitle: '포도알 완주상',
                recipient: profile?.nickname || '나',
                highlights: [`포도알 ${BOARD_SIZE * certNo}개`, `출근 ${workDays}일`, `할 일 ${doneTasks}개`],
                body: `위 사람은 포도알 ${BOARD_SIZE * certNo}개를 모으는 동안 꾸준히 출근하고 할 일을 해내어 누가 봐도 "님 좀 짱인 듯"이므로 이 상장을 수여함 🍇`,
                dateLabel: certDate(kstToday()),
                periodLabel: `포도판 ${certNo}판`,
                issuer: '연결오피스',
              }}
            />
            {completedBoards > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button variant="ghost" size="icon" disabled={certNo <= 1} onClick={() => setCertNo(n => n - 1)} aria-label="이전 상장">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600">{certNo} / {completedBoards}</span>
                <Button variant="ghost" size="icon" disabled={certNo >= completedBoards} onClick={() => setCertNo(n => n + 1)} aria-label="다음 상장">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
            <p className="text-center text-[11px] text-gray-400">판을 채울 때마다 다른 디자인의 상장이 나와요 · 캡처해서 자랑해 보세요!</p>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
