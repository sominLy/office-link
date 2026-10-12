import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { ActionButton } from '@/seed/ui/action-button';
import { Circle, CalendarClock } from 'lucide-react';
import { toast } from '@/lib/toast';
import { addDays, kstNowHM, kstToday } from '@/lib/dates';
import { dueInfo, moveTaskDue, sortTasks, updateTaskStatus, withoutPending } from '@/lib/tasks';

/**
 * 퇴근 전 정리: 오늘(또는 그 전)까지였는데 아직 안 끝난 할 일.
 * 끝낸 건 체크하고, 못 끝낸 건 내일로 넘겨서 내일 아침을 가볍게.
 */
export default function LeftoverTasks() {
  const { user } = useAuth();
  const { office } = useOffice();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const today = kstToday();
  const tomorrow = addDays(today, 1);
  const nowHM = kstNowHM();

  const fetchLeftovers = useCallback(async () => {
    if (!user || !office) return;
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .neq('status', 'done')
      .not('due_date', 'is', null)
      .lte('due_date', kstToday());
    setTasks(sortTasks(withoutPending(data || [])));
  }, [user, office]);

  useEffect(() => {
    fetchLeftovers();
  }, [fetchLeftovers]);

  if (tasks.length === 0) return null;

  const complete = async (task: Task) => {
    setTasks(prev => prev.filter(t => t.id !== task.id));
    if (await updateTaskStatus(task, 'done')) toast.success('완료! 수고했어요 🎉');
    else fetchLeftovers();
  };

  const toTomorrow = async (task: Task) => {
    setTasks(prev => prev.filter(t => t.id !== task.id));
    if (await moveTaskDue(task, tomorrow)) toast.success(`"${task.title}" 내일로 넘겼어요`);
    else fetchLeftovers();
  };

  const allToTomorrow = async () => {
    if (busy) return;
    setBusy(true);
    const targets = [...tasks];
    const results = await Promise.all(targets.map(t => moveTaskDue(t, tomorrow)));
    const moved = results.filter(Boolean).length;
    setBusy(false);
    fetchLeftovers();
    if (moved > 0) toast.success(`${moved}개를 내일 할 일로 넘겼어요. 내일의 내가 해낼 거예요 💪`);
  };

  return (
    <Card className="p-5 border-stroke-neutral-subtle">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h2 className="font-semibold text-fg-neutral">🌙 아직 남은 오늘 할 일 <span className="text-fg-brand">{tasks.length}</span></h2>
      </div>
      <p className="text-t2 text-fg-neutral-muted mb-3">끝낸 건 체크하고, 못 한 건 내일로 넘겨두면 내일 아침이 가벼워요.</p>
      <ul className="space-y-1.5">
        {tasks.map(task => {
          const due = dueInfo(task, today, nowHM);
          return (
            <li key={task.id} className="flex items-center gap-2 rounded-lg bg-gray-50/70 pl-2 pr-1 py-1.5">
              <button onClick={() => complete(task)} className="flex-shrink-0 rounded-full" aria-label="완료로 표시" title="완료로 표시">
                <Circle className="w-5 h-5 text-fg-neutral-subtle hover:text-fg-positive" />
              </button>
              <span className="flex-1 min-w-0">
                <span className="block text-t4 text-fg-neutral-muted truncate">{task.title}</span>
                {due && <span className={`block text-t1 ${due.tone === 'overdue' ? 'text-fg-critical-contrast' : 'text-orange-500'}`}>{due.label}</span>}
              </span>
              <ActionButton variant="ghost" size="small" className="h-7 px-2 text-t2 flex-shrink-0" onClick={() => toTomorrow(task)}>
                <CalendarClock className="w-3.5 h-3.5 mr-1" /> 내일로
              </ActionButton>
            </li>
          );
        })}
      </ul>
      {tasks.length > 1 && (
        <ActionButton variant="neutralOutline" size="small" disabled={busy} onClick={allToTomorrow} className="w-full mt-3">
          남은 {tasks.length}개 모두 내일로 넘기기
        </ActionButton>
      )}
    </Card>
  );
}
