import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, CircleDot, Trash2, Building2, ListTodo, Lock, Plus } from 'lucide-react';
import { toast } from '@/lib/toast';
import { getWeekStart, kstToday } from '@/lib/dates';
import { isSubmitEnter } from '@/lib/utils';
import { deleteWithUndo, fetchWeekTasks, sortTasks, updateTaskStatus, useTasksChanged } from '@/lib/tasks';

// 마이페이지: 내가 속한 모든 오피스의 이번 주 할 일을 한눈에 보고,
// 여러 오피스에 같은 할 일을 일괄 추가할 수 있다
export default function MyTasksByOffice() {
  const { user } = useAuth();
  const { offices, office: currentOffice } = useOffice();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [selectedOffices, setSelectedOffices] = useState<Set<string>>(new Set());
  const [newPrivate, setNewPrivate] = useState(false);
  const [adding, setAdding] = useState(false);

  const weekStart = getWeekStart();

  // 할 일 탭과 같은 기준(이번 주에 담은 것 + 마감일이 이번 주인 것)으로 모든 오피스를 한 번에
  const fetchAll = useCallback(async () => {
    if (!user) return;
    setTasks(sortTasks(await fetchWeekTasks(user.id, null)));
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useTasksChanged(fetchAll);

  // 처음엔 지금 보고 있는 오피스를 골라둔다 (아무것도 안 골라 '추가'가 막혀 있는 상황 방지)
  useEffect(() => {
    if (currentOffice) setSelectedOffices(prev => (prev.size === 0 ? new Set([currentOffice.id]) : prev));
  }, [currentOffice]);

  const toggleOffice = (id: string) => {
    const next = new Set(selectedOffices);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedOffices(next);
  };

  const bulkAdd = async () => {
    if (!user || !newTitle.trim() || selectedOffices.size === 0 || adding) return;
    setAdding(true);
    const rows = [...selectedOffices].map(officeId => ({
      office_id: officeId,
      user_id: user.id,
      title: newTitle.trim(),
      status: 'todo',
      priority: 'normal',
      week_start: weekStart,
      due_date: kstToday(),
      is_private: newPrivate,
      sort_order: 999,
    }));
    const { error } = await supabase.from('tasks').insert(rows);
    if (error) {
      toast.error('추가하지 못했어요. 잠시 후 다시 시도해 주세요');
    } else {
      toast.success(selectedOffices.size > 1 ? `${selectedOffices.size}개 오피스에 오늘 할 일로 추가했어요` : '오늘 할 일로 추가했어요');
      setNewTitle('');
      fetchAll();
    }
    setAdding(false);
  };

  const toggleDone = async (task: Task) => {
    const status = task.status === 'done' ? 'todo' : 'done';
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status } : t)));
    if (!(await updateTaskStatus(task, status))) fetchAll();
  };

  const remove = (task: Task) => {
    deleteWithUndo({
      table: 'tasks',
      id: task.id,
      message: `"${task.title}" 삭제했어요`,
      onHide: () => setTasks(prev => prev.filter(t => t.id !== task.id)),
      onRestore: () => setTasks(prev => sortTasks([...prev, task])),
    });
  };

  return (
    <Card className="border-stroke-neutral-subtle">
      <CardHeader>
        <CardTitle className="text-t5 flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-fg-brand" /> 내 할 일 (오피스별)
        </CardTitle>
        <CardDescription>이번 주 할 일을 오피스별로 한눈에 보고, 여러 오피스에 한 번에 추가할 수 있어요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 일괄 추가 */}
        <div className="space-y-2 bg-bg-brand-weak border border-stroke-brand-weak rounded-lg p-3">
          <Input
            placeholder="예: 영어 단어 외우기"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => isSubmitEnter(e) && bulkAdd()}
            aria-label="추가할 할 일"
            maxLength={100}
          />
          <div className="flex flex-wrap gap-1.5">
            {offices.map(o => (
              <button
                key={o.id}
                onClick={() => toggleOffice(o.id)}
                aria-pressed={selectedOffices.has(o.id)}
                className={`text-t2 rounded-full px-2.5 py-1 border transition-colors max-w-full truncate ${
                  selectedOffices.has(o.id)
                    ? 'bg-bg-brand-solid text-white border-amber-600'
                    : 'bg-bg-layer-default text-fg-neutral-muted border-stroke-neutral-subtle hover:border-stroke-brand-weak'
                }`}
              >
                🏢 {o.name}
              </button>
            ))}
          </div>
          {selectedOffices.size === 0 && (
            <p className="text-t2 text-fg-brand">어느 오피스에 추가할지 하나 이상 골라주세요</p>
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-t2 text-fg-neutral-muted cursor-pointer">
              <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} className="accent-amber-600" />
              <Lock className="w-3 h-3" /> 비공개
            </label>
            <Button size="sm" onClick={bulkAdd} disabled={adding || !newTitle.trim() || selectedOffices.size === 0}
              className="bg-bg-brand-solid hover:bg-bg-brand-solid-pressed text-white">
              <Plus className="w-3.5 h-3.5 mr-1" />
              {selectedOffices.size > 1 ? `${selectedOffices.size}개 오피스에 추가` : '추가'}
            </Button>
          </div>
        </div>

        {/* 오피스별 목록 */}
        {offices.map(o => {
          const group = tasks.filter(t => t.office_id === o.id);
          const done = group.filter(t => t.status === 'done').length;
          return (
            <div key={o.id}>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-fg-brand flex-shrink-0" />
                <h4 className="text-t4 font-semibold text-fg-neutral-muted truncate min-w-0">{o.name}</h4>
                <Badge variant="secondary" className="text-t2 bg-bg-brand-weak text-fg-brand flex-shrink-0">{done}/{group.length}</Badge>
              </div>
              {group.length === 0 ? (
                <p className="text-t2 text-fg-neutral-muted pl-6 pb-1">이번 주 할 일이 없어요</p>
              ) : (
                <ul className="space-y-1.5">
                  {group.map(task => (
                    <li key={task.id} className="flex items-center gap-2 text-t4 bg-gray-50/70 rounded-lg px-3 py-2 group">
                      <button onClick={() => toggleDone(task)} aria-label={task.status === 'done' ? '완료 취소' : '완료로 표시'} className="flex-shrink-0">
                        {task.status === 'done'
                          ? <CheckCircle2 className="w-4 h-4 text-fg-positive check-pop" />
                          : task.status === 'in_progress'
                            ? <CircleDot className="w-4 h-4 text-fg-informative" />
                            : <Circle className="w-4 h-4 text-fg-neutral-subtle hover:text-fg-brand" />}
                      </button>
                      <span className={`flex-1 min-w-0 truncate ${task.status === 'done' ? 'line-through text-fg-neutral-muted' : 'text-fg-neutral-muted'}`}>
                        {task.title}
                        {task.is_private && <Lock className="w-3 h-3 text-fg-neutral-muted inline ml-1" />}
                      </span>
                      {task.category && (
                        <Badge variant="outline" className="text-t1 bg-bg-layer-default text-fg-brand border-stroke-brand-weak max-w-[6rem] truncate">{task.category}</Badge>
                      )}
                      {/* 모바일엔 호버가 없으니 항상 보이게, 데스크톱은 호버 시 */}
                      <button onClick={() => remove(task)} aria-label={`${task.title} 삭제`}
                        className="flex-shrink-0 p-1 -m-1 text-fg-neutral-subtle hover:text-fg-critical-contrast sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
