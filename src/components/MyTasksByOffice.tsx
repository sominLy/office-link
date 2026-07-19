import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Trash2, Building2, ListTodo, Lock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getWeekStart, kstToday } from '@/lib/dates';

// 마이페이지: 내가 속한 모든 오피스의 이번 주 할 일을 한눈에 보고,
// 여러 오피스에 같은 할 일을 일괄 추가할 수 있다
export default function MyTasksByOffice() {
  const { user } = useAuth();
  const { offices } = useOffice();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [selectedOffices, setSelectedOffices] = useState<Set<string>>(new Set());
  const [newPrivate, setNewPrivate] = useState(false);
  const [adding, setAdding] = useState(false);

  const weekStart = getWeekStart();

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .order('sort_order');
    setTasks(data || []);
  }, [user, weekStart]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
      toast.error('추가에 실패했어요');
    } else {
      toast.success(`${selectedOffices.size}개 오피스에 추가되었어요`);
      setNewTitle('');
      fetchAll();
    }
    setAdding(false);
  };

  const toggleDone = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    await supabase.from('tasks')
      .update({ status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null })
      .eq('id', task.id);
    fetchAll();
  };

  const remove = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id);
    fetchAll();
  };

  return (
    <Card className="border-amber-100/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-amber-600" /> 내 할 일 (오피스별)
        </CardTitle>
        <CardDescription>이번 주 할 일을 오피스별로 한눈에 보고, 여러 오피스에 한 번에 추가할 수 있어요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 일괄 추가 */}
        <div className="space-y-2 bg-amber-50/50 border border-amber-100 rounded-lg p-3">
          <Input
            placeholder="예: 영어 단어 외우기"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && bulkAdd()}
            maxLength={100}
          />
          <div className="flex flex-wrap gap-1.5">
            {offices.map(o => (
              <button
                key={o.id}
                onClick={() => toggleOffice(o.id)}
                className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                  selectedOffices.has(o.id)
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
                }`}
              >
                🏢 {o.name}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} className="accent-amber-600" />
              <Lock className="w-3 h-3" /> 비공개
            </label>
            <Button size="sm" onClick={bulkAdd} disabled={adding || !newTitle.trim() || selectedOffices.size === 0}
              className="bg-amber-600 hover:bg-amber-700 text-white">
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
                <Building2 className="w-4 h-4 text-amber-500" />
                <h4 className="text-sm font-semibold text-gray-700">{o.name}</h4>
                <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700">{done}/{group.length}</Badge>
              </div>
              {group.length === 0 ? (
                <p className="text-xs text-gray-400 pl-6 pb-1">이번 주 할 일이 없어요</p>
              ) : (
                <ul className="space-y-1.5">
                  {group.map(task => (
                    <li key={task.id} className="flex items-center gap-2 text-sm bg-gray-50/70 rounded-lg px-3 py-2 group">
                      <button onClick={() => toggleDone(task)}>
                        {task.status === 'done'
                          ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                          : <Circle className="w-4 h-4 text-gray-300 hover:text-amber-400" />}
                      </button>
                      <span className={`flex-1 truncate ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                        {task.title}
                        {task.is_private && <Lock className="w-3 h-3 text-gray-400 inline ml-1" />}
                      </span>
                      {task.category && (
                        <Badge variant="outline" className="text-[10px] bg-white text-amber-600 border-amber-200">{task.category}</Badge>
                      )}
                      <button onClick={() => remove(task.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
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
