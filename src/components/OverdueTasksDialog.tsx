import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays, CheckCheck, Clock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addDays, daysBetween, formatDateLabel, formatShortDate, formatTimeLabel, kstToday } from '@/lib/dates';
import { deleteWithUndo, fetchOverdueTasks, moveTaskDue, updateTaskStatus } from '@/lib/tasks';

const MOVE_OPTIONS = [
  { days: 0, label: '오늘' },
  { days: 1, label: '+1일' },
  { days: 2, label: '+2일' },
  { days: 3, label: '+3일' },
  { days: 7, label: '+일주일' },
];

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
    toast.success('완료 처리했어요 🎉');
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
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-red-500" /> 마감이 지난 할 일
            {tasks.length > 0 && <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">{tasks.length}</Badge>}
          </DialogTitle>
          <DialogDescription className={tasks.length > 0 ? 'text-left' : 'sr-only'}>
            기간을 늘리거나 완료·삭제로 정리하고 가볍게 시작해요.
          </DialogDescription>
        </DialogHeader>

        {empty ? (
          <div className="text-center py-6 space-y-1">
            <p className="text-3xl">✨</p>
            <p className="text-sm font-medium text-gray-700">
              {handled > 0 ? `${handled}개 정리 완료! 깔끔해졌어요` : '밀린 할 일이 없어요. 깔끔하네요'}
            </p>
            <p className="text-xs text-gray-400">오늘도 가볍게 시작해 봐요</p>
          </div>
        ) : (
          <>
            {tasks.length > 1 && (
              <Button variant="outline" size="sm" disabled={busy} onClick={moveAllToday}
                className="w-full border-amber-200 text-amber-700 hover:bg-amber-50">
                <CalendarDays className="w-4 h-4 mr-1" /> {tasks.length}개 모두 오늘 할 일로 옮기기
              </Button>
            )}
            <ul className="space-y-2">
              {tasks.map((task) => {
                const late = daysBetween(task.due_date as string, today);
                const timeLabel = formatTimeLabel(task.due_time);
                return (
                  <li key={task.id} className="rounded-xl border border-red-100 bg-red-50/40 p-3 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 break-keep [overflow-wrap:anywhere]">{task.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-1">
                          <CalendarDays className="w-3 h-3" />
                          <span>{formatDateLabel(task.due_date as string)}{timeLabel ? ` ${timeLabel}` : ''}까지였어요</span>
                          {task.status === 'in_progress' && (
                            <Badge variant="outline" className="ml-0.5 text-[10px] px-1.5 py-0 bg-blue-50 text-blue-600 border-blue-200">진행 중</Badge>
                          )}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs whitespace-nowrap bg-red-100 text-red-600 border-red-200">
                        {late}일 지남
                      </Badge>
                    </div>

                    {/* 기간 늘리기 — 버튼 아래에 옮겨갈 날짜를 같이 보여준다 */}
                    <div className="grid grid-cols-5 gap-1">
                      {MOVE_OPTIONS.map(o => {
                        const target = addDays(today, o.days);
                        return (
                          <button
                            key={o.days}
                            onClick={() => move(task, target)}
                            className="rounded-lg border border-amber-200 bg-white px-0.5 py-1.5 text-center hover:bg-amber-50 active:bg-amber-100"
                            title={`${formatDateLabel(target)}까지로 옮기기`}
                          >
                            <span className="block text-xs font-semibold text-amber-700">{o.label}</span>
                            <span className="block text-[10px] text-gray-400 leading-tight whitespace-nowrap">{formatShortDate(target).replace(' ', '')}</span>
                          </button>
                        );
                      })}
                    </div>

                    {pickerFor === task.id ? (
                      // 날짜를 고른 뒤 '옮기기'로 확정 — 입력 중 중간값으로 바로 옮겨지지 않게
                      <div className="flex gap-1.5">
                        <Input type="date" value={pickedDate} min={today} onChange={(e) => setPickedDate(e.target.value)}
                          className="h-9 flex-1 min-w-0 text-sm" aria-label="새 마감일" autoFocus />
                        <Button size="sm" className="h-9 bg-amber-600 hover:bg-amber-700 text-white" disabled={!pickedDate}
                          onClick={() => pickedDate && move(task, pickedDate)}>
                          옮기기
                        </Button>
                        <Button size="sm" variant="ghost" className="h-9 px-2 text-gray-500" onClick={() => setPickerFor(null)}>
                          취소
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-gray-600"
                          onClick={() => { setPickerFor(task.id); setPickedDate(addDays(today, 1)); }}>
                          <CalendarDays className="w-3.5 h-3.5 mr-1" /> 날짜 고르기
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-green-600" onClick={() => complete(task)}>
                          <CheckCheck className="w-3.5 h-3.5 mr-1" /> 이미 했어요
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-red-500 ml-auto" onClick={() => remove(task)}>
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> 삭제
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <Button variant={empty ? 'default' : 'outline'} onClick={onClose}
          className={empty ? 'w-full bg-amber-600 hover:bg-amber-700 text-white' : 'w-full border-amber-200 text-amber-700'}>
          {empty ? '닫기' : '나중에 하기'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
