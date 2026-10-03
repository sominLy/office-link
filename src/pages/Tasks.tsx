import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task, Routine } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, ArrowLeft, Trash2, FolderOpen, Repeat, ChevronRight, Clock, CalendarDays, Columns3, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { dateFromStr, formatDateLabel, getWeekEnd, getWeekStart, kstNowHM, kstToday, strFromDate, weekStartOf } from '@/lib/dates';
import { cn, isSubmitEnter } from '@/lib/utils';
import {
  STATUS_META, TaskStatus, addedMessage, createTask, deleteWithUndo, fetchOverdueTasks, fetchWeekTasks, moveTaskDue,
  notifyTasksChanged, postponeTarget, shortDueLabel, sortTasks, syncRoutineTasks, updateTaskStatus, useTasksChanged,
  weekForDue, withoutPending,
} from '@/lib/tasks';
import { Calendar } from '@/components/ui/calendar';
import { ko } from 'date-fns/locale';
import BottomNav from '@/components/BottomNav';
import TaskItem from '@/components/tasks/TaskItem';
import TaskFormDialog, { TaskDraft, emptyDraft } from '@/components/tasks/TaskFormDialog';
import QuickAddTask from '@/components/tasks/QuickAddTask';
import OverdueTasksDialog from '@/components/OverdueTasksDialog';

// 마지막으로 보던 보기·완료 접기 상태는 이 기기에만 기억 (없어도 기본값으로 잘 동작)
const VIEW_KEY = 'tasks_view';
const SHOW_DONE_KEY = 'tasks_show_done';
const readPref = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const writePref = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* 저장 못 해도 동작엔 지장 없음 */ }
};

const monthDay = (d: string) => {
  const [, m, day] = d.split('-').map(Number);
  return `${m}월 ${day}일`;
};

type FormState = { open: boolean; mode: 'create' | 'edit'; task: Task | null; initial: TaskDraft };

