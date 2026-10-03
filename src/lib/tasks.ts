// 할 일 공용 로직 — 화면(할 일 탭·홈·마이페이지·퇴근)마다 같은 규칙으로 보이고 동작하도록 모아둔다.
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Routine, Task } from '@/lib/types';
import { requestTrophyCheck } from '@/lib/awards';
import {
  addDays, daysBetween, formatShortDate, formatTimeLabel, getWeekEnd, getWeekStart, kstNowHM, kstToday, weekStartOf,
} from '@/lib/dates';

export type TaskStatus = Task['status'];
export type TaskPriority = Task['priority'];

export const STATUS_META: Record<TaskStatus, { label: string; chip: string; dot: string }> = {
  todo: { label: '시작 전', chip: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-300' },
  in_progress: { label: '진행 중', chip: 'bg-blue-50 text-blue-600 border-blue-200', dot: 'bg-blue-500' },
  done: { label: '완료', chip: 'bg-green-50 text-green-600 border-green-200', dot: 'bg-green-500' },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; chip: string; picked: string }> = {
  high: { label: '높음', chip: 'bg-red-50 text-red-600 border-red-200', picked: 'bg-red-500 text-white border-red-500' },
  normal: { label: '보통', chip: 'bg-amber-50 text-amber-600 border-amber-200', picked: 'bg-amber-500 text-white border-amber-500' },
  low: { label: '낮음', chip: 'bg-gray-50 text-gray-500 border-gray-200', picked: 'bg-gray-500 text-white border-gray-500' },
};

// ───────── 마감 표시 ─────────

export type DueTone = 'overdue' | 'today' | 'tomorrow' | 'later';

const DUE_CLS: Record<DueTone, string> = {
  overdue: 'bg-red-100 text-red-600 border-red-200',
  today: 'bg-orange-100 text-orange-600 border-orange-200',
  tomorrow: 'bg-amber-50 text-amber-700 border-amber-200',
  later: 'bg-blue-50 text-blue-600 border-blue-200',
};

/** 마감 라벨: "2일 지남" · "오늘 오후 6:00까지" · "내일까지" · "D-3" (마감 없으면 null) */
export function dueInfo(
  task: Pick<Task, 'due_date' | 'due_time'>,
  today: string = kstToday(),
  nowHM: string = kstNowHM(),
): { label: string; tone: DueTone; cls: string } | null {
  if (!task.due_date) return null;
  const diff = daysBetween(today, task.due_date);
  const time = formatTimeLabel(task.due_time);
  const t = time ? ` ${time}` : '';
  let label: string;
  let tone: DueTone;
  if (diff < 0) {
    label = `${-diff}일 지남`;
    tone = 'overdue';
  } else if (diff === 0) {
    // 오늘 마감인데 정한 시간이 이미 지났으면 빨간색으로
    const passed = !!task.due_time && task.due_time.slice(0, 5) <= nowHM;
    label = passed ? `오늘${t} 지남` : `오늘${t}까지`;
    tone = passed ? 'overdue' : 'today';
  } else if (diff === 1) {
    label = `내일${t}까지`;
    tone = 'tomorrow';
  } else {
    label = `D-${diff}${t}`;
    tone = 'later';
  }
  return { label, tone, cls: DUE_CLS[tone] };
}

/** 마감일이 오늘보다 앞인데 아직 안 끝난 할 일 (날짜 기준) */
export function isOverdue(task: Task, today: string = kstToday()): boolean {
  return task.status !== 'done' && !!task.due_date && task.due_date < today;
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

/**
 * 급한 순 정렬: 안 끝난 것 먼저 → 마감 빠른 순(마감 없는 건 뒤) → 마감 시간 → 진행 중 먼저 → 우선순위 → 등록 순
 */
export function compareTasks(a: Task, b: Task): number {
  if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
  const ad = a.due_date || '9999-12-31';
  const bd = b.due_date || '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.due_time || '99';
  const bt = b.due_time || '99';
  if (at !== bt) return at < bt ? -1 : 1;
  if (a.status !== b.status) return a.status === 'in_progress' ? -1 : b.status === 'in_progress' ? 1 : 0;
  if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.created_at < b.created_at ? -1 : 1;
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(compareTasks);
}

// ───────── 빠른 날짜 선택 ─────────

export type QuickDue = { key: string; label: string; date: string | null };

/** 오늘·내일·모레·다음 주 월요일·날짜 없음 (주말엔 내일/모레가 곧 월요일이라 겹치면 뺀다) */
export function quickDueOptions(today: string = kstToday()): QuickDue[] {
  const days: QuickDue[] = [
    { key: 'today', label: '오늘', date: today },
    { key: 'tomorrow', label: '내일', date: addDays(today, 1) },
    { key: 'after', label: '모레', date: addDays(today, 2) },
  ];
  const nextMon = addDays(weekStartOf(today), 7);
  if (!days.some(d => d.date === nextMon)) days.push({ key: 'next-mon', label: '다음 주 월', date: nextMon });
  return [...days, { key: 'none', label: '날짜 없음', date: null }];
}

/** 빠른 날짜 칩/버튼에 쓰는 짧은 이름 ("오늘", "내일", "9/12 (금)", "이번 주 안에") */
export function shortDueLabel(date: string | null, today: string = kstToday()): string {
  if (!date) return '이번 주 안에';
  const diff = daysBetween(today, date);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === 2) return '모레';
  return formatShortDate(date);
}

// ───────── 다른 화면에 "할 일 바뀜" 알리기 ─────────
// 홈의 할 일 카드·집중 타이머처럼 같은 화면에 있는 다른 컴포넌트가 바로 다시 불러오도록

const CHANGED_EVENT = 'office-link:tasks-changed';

export function notifyTasksChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function useTasksChanged(callback: () => void) {
  const ref = useRef(callback);
  useEffect(() => { ref.current = callback; }, [callback]);
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(CHANGED_EVENT, handler);
    return () => window.removeEventListener(CHANGED_EVENT, handler);
  }, []);
}

