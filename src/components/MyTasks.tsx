import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getWeekStart } from '@/lib/dates';

const priorityColors = {
  high: 'text-red-500',
  normal: 'text-amber-500',
  low: 'text-gray-400',
};

export default function MyTasks({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { office } = useOffice();
  const [tasks, setTasks] = useState<Task[]>([]);
  const navigate = useNavigate();

  const fetchTasks = useCallback(async () => {
    if (!user || !office) return;
    const weekStart = getWeekStart();
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .eq('week_start', weekStart)
      .order('sort_order');
    setTasks(data || []);
  }, [user, office]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const toggleComplete = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    const now = new Date().toISOString();
    await supabase
      .from('tasks')
      .update({
        status: newStatus,
        completed_at: newStatus === 'done' ? now : null,
      })
      .eq('id', task.id);
    fetchTasks();
  };

  const displayTasks = compact ? tasks.filter(t => t.status !== 'done').slice(0, 3) : tasks;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  return (
    <Card className="p-5 border-amber-100/50 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-800 text-sm">이번 주 할 일</h3>
          <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700">
            {doneCount}/{tasks.length}
          </Badge>
        </div>
        {compact && (
          <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')} className="text-amber-600 text-xs">
            전체 보기 <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        )}
      </div>

      {displayTasks.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">
          {tasks.length === 0 ? '이번 주 할 일을 추가해 보세요' : '모든 할 일을 완료했습니다 🎉'}
        </p>
      ) : (
        <ul className="space-y-2">
          {displayTasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 group">
              <button onClick={() => toggleComplete(task)} className="flex-shrink-0">
                {task.status === 'done' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Circle className={`w-5 h-5 ${priorityColors[task.priority]}`} />
                )}
              </button>
              <span className={`text-sm flex-1 truncate ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {task.title}
              </span>
              {task.status === 'in_progress' && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">진행 중</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}