export default function Tasks() {
  const { user } = useAuth();
  const { office } = useOffice();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthTasks, setMonthTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [view, setView] = useState(() => readPref(VIEW_KEY, 'list'));
  const [showDone, setShowDone] = useState(() => readPref(SHOW_DONE_KEY, '0') === '1');
  const [form, setForm] = useState<FormState>({ open: false, mode: 'create', task: null, initial: emptyDraft() });
  const [routineDialogOpen, setRoutineDialogOpen] = useState(false);
  const [routineTitle, setRoutineTitle] = useState('');
  const [routineCategory, setRoutineCategory] = useState('');
  const [routineSaving, setRoutineSaving] = useState(false);

  const today = kstToday();
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();
  // 1분마다 갱신 — "오늘 오후 6:00 지남" 같은 표시가 제때 바뀌게
  const [nowHM, setNowHM] = useState(kstNowHM());
  useEffect(() => {
    const t = setInterval(() => setNowHM(kstNowHM()), 60000);
    return () => clearInterval(t);
  }, []);

  // 캘린더 뷰: 선택한 날짜와 그 달의 할 일들 (기본 = 한국시간 오늘)
  const [calDay, setCalDay] = useState<Date>(() => dateFromStr(kstToday()));
  const [calMonth, setCalMonth] = useState<Date>(() => dateFromStr(kstToday()));

  const changeView = (v: string) => {
    setView(v);
    writePref(VIEW_KEY, v);
  };
  const toggleShowDone = () => {
    setShowDone(v => {
      writePref(SHOW_DONE_KEY, v ? '0' : '1');
      return !v;
    });
  };

  // ───────── 불러오기 ─────────

  const fetchTasks = useCallback(async () => {
    if (!user || !office) return;
    setTasks(await fetchWeekTasks(user.id, office.id));
    setLoading(false);
  }, [user, office]);

  const fetchMonthTasks = useCallback(async () => {
    if (!user || !office) return;
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const last = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0);
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .gte('due_date', strFromDate(first))
      .lte('due_date', strFromDate(last))
      .order('sort_order');
    setMonthTasks(withoutPending(data || []));
  }, [user, office, calMonth]);

  const fetchOverdueCount = useCallback(async () => {
    if (!user || !office) return;
    setOverdueCount((await fetchOverdueTasks(user.id, office.id)).length);
  }, [user, office]);

  const refreshAll = useCallback(() => {
    fetchTasks();
    fetchMonthTasks();
    fetchOverdueCount();
  }, [fetchTasks, fetchMonthTasks, fetchOverdueCount]);

  useEffect(() => {
    if (!user || !office) return;
    fetchTasks();
    fetchOverdueCount();
    // 이번 주 루틴 할 일이 아직 없으면 자동 생성
    syncRoutineTasks(user.id, office.id).then(({ routines, created }) => {
      setRoutines(routines);
      if (created > 0) fetchTasks();
    });
  }, [user, office, fetchTasks, fetchOverdueCount]);

  useEffect(() => {
    fetchMonthTasks();
  }, [fetchMonthTasks]);

  // 다른 곳(밀린 할 일 정리 등)에서 바뀌면 다시 불러오기
  useTasksChanged(refreshAll);

  // ───────── 파생 데이터 ─────────

  const sorted = useMemo(() => sortTasks(tasks), [tasks]);
  const openTasks = sorted.filter(t => t.status !== 'done');
  const doneTasks = sorted
    .filter(t => t.status === 'done')
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const dueTodayCount = openTasks.filter(t => t.due_date === today).length;
  const progress = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0;

  // 리스트 묶음: 급한 할 일이 든 카테고리부터, 카테고리 없는 건 맨 아래 '기타'
  const groupCategories = useMemo(() => {
    const seen: string[] = [];
    for (const t of sortTasks(tasks)) if (t.category && !seen.includes(t.category)) seen.push(t.category);
    return seen;
  }, [tasks]);

  // 입력할 때 추천할 카테고리 (이번 주 + 이번 달 + 루틴에서 쓴 것)
  const suggestCategories = useMemo(
    () => [...new Set([...tasks, ...monthTasks, ...routines].map(t => t.category).filter(Boolean))] as string[],
    [tasks, monthTasks, routines],
  );

  // ───────── 변경 ─────────

  const patchLocal = (id: string, patch: Partial<Task>) => {
    const apply = (list: Task[]) => list.map(t => (t.id === id ? { ...t, ...patch } : t));
    setTasks(apply);
    setMonthTasks(apply);
  };

  const changeStatus = async (task: Task, status: TaskStatus) => {
    if (task.status === status) return;
    // 먼저 화면에 반영하고(바로 체크되는 느낌), 실패하면 다시 불러와 되돌린다
    patchLocal(task.id, { status, completed_at: status === 'done' ? new Date().toISOString() : null });
    const ok = await updateTaskStatus(task, status);
    if (!ok) {
      refreshAll();
      return;
    }
    if (status === 'done' && tasks.some(t => t.id === task.id)) {
      const remaining = tasks.filter(t => t.id !== task.id && t.status !== 'done').length;
      if (remaining === 0) toast.success('이번 주 할 일을 모두 끝냈어요! 🎉 정말 수고했어요');
    }
  };

  const toggle = (task: Task) => changeStatus(task, task.status === 'done' ? 'todo' : 'done');

  const postpone = async (task: Task) => {
    const target = postponeTarget(task, today);
    patchLocal(task.id, { due_date: target, week_start: weekStartOf(target) });
    if (await moveTaskDue(task, target)) {
      toast.success(`"${task.title}" ${shortDueLabel(target, today)}까지로 미뤘어요`);
    } else {
      refreshAll();
    }
  };

  const remove = (task: Task) => {
    const inMonth = monthTasks.some(t => t.id === task.id);
    deleteWithUndo({
      table: 'tasks',
      id: task.id,
      message: `"${task.title}" 삭제했어요`,
      onHide: () => {
        setTasks(prev => prev.filter(t => t.id !== task.id));
        setMonthTasks(prev => prev.filter(t => t.id !== task.id));
      },
      onRestore: () => {
        setTasks(prev => (prev.some(t => t.id === task.id) ? prev : [...prev, task]));
        if (inMonth) setMonthTasks(prev => (prev.some(t => t.id === task.id) ? prev : [...prev, task]));
      },
    });
  };

  const openCreate = (overrides: Partial<TaskDraft> = {}) =>
    setForm({ open: true, mode: 'create', task: null, initial: emptyDraft(overrides) });

  const openEdit = (task: Task) =>
    setForm({
      open: true,
      mode: 'edit',
      task,
      initial: {
        title: task.title,
        category: task.category || '',
        due_date: task.due_date || '',
        due_time: (task.due_time || '').slice(0, 5),
        is_private: task.is_private,
        priority: task.priority,
      },
    });

  const closeForm = () => setForm(f => ({ ...f, open: false }));

  const addToState = (task: Task) => {
    if (task.week_start === weekStart || (task.due_date && task.due_date >= weekStart && task.due_date <= weekEnd)) {
      setTasks(prev => [...prev, task]);
    }
  };

  const submitForm = async (d: TaskDraft): Promise<boolean> => {
    if (!user || !office) return false;
    const fields = {
      title: d.title,
      category: d.category || null,
      due_date: d.due_date || null,
      due_time: d.due_date && d.due_time ? d.due_time : null,
      is_private: d.is_private,
      priority: d.priority,
    };
    if (form.mode === 'create') {
      const created = await createTask(user.id, office.id, { ...fields, sort_order: tasks.length });
      if (!created) return false;
      addToState(created);
      toast.success(addedMessage(fields.due_date));
      return true;
    }
    if (!form.task) return false;
    const { error } = await supabase
      .from('tasks')
      .update({ ...fields, week_start: weekForDue(fields.due_date) })
      .eq('id', form.task.id);
    if (error) {
      toast.error('수정하지 못했어요. 잠시 후 다시 시도해 주세요');
      return false;
    }
    patchLocal(form.task.id, fields);
    notifyTasksChanged();
    toast.success('수정했어요');
    return true;
  };

  const quickAdd = async (title: string, due: string | null) => {
    if (!user || !office) return false;
    const created = await createTask(user.id, office.id, { title, due_date: due, sort_order: tasks.length });
    if (!created) return false;
    addToState(created);
    toast.success(addedMessage(due));
    return true;
  };

  // ───────── 루틴 ─────────

  const addRoutine = async () => {
    if (!user || !office || !routineTitle.trim() || routineSaving) return;
    setRoutineSaving(true);
    const { error } = await supabase.from('routines').insert({
      office_id: office.id,
      user_id: user.id,
      title: routineTitle.trim(),
      category: routineCategory.trim() || null,
      priority: 'normal',
    });
    setRoutineSaving(false);
    if (error) {
      toast.error('루틴을 추가하지 못했어요');
      return;
    }
    setRoutineTitle('');
    setRoutineCategory('');
    toast.success('이번 주부터 매주 자동으로 담겨요 🔁');
    const { routines: list, created } = await syncRoutineTasks(user.id, office.id);
    setRoutines(list);
    if (created > 0) fetchTasks();
  };

  const deleteRoutine = (routine: Routine) => {
    deleteWithUndo({
      table: 'routines',
      id: routine.id,
      message: `루틴 "${routine.title}" 삭제했어요 · 이미 담긴 할 일은 그대로예요`,
      onHide: () => setRoutines(prev => prev.filter(r => r.id !== routine.id)),
      onRestore: () => setRoutines(prev => (prev.some(r => r.id === routine.id) ? prev : [...prev, routine])),
    });
  };

  // ───────── 캘린더 ─────────

  const calDayStr = strFromDate(calDay);
  const dayTasks = sortTasks(monthTasks.filter(t => t.due_date === calDayStr));
  const openDates = [...new Set(monthTasks.filter(t => t.status !== 'done' && t.due_date).map(t => t.due_date as string))];
  const doneOnlyDates = [...new Set(monthTasks.filter(t => t.due_date).map(t => t.due_date as string))].filter(d => !openDates.includes(d));

  const itemProps = { today, nowHM, onToggle: toggle, onStatus: changeStatus, onEdit: openEdit, onPostpone: postpone, onDelete: remove };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      <header className="glass sticky top-0 z-10 border-b border-amber-100/70">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="홈으로">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-800 leading-tight">이번 주 할 일</h1>
              <p className="text-[11px] text-gray-400 leading-tight">{monthDay(weekStart)} ~ {monthDay(weekEnd)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button size="sm" variant="outline" className="border-amber-200 text-amber-700" onClick={() => setRoutineDialogOpen(true)}>
              <Repeat className="w-4 h-4 mr-1" /> 루틴{routines.length > 0 && <span className="ml-0.5 text-amber-500">{routines.length}</span>}
            </Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => openCreate()}>
              <Plus className="w-4 h-4 mr-1" /> 추가
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 pb-28 space-y-4">
        {/* 이번 주 진행률 */}
        {tasks.length > 0 && (
          <Card className="p-4 border-amber-100/60 shadow-sm rise-in">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-gray-800">
                {openTasks.length === 0 ? '이번 주 할 일 끝! 🎉' : `남은 할 일 ${openTasks.length}개`}
              </p>
              <p className="text-xs text-gray-500 flex-shrink-0">
                <b className="text-amber-700 text-sm">{doneTasks.length}</b> / {tasks.length} 완료 · {progress}%
              </p>
            </div>
            <Progress value={progress} className="h-2 mt-2 bg-amber-100 [&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-orange-500" aria-label="이번 주 진행률" />
            {(dueTodayCount > 0 || inProgressCount > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {dueTodayCount > 0 && (
                  <span className="text-xs rounded-full px-2 py-0.5 bg-orange-50 text-orange-600 border border-orange-200">오늘 마감 {dueTodayCount}</span>
                )}
                {inProgressCount > 0 && (
                  <span className="text-xs rounded-full px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200">진행 중 {inProgressCount}</span>
                )}
              </div>
            )}
          </Card>
        )}

        {/* 마감 지난 할 일 — '나중에 하기'로 넘겨도 여기서 다시 정리할 수 있게 */}
        {overdueCount > 0 && (
          <button
            onClick={() => setOverdueOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-left hover:bg-red-50 transition-colors rise-in"
          >
            <Clock className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-sm text-red-700">
              마감이 지난 할 일 <b>{overdueCount}개</b>가 있어요
            </span>
            <span className="text-xs font-semibold text-red-600 flex items-center flex-shrink-0">
              정리하기 <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </button>
        )}

        {/* 한 줄 빠른 추가 */}
        <QuickAddTask
          onAdd={quickAdd}
          onOpenDetail={(title, due) => openCreate({ title, due_date: due ?? '' })}
        />

        <Tabs value={view} onValueChange={changeView}>
          <TabsList className="mb-1">
            <TabsTrigger value="list" className="gap-1"><List className="w-3.5 h-3.5" />리스트</TabsTrigger>
            <TabsTrigger value="kanban" className="gap-1"><Columns3 className="w-3.5 h-3.5" />칸반</TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1"><CalendarDays className="w-3.5 h-3.5" />캘린더</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-5">
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-xl bg-amber-100/50" />)}
              </div>
            ) : tasks.length === 0 ? (
              <Card className="p-8 text-center border-dashed border-amber-200 bg-white/70">
                <p className="text-3xl mb-2">📝</p>
                <p className="text-sm font-medium text-gray-700">이번 주 할 일이 아직 없어요</p>
                <p className="text-xs text-gray-400 mt-1">위 입력칸에 적고 Enter만 누르면 바로 담겨요</p>
                <Button size="sm" variant="outline" className="mt-4 border-amber-200 text-amber-700" onClick={() => setRoutineDialogOpen(true)}>
                  <Repeat className="w-3.5 h-3.5 mr-1" /> 매주 하는 일은 루틴으로 등록
                </Button>
              </Card>
            ) : (
              <>
                {openTasks.length === 0 && (
                  <Card className="p-6 text-center border-green-200 bg-green-50/60">
                    <p className="text-3xl mb-1">🎉</p>
                    <p className="text-sm font-semibold text-green-700">이번 주 할 일을 모두 끝냈어요!</p>
                    <p className="text-xs text-green-600/80 mt-1">다음 주 할 일을 미리 담아두거나, 오늘은 푹 쉬어요</p>
                  </Card>
                )}
                {/* 안 끝난 할 일 — 카테고리별, 급한 순 */}
                {[...groupCategories, null].map((cat) => {
                  const group = openTasks.filter(t => (t.category || null) === cat);
                  if (group.length === 0) return null;
                  const total = tasks.filter(t => (t.category || null) === cat);
                  const done = total.length - group.length;
                  // 카테고리를 하나도 안 쓰면 '기타' 머리글 없이 바로 목록만
                  const showHeader = groupCategories.length > 0;
                  return (
                    <section key={cat ?? '__none__'} className="space-y-2">
                      {showHeader && (
                        <div className="flex items-center gap-2 px-1">
                          <FolderOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          <h3 className="text-sm font-semibold text-gray-700 truncate min-w-0">{cat ?? '기타'}</h3>
                          <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 flex-shrink-0">{done}/{total.length}</Badge>
                          <button
                            onClick={() => openCreate({ category: cat ?? '' })}
                            className="ml-auto flex-shrink-0 flex items-center gap-0.5 text-xs text-amber-600 hover:bg-amber-50 rounded-full px-2 py-0.5 border border-amber-200"
                            aria-label={`${cat ?? '기타'}에 할 일 추가`}
                          >
                            <Plus className="w-3 h-3" /> 추가
                          </button>
                        </div>
                      )}
                      {group.map((task) => <TaskItem key={task.id} task={task} {...itemProps} />)}
                    </section>
                  );
                })}

                {/* 완료한 할 일 — 기본은 접어서 남은 일에 집중 */}
                {doneTasks.length > 0 && (
                  <section className="space-y-2">
                    <button
                      onClick={toggleShowDone}
                      className="flex items-center gap-1 px-1 text-sm font-medium text-gray-500 hover:text-gray-700"
                      aria-expanded={showDone}
                    >
                      <ChevronRight className={cn('w-4 h-4 transition-transform', showDone && 'rotate-90')} />
                      완료한 할 일 {doneTasks.length}개
                    </button>
                    {showDone && doneTasks.map((task) => <TaskItem key={task.id} task={task} showCategory {...itemProps} />)}
                  </section>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="kanban">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['todo', 'in_progress', 'done'] as TaskStatus[]).map(status => {
                const col = status === 'done' ? doneTasks : sorted.filter(t => t.status === status);
                const tone = {
                  todo: { title: 'text-gray-600', bg: 'bg-gray-50/70' },
                  in_progress: { title: 'text-blue-600', bg: 'bg-blue-50/40' },
                  done: { title: 'text-green-600', bg: 'bg-green-50/40' },
                }[status];
                return (
                  <div key={status} className="space-y-2">
                    <h3 className={cn('text-sm font-semibold px-1 flex items-center gap-1.5', tone.title)}>
                      <span className={cn('h-2 w-2 rounded-full', STATUS_META[status].dot)} />
                      {STATUS_META[status].label} <span className="font-normal text-gray-400">{col.length}</span>
                    </h3>
                    <div className={cn('space-y-2 min-h-[88px] rounded-xl p-2', tone.bg)}>
                      {col.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-6">
                          {status === 'in_progress' ? '카드의 상태를 "진행 중"으로 바꿔보세요' : '비어 있어요'}
                        </p>
                      ) : (
                        col.map((task) => <TaskItem key={task.id} task={task} showCategory {...itemProps} />)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="calendar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-3 border-amber-100/50 flex flex-col items-center">
                <Calendar
                  locale={ko}
                  mode="single"
                  selected={calDay}
                  onSelect={(d) => d && setCalDay(d)}
                  month={calMonth}
                  onMonthChange={setCalMonth}
                  modifiers={{ hasOpen: openDates.map(dateFromStr), allDone: doneOnlyDates.map(dateFromStr) }}
                  modifiersClassNames={{
                    hasOpen: "relative font-semibold after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-amber-500 aria-selected:after:bg-white",
                    allDone: "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-green-400 aria-selected:after:bg-white",
                  }}
                />
                <div className="flex items-center gap-3 pb-1 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-amber-500" /> 남은 할 일</span>
                  <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-green-400" /> 다 끝낸 날</span>
                </div>
              </Card>
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {formatDateLabel(calDayStr)}
                    {calDayStr === today && <span className="ml-1.5 text-xs font-medium text-amber-600">오늘</span>}
                  </h3>
                  {dayTasks.length > 0 && (
                    <span className="text-xs text-gray-400">{dayTasks.filter(t => t.status === 'done').length}/{dayTasks.length} 완료</span>
                  )}
                </div>
                {dayTasks.length === 0 ? (
                  <Card className="p-6 text-center border-dashed bg-white/70">
                    <p className="text-gray-400 text-sm">이 날짜엔 할 일이 없어요</p>
                    <Button size="sm" variant="outline" className="mt-3 border-amber-200 text-amber-700"
                      onClick={() => openCreate({ due_date: calDayStr })}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> 이 날짜에 추가
                    </Button>
                  </Card>
                ) : (
                  <>
                    {dayTasks.map((task) => <TaskItem key={task.id} task={task} showCategory {...itemProps} />)}
                    <Button size="sm" variant="ghost" className="text-amber-600"
                      onClick={() => openCreate({ due_date: calDayStr })}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> 이 날짜에 추가
                    </Button>
                  </>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <TaskFormDialog
        open={form.open}
        mode={form.mode}
        initial={form.initial}
        categories={suggestCategories}
        onClose={closeForm}
        onSubmit={submitForm}
      />

      <OverdueTasksDialog open={overdueOpen} onClose={() => setOverdueOpen(false)} onChanged={refreshAll} />

      {/* 루틴 관리 다이얼로그 */}
      <Dialog open={routineDialogOpen} onOpenChange={setRoutineDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Repeat className="w-4 h-4 text-amber-600" /> 반복 할 일 (루틴)</DialogTitle>
            <DialogDescription className="text-left">
              매주 하는 일을 한 번만 등록하면, 매주 이번 주 할 일에 자동으로 담겨요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {routines.length === 0 ? (
              <div className="text-center py-4 rounded-lg bg-amber-50/50 border border-dashed border-amber-200">
                <p className="text-sm text-gray-500">아직 루틴이 없어요</p>
                <p className="text-xs text-gray-400 mt-0.5">예: 주간 회고 쓰기, 영어 단어 50개</p>
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {routines.map(r => (
                  <li key={r.id} className="flex items-center gap-2 text-sm bg-amber-50/50 border border-amber-100 rounded-lg pl-3 pr-1 py-1.5">
                    <Repeat className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-gray-700">{r.title}</span>
                    {r.category && <Badge variant="outline" className="text-[10px] bg-white text-amber-600 border-amber-200 max-w-[6rem] truncate">{r.category}</Badge>}
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-gray-400 hover:text-red-500" onClick={() => deleteRoutine(r)} aria-label={`루틴 ${r.title} 삭제`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2 border-t pt-3">
              <Input
                placeholder="예: 영어 단어 50개 외우기"
                value={routineTitle}
                onChange={(e) => setRoutineTitle(e.target.value)}
                onKeyDown={(e) => isSubmitEnter(e) && addRoutine()}
                maxLength={100}
                aria-label="루틴 이름"
              />
              <div className="flex gap-2">
                <Input placeholder="카테고리 (선택)" value={routineCategory} onChange={(e) => setRoutineCategory(e.target.value)}
                  onKeyDown={(e) => isSubmitEnter(e) && addRoutine()} maxLength={20} className="flex-1" aria-label="루틴 카테고리" />
                <Button onClick={addRoutine} disabled={!routineTitle.trim() || routineSaving} className="bg-amber-600 hover:bg-amber-700 text-white">추가</Button>
              </div>
              {suggestCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestCategories.map((c) => (
                    <button key={c} type="button" onClick={() => setRoutineCategory(routineCategory === c ? '' : c)}
                      className={cn('text-xs rounded-full px-2 py-0.5 border max-w-[10rem] truncate',
                        routineCategory === c ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200')}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <BottomNav />
    </div>
  );
}