// ───────── 조회 ─────────

// 되돌리기 대기 중(아직 DB에서 안 지운) 항목 — 그 사이 다시 불러와도 목록에 안 보이게
const pendingDeletes = new Set<string>();
export const withoutPending = <T extends { id: string }>(rows: T[]): T[] =>
  rows.filter(r => !pendingDeletes.has(r.id));

/** 이번 주 할 일 = ① 이번 주에 담아둔 것 + ② 마감일이 이번 주인 것 */
export async function fetchWeekTasks(userId: string, officeId: string | null): Promise<Task[]> {
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();
  let q = supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .or(`week_start.eq.${weekStart},and(due_date.gte.${weekStart},due_date.lte.${weekEnd})`)
    .order('sort_order');
  if (officeId) q = q.eq('office_id', officeId);
  const { data } = await q;
  return withoutPending(data || []);
}

/** 마감일이 지났는데 아직 안 끝난 할 일 */
export async function fetchOverdueTasks(userId: string, officeId: string): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('office_id', officeId)
    .neq('status', 'done')
    .not('due_date', 'is', null)
    .lt('due_date', kstToday())
    .order('due_date')
    .order('due_time', { nullsFirst: false });
  return withoutPending(data || []);
}

/**
 * 루틴 → 이번 주 할 일 자동 생성. 할 일 탭뿐 아니라 홈에서도 불러서
 * 할 일 탭을 안 열어본 주에도 루틴이 빠지지 않게 한다.
 */
export async function syncRoutineTasks(userId: string, officeId: string): Promise<{ routines: Routine[]; created: number }> {
  const { data: routineList } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', userId)
    .eq('office_id', officeId)
    .order('created_at');
  const routines = withoutPending(routineList || []);
  if (routines.length === 0) return { routines, created: 0 };

  const weekStart = getWeekStart();
  const { data: existing } = await supabase
    .from('tasks')
    .select('routine_id')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .not('routine_id', 'is', null);
  const existingIds = new Set((existing || []).map(t => t.routine_id));
  const missing = routines.filter(r => !existingIds.has(r.id));
  if (missing.length === 0) return { routines, created: 0 };
  // unique index(one_task_per_routine_week)가 중복 생성을 막아준다
  const { error } = await supabase.from('tasks').insert(missing.map(r => ({
    office_id: officeId,
    user_id: userId,
    title: r.title,
    category: r.category,
    priority: r.priority,
    status: 'todo',
    week_start: weekStart,
    sort_order: 999,
    routine_id: r.id,
  })));
  return { routines, created: error ? 0 : missing.length };
}

