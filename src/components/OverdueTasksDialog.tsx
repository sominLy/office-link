import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task } from '@/lib/types';
import { PrefixIcon } from '@seed-design/react';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { CalendarDays, CheckCheck, Clock, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { addDays, daysBetween, formatDateLabel, formatShortDate, formatTimeLabel, kstToday } from '@/lib/dates';
import { deleteWithUndo, fetchOverdueTasks, moveTaskDue, updateTaskStatus } from '@/lib/tasks';

const MOVE_OPTIONS = [
  { days: 0, label: '오늘' },
  { days: 1, label: '+1일' },
  { days: 2, label: '+2일' },
  { days: 3, label: '+3일' },
  { days: 7, label: '+일주일' },
];

/** 개수·상태 알약. 멤버·루틴 시트의 태그와 같은 모양으로 모두 시트 최소 글자(t3)를 쓰고, 굵기와 색은 쓰는 곳에서 붙인다 */
const PILL = 'inline-flex items-center whitespace-nowrap rounded-full border px-x2 py-x0_5';

/**
 * 마감일이 지났는데 아직 완료되지 않은 할 일을 정리하는 다이얼로그.
 * 출근 직후 자동으로, 또는 할 일 탭·홈의 "밀린 할 일" 배너에서 열린다.
 */
export default function OverdueTasksDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: () => void }) {
  const { user } = useAuth();
  const { office } = useOffice();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [handled, setHandled] = useState(0); // 이번에 정리한 개수 (다 비웠을 때 칭찬용)
  const [pickerFor, setPickerFor] = useState<string | null>(null); // 날짜 직접 고르기를 연 할 일 id
  const [pickedDate, setPickedDate] = useState('');
  const [busy, setBusy] = useState(false);
  const today = kstToday();

  const fetchOverdue = useCallback(async () => {
    if (!user || !office) return;
    setTasks(await fetchOverdueTasks(user.id, office.id));
    setLoaded(true);
  }, [user, office]);

  useEffect(() => {
    if (open) {
      setHandled(0);
      setPickerFor(null);
      fetchOverdue();
    } else {
      setLoaded(false);
    }
  }, [open, fetchOverdue]);

  const done = (task: Task) => {
    setTasks(prev => prev.filter(t => t.id !== task.id));
    setHandled(n => n + 1);
    onChanged?.();
  };

  const move = async (task: Task, newDue: string) => {
    if (!(await moveTaskDue(task, newDue))) return;
    done(task);
    setPickerFor(null);
    toast.success(`"${task.title}" → ${formatDateLabel(newDue)}까지`);
  };

  const moveAllToday = async () => {
    if (busy || tasks.length === 0) return;
    setBusy(true);
    const targets = [...tasks];
    const results = await Promise.all(targets.map(t => moveTaskDue(t, today)));
    const moved = targets.filter((_, i) => results[i]);
    setTasks(prev => prev.filter(t => !moved.some(m => m.id === t.id)));
    setHandled(n => n + moved.length);
    onChanged?.();
    setBusy(false);
    if (moved.length > 0) toast.success(`${moved.length}개를 오늘 할 일로 옮겼어요`);
  };

  const complete = async (task: Task) => {
    if (!(await updateTaskStatus(task, 'done'))) return;
    done(task);
    toast.success('완료했어요 🎉');
  };

  const remove = (task: Task) => {
    deleteWithUndo({
      table: 'tasks',
      id: task.id,
      message: `"${task.title}" 삭제했어요`,
      onHide: () => done(task),
      onRestore: () => {
        setTasks(prev => [...prev, task].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')));
        setHandled(n => Math.max(0, n - 1));
        onChanged?.();
      },
    });
  };

  const empty = loaded && tasks.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-x2">
            <Clock className="w-5 h-5 flex-shrink-0 text-fg-critical" /> 마감이 지난 할 일
            {tasks.length > 0 && (
              <span className={`${PILL} t3-bold border-stroke-critical-weak bg-bg-critical-weak text-fg-critical-contrast`}>{tasks.length}</span>
            )}
          </DialogTitle>
          {/* 정리할 게 없으면 화면에서는 숨기고 스크린리더에만 남긴다 */}
          <DialogDescription className={tasks.length > 0 ? undefined : 'sr-only'}>
            기간을 늘리거나 완료·삭제로 정리하고 가볍게 시작해요.
          </DialogDescription>
        </DialogHeader>

        {empty ? (
          <div className="flex flex-col items-center gap-x1 py-x6 text-center">
            <p className="text-t11" aria-hidden="true">✨</p>
            <p className="t5-medium text-fg-neutral">
              {handled > 0 ? `밀린 할 일 ${handled}개를 정리했어요` : '밀린 할 일이 없어요. 깔끔하네요'}
            </p>
            <p className="t4-regular text-fg-neutral-muted">오늘도 가볍게 시작해 봐요</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-x2">
            {tasks.map((task) => {
              const late = daysBetween(task.due_date as string, today);
              const timeLabel = formatTimeLabel(task.due_time);
              return (
                <li key={task.id} className="flex flex-col gap-x3 rounded-r3 border border-stroke-critical-weak bg-bg-critical-weak p-x3">
                  <div className="flex items-start gap-x2">
                    <div className="flex flex-1 min-w-0 flex-col gap-x0_5">
                      <p className="t5-medium text-fg-neutral">{task.title}</p>
                      {/* 아이콘과 날짜 문구는 한 묶음이라 문구는 아이콘 옆에서 줄바꿈되고 진행 중 알약만 아래 줄로 내려간다.
                          예전에는 셋이 한 flex-wrap 줄이라 긴 문구가 통째로 다음 줄로 떨어져 아이콘만 혼자 남았다 */}
                      <div className="flex flex-wrap items-center gap-x1">
                        <p className="flex min-w-0 items-start gap-x1 t4-regular text-fg-neutral-muted">
                          <CalendarDays className="w-4 h-4 mt-0.5 shrink-0" />
                          <span className="min-w-0">{formatDateLabel(task.due_date as string)}{timeLabel ? ` ${timeLabel}` : ''}까지였어요</span>
                        </p>
                        {task.status === 'in_progress' && (
                          <span className={`${PILL} t3-medium border-stroke-informative-weak bg-bg-informative-weak text-fg-informative-contrast`}>진행 중</span>
                        )}
                      </div>
                    </div>
                    <span className={`${PILL} t3-medium border-stroke-critical-weak bg-bg-layer-default text-fg-critical-contrast`}>
                      {late}일 지남
                    </span>
                  </div>

                  {/* 기간 늘리기 — 버튼 아래에 옮겨갈 날짜를 같이 보여준다.
                      다섯 칸을 한 줄에 두려고 칸 사이와 칸 안 여백을 비운다. 그래도 360px보다 좁으면 '+일주일'과
                      '10/20(화)'가 칸(약 51px)을 넘쳐서, 그 폭에서만 요일을 숨기고(전체 날짜는 title에) 라벨을 t3로 줄인다 */}
                  <div className="grid grid-cols-5 gap-x0_5">
                    {MOVE_OPTIONS.map(o => {
                      const target = addDays(today, o.days);
                      const [monthDay, weekday] = formatShortDate(target).split(' ');
                      return (
                        <button
                          key={o.days}
                          onClick={() => move(task, target)}
                          className="flex min-h-x12 flex-col items-center justify-center rounded-r2 border border-stroke-brand-weak bg-bg-layer-default px-0 py-x1_5 text-center transition-colors hover:bg-bg-brand-weak active:bg-bg-brand-weak-pressed"
                          title={`${formatDateLabel(target)}까지로 옮기기`}
                        >
                          <span className="t4-medium text-fg-brand whitespace-nowrap max-[359px]:text-t3">{o.label}</span>
                          <span className="t3-regular text-fg-neutral-muted whitespace-nowrap">
                            {monthDay}<span className="max-[359px]:hidden">{weekday}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {pickerFor === task.id ? (
                    // 날짜를 고른 뒤 '옮기기'로 확정 — 입력 중 중간값으로 바로 옮겨지지 않게
                    <div className="flex flex-col gap-x2">
                      <TextField value={pickedDate} onValueChange={(d) => setPickedDate(d.value)}>
                        <TextFieldInput type="date" min={today} aria-label="새 마감일" autoFocus />
                      </TextField>
                      <div className="grid grid-cols-2 gap-x2">
                        <ActionButton variant="neutralWeak" size="medium" onClick={() => setPickerFor(null)}>
                          취소
                        </ActionButton>
                        <ActionButton variant="neutralSolid" size="medium" disabled={!pickedDate} onClick={() => pickedDate && move(task, pickedDate)}>
                          옮기기
                        </ActionButton>
                      </div>
                    </div>
                  ) : (
                    // 좁은 화면에서 세 버튼이 한 줄에 안 들어가면 삭제만 다음 줄로 내린다
                    <div className="flex flex-wrap items-center gap-x1">
                      <ActionButton variant="ghost" size="medium" color="fg.neutralMuted" fontWeight="medium" className="px-x2"
                        onClick={() => { setPickerFor(task.id); setPickedDate(addDays(today, 1)); }}>
                        <PrefixIcon svg={<CalendarDays />} /> 날짜 고르기
                      </ActionButton>
                      <ActionButton variant="ghost" size="medium" color="fg.positiveContrast" fontWeight="medium" className="px-x2" onClick={() => complete(task)}>
                        <PrefixIcon svg={<CheckCheck />} /> 이미 했어요
                      </ActionButton>
                      <ActionButton variant="ghost" size="medium" color="fg.criticalContrast" fontWeight="medium" className="px-x2 ml-auto" onClick={() => remove(task)}>
                        <PrefixIcon svg={<Trash2 />} /> 삭제
                      </ActionButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* 한꺼번에 옮기기가 이 시트의 주 행동이라 푸터에 둔다 — 목록이 길어 스크롤돼도 늘 보인다.
            버튼 문구가 길어 두 칸으로 나누면 넘치므로 위아래로 쌓는다 */}
        <DialogFooter>
          <div className="flex flex-col gap-x2">
            {tasks.length > 1 && (
              <ActionButton variant="brandSolid" size="large" disabled={busy} onClick={moveAllToday} className="w-full">
                {tasks.length}개 모두 오늘 할 일로 옮기기
              </ActionButton>
            )}
            <ActionButton
              variant={empty ? 'brandSolid' : 'neutralWeak'}
              size="large"
              onClick={onClose}
              className="w-full"
            >
              {empty ? '닫기' : '나중에 하기'}
            </ActionButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
