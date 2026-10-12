import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ActionButton } from '@/seed/ui/action-button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, CircleDot, ArrowRight, Clock, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/lib/toast';
import { kstNowHM, kstToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  DueTone, PRIORITY_META, addedMessage, createTask, dueInfo, fetchOverdueTasks, fetchWeekTasks, sortTasks, syncRoutineTasks,
  updateTaskStatus, useTasksChanged,
} from '@/lib/tasks';
import QuickAddTask from '@/components/tasks/QuickAddTask';
import OverdueTasksDialog from '@/components/OverdueTasksDialog';

const dueTextColor: Record<DueTone, string> = {
  overdue: 'text-fg-critical-contrast font-medium',
  today: 'text-fg-warning-contrast font-medium',
  tomorrow: 'text-fg-brand',
  later: 'text-fg-neutral-muted',
};

const COMPACT_LIMIT = 4;

/** 홈의 "이번 주 할 일" 카드 — 급한 것부터 몇 개만, 바로 체크하고 바로 추가 */
export default function MyTasks({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { office } = useOffice();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const navigate = useNavigate();
  const today = kstToday();
  const nowHM = kstNowHM();

  const fetchTasks = useCallback(async () => {
    if (!user || !office) return;
    const [week, overdue] = await Promise.all([
      fetchWeekTasks(user.id, office.id),
      fetchOverdueTasks(user.id, office.id),
    ]);
    setTasks(week);
    setOverdueCount(overdue.length);
    setLoaded(true);
  }, [user, office]);

  useEffect(() => {
    if (!user || !office) return;
    fetchTasks();
    // 할 일 탭을 안 열어본 주에도 루틴 할 일이 빠지지 않게
    syncRoutineTasks(user.id, office.id).then(({ created }) => {
      if (created > 0) fetchTasks();
    });
  }, [user, office, fetchTasks]);

  useTasksChanged(fetchTasks);

  const toggleComplete = async (task: Task) => {
    const status = task.status === 'done' ? 'todo' : 'done';
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status, completed_at: status === 'done' ? new Date().toISOString() : null } : t)));
    if (!(await updateTaskStatus(task, status))) {
      fetchTasks();
      return;
    }
    if (status === 'done' && tasks.filter(t => t.id !== task.id && t.status !== 'done').length === 0) {
      toast.success('이번 주 할 일을 모두 끝냈어요! 🎉');
    }
  };

  const quickAdd = async (title: string, due: string | null) => {
    if (!user || !office) return false;
    const created = await createTask(user.id, office.id, { title, due_date: due, sort_order: tasks.length });
    if (!created) return false;
    toast.success(addedMessage(due));
    return true;
  };

  const sorted = sortTasks(tasks);
  const openTasks = sorted.filter(t => t.status !== 'done');
  const displayTasks = compact ? openTasks.slice(0, COMPACT_LIMIT) : sorted;
  const hiddenCount = compact ? openTasks.length - displayTasks.length : 0;
  const doneCount = tasks.length - openTasks.length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <Card className="p-5 border-stroke-neutral-subtle shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-fg-neutral text-t4">이번 주 할 일</h3>
          <Badge variant="secondary" className="text-t2 bg-bg-brand-weak text-fg-brand">
            {doneCount}/{tasks.length}
          </Badge>
        </div>
        {compact && (
          <ActionButton variant="ghost" size="small" onClick={() => navigate('/tasks')} className="text-fg-brand text-t2 -mr-2">
            전체 보기 <ArrowRight className="w-3 h-3 ml-1" />
          </ActionButton>
        )}
      </div>

      {tasks.length > 0 && (
        <Progress value={progress} className="h-1.5 mb-3 bg-bg-brand-weak [&>div]:bg-bg-brand-solid" aria-label="이번 주 진행률" />
      )}

      {overdueCount > 0 && (
        <button
          onClick={() => setOverdueOpen(true)}
          className="w-full mb-3 flex items-center gap-2 rounded-lg border border-stroke-critical-weak bg-red-50/70 px-3 py-2 text-left hover:bg-bg-critical-weak"
        >
          <Clock className="w-3.5 h-3.5 text-fg-critical flex-shrink-0" />
          <span className="flex-1 text-t2 text-fg-critical-contrast">마감 지난 할 일 <b>{overdueCount}개</b></span>
          <span className="text-t2 font-semibold text-fg-critical flex items-center">정리하기 <ChevronRight className="w-3 h-3" /></span>
        </button>
      )}

      {!loaded ? (
        <div className="space-y-2.5 py-1">
          {[0, 1, 2].map(i => <div key={i} className="h-5 rounded bg-bg-brand-weak animate-pulse" />)}
        </div>
      ) : displayTasks.length === 0 ? (
        <p className="text-t4 text-fg-neutral-muted text-center py-3">
          {tasks.length === 0 ? '이번 주 할 일을 아래에 적어보세요' : '이번 주 할 일을 모두 끝냈어요 🎉'}
        </p>
      ) : (
        <ul className="space-y-1">
          {displayTasks.map((task) => {
            const due = task.status === 'done' ? null : dueInfo(task, today, nowHM);
            return (
              <li key={task.id} className="flex items-center gap-2 py-1">
                <button
                  onClick={() => toggleComplete(task)}
                  className="flex-shrink-0 rounded-full"
                  aria-label={task.status === 'done' ? '완료 취소' : '완료로 표시'}
                >
                  {task.status === 'done' ? (
                    <CheckCircle2 className="w-5 h-5 text-fg-positive check-pop" />
                  ) : task.status === 'in_progress' ? (
                    <CircleDot className="w-5 h-5 text-fg-informative" />
                  ) : (
                    <Circle className={`w-5 h-5 ${PRIORITY_META[task.priority].fg} hover:text-fg-brand`} />
                  )}
                </button>
                <span className={cn('text-t4 flex-1 min-w-0 truncate', task.status === 'done' ? 'line-through text-fg-neutral-muted' : 'text-fg-neutral-muted')}>
                  {task.title}
                </span>
                {task.status === 'in_progress' && !due && (
                  <span className="text-t2 text-fg-informative-contrast flex-shrink-0">진행 중</span>
                )}
                {due && (
                  <span className={cn('text-t2 flex-shrink-0 whitespace-nowrap', dueTextColor[due.tone])}>{due.label}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button onClick={() => navigate('/tasks')} className="mt-1 text-t2 text-fg-neutral-muted hover:text-fg-brand">
          + {hiddenCount}개 더 있어요
        </button>
      )}

      <QuickAddTask onAdd={quickAdd} placeholder="할 일 빠르게 추가" className="mt-3 shadow-none" />

      <OverdueTasksDialog open={overdueOpen} onClose={() => setOverdueOpen(false)} onChanged={fetchTasks} />
    </Card>
  );
}