// ───────── 변경 ─────────

export async function updateTaskStatus(task: Pick<Task, 'id'>, status: TaskStatus): Promise<boolean> {
  const { error } = await supabase
    .from('tasks')
    .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', task.id);
  if (error) {
    toast.error('상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요');
    return false;
  }
  notifyTasksChanged();
  if (status === 'done') requestTrophyCheck(); // 할 일 10개·50개… 트로피
  return true;
}

/** 마감일 옮기기 — 그 날짜가 속한 주의 할 일로 같이 옮겨서 주간 목록에서 사라지지 않게 */
export async function moveTaskDue(task: Pick<Task, 'id'>, due: string): Promise<boolean> {
  const { error } = await supabase
    .from('tasks')
    .update({ due_date: due, week_start: weekStartOf(due) })
    .eq('id', task.id);
  if (error) {
    toast.error('마감일을 옮기지 못했어요');
    return false;
  }
  notifyTasksChanged();
  return true;
}

/** "미루기" 목적지: 마감이 오늘 이후면 그 다음 날, 지났거나 없으면 내일 */
export function postponeTarget(task: Pick<Task, 'due_date'>, today: string = kstToday()): string {
  return task.due_date && task.due_date >= today ? addDays(task.due_date, 1) : addDays(today, 1);
}

export function postponeLabel(task: Pick<Task, 'due_date'>, today: string = kstToday()): string {
  return task.due_date && task.due_date >= today ? '하루 미루기' : '내일로 미루기';
}

/** 새 할 일 저장 — 저장된 행을 돌려줘서 화면에 바로 붙일 수 있게 */
export async function createTask(
  userId: string,
  officeId: string,
  fields: Partial<Pick<Task, 'category' | 'due_date' | 'due_time' | 'is_private' | 'priority' | 'sort_order'>> & { title: string },
): Promise<Task | null> {
  const due = fields.due_date ?? null;
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      office_id: officeId,
      user_id: userId,
      status: 'todo',
      priority: 'normal',
      is_private: false,
      sort_order: 999,
      ...fields,
      due_date: due,
      due_time: due ? fields.due_time ?? null : null,
      week_start: weekForDue(due),
    })
    .select()
    .single();
  if (error || !data) {
    toast.error('할 일을 추가하지 못했어요. 잠시 후 다시 시도해 주세요');
    return null;
  }
  notifyTasksChanged();
  return data as Task;
}

/** 추가 직후 안내 — 이번 주 밖의 날짜면 목록에서 안 보이는 이유를 알려준다 */
export function addedMessage(due: string | null): string {
  if (due && (due < getWeekStart() || due > getWeekEnd())) {
    return `${formatShortDate(due)} 할 일로 담았어요 · 캘린더에서 볼 수 있어요`;
  }
  return '할 일을 추가했어요';
}

/** 마감일 기준 주 (마감 없으면 이번 주) */
export function weekForDue(due: string | null): string {
  return due ? weekStartOf(due) : getWeekStart();
}

const UNDO_MS = 5000;

/**
 * 되돌리기 가능한 삭제: 화면에서 먼저 숨기고 5초 뒤 실제로 지운다.
 * 바로 지우지 않으니 되돌려도 응원(리액션) 같은 연결 데이터가 그대로 남는다.
 */
export function deleteWithUndo({
  table, id, message, onHide, onRestore,
}: {
  table: 'tasks' | 'routines';
  id: string;
  message: string;
  onHide: () => void;
  onRestore: () => void;
}) {
  onHide();
  pendingDeletes.add(id);
  let undone = false;
  const timer = window.setTimeout(async () => {
    if (undone) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    pendingDeletes.delete(id);
    if (error) {
      toast.error('삭제하지 못했어요. 다시 시도해 주세요');
      onRestore();
      return;
    }
    if (table === 'tasks') notifyTasksChanged();
  }, UNDO_MS);
  toast(message, {
    duration: UNDO_MS,
    action: {
      label: '되돌리기',
      onClick: () => {
        undone = true;
        window.clearTimeout(timer);
        pendingDeletes.delete(id);
        onRestore();
      },
    },
  });
}
