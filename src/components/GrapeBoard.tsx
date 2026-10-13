import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { ActionButton } from '@/seed/ui/action-button';
import { Award, ChevronLeft, ChevronRight } from 'lucide-react';
import AwardCertificate from '@/components/awards/AwardCertificate';
import { certDate, templateAt } from '@/lib/awards';
import { kstToday } from '@/lib/dates';
import GrapeCluster from '@/components/illustrations/GrapeCluster';

import { Icon } from '@seed-design/react';
// 포도 스티커판: 출근한 날 1알 + 할 일 3개 완료마다 1알. 30알 = 한 판 완성 → 상장!
const BOARD_SIZE = 30;

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

  return (
    <Card className="border-stroke-neutral-subtle bg-bg-neutral-muted">
      <CardHeader>
        <CardTitle className="text-t5">포도 스티커판</CardTitle>
        <CardDescription>
          출근한 날 1알, 할 일 3개를 끝내면 1알. 30알을 모으면 상장이 나와요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 포도송이 — 이모지 대신 직접 그린 SVG */}
        <div className="flex justify-center py-x2 text-fg-neutral-subtle">
          <GrapeCluster filled={current} className="w-[12.5rem] h-auto" />
        </div>

        <div className="text-center space-y-1">
          <p className="text-t4 text-fg-neutral-muted">
            {loaded ? (
              <>
                <b className="text-fg-brand">{current}</b> / {BOARD_SIZE}알
                <span className="text-fg-neutral-muted text-t2 ml-2">(출근 {workDays}일 · 할 일 완료 {doneTasks}개)</span>
              </>
            ) : '세는 중...'}
          </p>
          {current >= BOARD_SIZE - 5 && current < BOARD_SIZE && (
            <p className="text-t2 text-fg-brand">{BOARD_SIZE - current}알만 더 모으면 한 판이에요</p>
          )}
        </div>

        {/* 완성한 판 = 상장 */}
        {completedBoards > 0 && (
          <div className="flex items-center justify-between bg-white/80 border border-stroke-brand-weak rounded-lg px-3 py-2">
            <p className="text-t4 text-fg-neutral-muted">
              완성한 포도판 <b className="text-fg-brand">{completedBoards}개</b>
            </p>
            <ActionButton size="small" variant="neutralOutline" onClick={() => { setCertNo(completedBoards); setCertOpen(true); }}>
              <Award className="w-3.5 h-3.5 mr-1" /> 상장 보기
            </ActionButton>
          </div>
        )}

        {/* 상장 다이얼로그 — 판마다 다른 디자인, ◀▶로 지난 상장도.
            제목이 없으면 상장이 손잡이·닫기 버튼 밑에 깔리고 시트 이름도 비어서 제목을 단다 */}
        <Dialog open={certOpen} onOpenChange={setCertOpen} headerAlign="center">
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-center">🍇 포도알 완주상</DialogTitle>
            </DialogHeader>
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
              <div className="flex items-center justify-center gap-x3">
                <ActionButton variant="ghost" layout="iconOnly" disabled={certNo <= 1} onClick={() => setCertNo(n => n - 1)} aria-label="이전 상장">
                  <Icon svg={<ChevronLeft />} />
                </ActionButton>
                <span className="t4-medium tabular-nums text-fg-neutral-muted">{certNo} / {completedBoards}</span>
                <ActionButton variant="ghost" layout="iconOnly" disabled={certNo >= completedBoards} onClick={() => setCertNo(n => n + 1)} aria-label="다음 상장">
                  <Icon svg={<ChevronRight />} />
                </ActionButton>
              </div>
            )}
            {/* 안내는 위 설명 대신 아래 캡션으로 — 위에 두면 작은 폰에서 ◀▶가 화면 밖으로 밀린다 */}
            <p className="t3-regular text-center text-fg-neutral-muted">판을 채울 때마다 다른 디자인의 상장이 나와요 · 캡처해서 자랑해 보세요!</p>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
