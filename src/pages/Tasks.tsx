import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, ArrowLeft, Trash2, CheckCircle2, Circle, GripVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getWeekStart } from '@/lib/dates';

const priorityLabels = { high: '높음', normal: '보통', low: '낮음' };
const priorityColors = {
  high: 'bg-red-50 text-red-600 border-red-200',
  normal: 'bg-amber-50 text-amber-600 border-amber-200',
  low: 'bg-gray-50 text-gray-500 border-gray-200',
};
const statusLabels = { todo: '할 일', in_progress: '진행 중', done: '완료' };

export default function Tasks() {
  const { user } = useAuth();
  const { office } = useOffice();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  const weekStart = getWeekStart();

  const fetchTasks = useCallback(async () => {
    if (!user || !office) return;
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .eq('week_start', weekStart)
      .order('sort_order');
    setTasks(data || []);
  }, [user, office, weekStart]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const addTask = async () => {
    if (!user || !office || !newTitle.trim()) return;
    const sortOrder = tasks.length;
    await supabase.from('tasks').insert({
      office_id: office.id,
      user_id: user.id,
      title: newTitle.trim(),
      status: 'todo',
      priority: newPriority,
      week_start: weekStart,
      sort_order: sortOrder,
    });
    setNewTitle('');
    setNewPriority('normal');
    setDialogOpen(false);
    fetchTasks();
    toast.success('할 일이 추가되었습니다');
  };

  const updateStatus = async (task: Task, status: 'todo' | 'in_progress' | 'done') => {
    const now = new Date().toISOString();
    await supabase
      .from('tasks')
      .update({ status, completed_at: status === 'done' ? now : null })
      .eq('id', task.id);
    fetchTasks();
  };

  const deleteTask = async (taskId: string) => {
    await supabase.from('tasks').delete().eq('id', taskId);
    fetchTasks();
    toast.success('삭제되었습니다');
  };

  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'done');

  const TaskItem = ({ task }: { task: Task }) => (
    <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-100 group hover:border-amber-200 transition-colors">
      <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
      <button onClick={() => updateStatus(task, task.status === 'done' ? 'todo' : 'done')} className="flex-shrink-0">
        {task.status === 'done' ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : (
          <Circle className="w-5 h-5 text-gray-300 hover:text-amber-400" />
        )}
      </button>
      <span className={`text-sm flex-1 ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
        {task.title}
      </span>
      <Badge variant="outline" className={`text-xs ${priorityColors[task.priority]}`}>
        {priorityLabels[task.priority]}
      </Badge>
      {task.status !== 'done' && task.status !== 'in_progress' && (
        <Button variant="ghost" size="sm" className="text-xs text-blue-500 opacity-0 group-hover:opacity-100" onClick={() => updateStatus(task, 'in_progress')}>
          시작
        </Button>
      )}
      {task.status === 'in_progress' && (
        <Button variant="ghost" size="sm" className="text-xs text-green-500 opacity-0 group-hover:opacity-100" onClick={() => updateStatus(task, 'done')}>
          완료
        </Button>
      )}
      <Button variant="ghost" size="icon" className="w-7 h-7 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500" onClick={() => deleteTask(task.id)}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-amber-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="font-bold text-gray-800">이번 주 할 일</h1>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                <Plus className="w-4 h-4 mr-1" /> 추가
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>새 할 일</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>제목</Label>
                  <Input
                    placeholder="할 일을 입력하세요"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTask()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>우선순위</Label>
                  <Select value={newPriority} onValueChange={(v) => setNewPriority(v as 'low' | 'normal' | 'high')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">높음</SelectItem>
                      <SelectItem value="normal">보통</SelectItem>
                      <SelectItem value="low">낮음</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addTask} className="w-full bg-amber-600 hover:bg-amber-700 text-white">추가하기</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Tabs defaultValue="list">
          <TabsList className="mb-4">
            <TabsTrigger value="list">리스트</TabsTrigger>
            <TabsTrigger value="kanban">칸반</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-2">
            {tasks.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <p className="text-gray-400 text-sm">이번 주 할 일을 추가해 보세요</p>
              </Card>
            ) : (
              tasks.map((task) => <TaskItem key={task.id} task={task} />)
            )}
          </TabsContent>

          <TabsContent value="kanban">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-500 px-1">할 일 ({todoTasks.length})</h3>
                <div className="space-y-2 min-h-[100px] bg-gray-50/50 rounded-lg p-2">
                  {todoTasks.map((task) => <TaskItem key={task.id} task={task} />)}
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-blue-600 px-1">진행 중 ({inProgressTasks.length})</h3>
                <div className="space-y-2 min-h-[100px] bg-blue-50/30 rounded-lg p-2">
                  {inProgressTasks.map((task) => <TaskItem key={task.id} task={task} />)}
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-green-600 px-1">완료 ({doneTasks.length})</h3>
                <div className="space-y-2 min-h-[100px] bg-green-50/30 rounded-lg p-2">
                  {doneTasks.map((task) => <TaskItem key={task.id} task={task} />)}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}