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
import { Plus, ArrowLeft, Trash2, CheckCircle2, Circle, GripVertical, Pencil, FolderOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getWeekStart } from '@/lib/dates';
import BottomNav from '@/components/BottomNav';

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
  const [newCategory, setNewCategory] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const navigate = useNavigate();

  // 이미 쓰고 있는 카테고리들 (입력할 때 추천으로 보여줌)
  const categories = [...new Set(tasks.map(t => t.category).filter(Boolean))] as string[];

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
    const { error } = await supabase.from('tasks').insert({
      office_id: office.id,
      user_id: user.id,
      title: newTitle.trim(),
      category: newCategory.trim() || null,
      status: 'todo',
      priority: newPriority,
      week_start: weekStart,
      sort_order: sortOrder,
    });
    if (error) {
      toast.error('추가에 실패했어요');
      return;
    }
    setNewTitle('');
    setNewCategory('');
    setNewPriority('normal');
    setDialogOpen(false);
    fetchTasks();
    toast.success('할 일이 추가되었습니다');
  };

  const openEdit = (task: Task) => {
    setEditTask(task);
    setEditTitle(task.title);
    setEditCategory(task.category || '');
    setEditPriority(task.priority);
  };

  const saveEdit = async () => {
    if (!editTask || !editTitle.trim()) return;
    const { error } = await supabase
      .from('tasks')
      .update({
        title: editTitle.trim(),
        category: editCategory.trim() || null,
        priority: editPriority,
      })
      .eq('id', editTask.id);
    if (error) {
      toast.error('수정에 실패했어요');
      return;
    }
    setEditTask(null);
    fetchTasks();
    toast.success('수정되었습니다');
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
      <Button variant="ghost" size="icon" className="w-7 h-7 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-amber-600" onClick={() => openEdit(task)}>
        <Pencil className="w-3.5 h-3.5" />
      </Button>
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
                  <Label>카테고리 (선택)</Label>
                  <Input
                    placeholder="예: 자소서, 코딩테스트, 영어"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    list="category-suggestions"
                    maxLength={20}
                  />
                  <datalist id="category-suggestions">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                  {categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((c) => (
                        <button key={c} type="button" onClick={() => setNewCategory(c)}
                          className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
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

      <main className="max-w-5xl mx-auto px-4 py-6 pb-24">
        <Tabs defaultValue="list">
          <TabsList className="mb-4">
            <TabsTrigger value="list">리스트</TabsTrigger>
            <TabsTrigger value="kanban">칸반</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-5">
            {tasks.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <p className="text-gray-400 text-sm">이번 주 할 일을 추가해 보세요</p>
              </Card>
            ) : (
              // 카테고리별로 묶어서 표시 (카테고리 없는 항목은 맨 아래 '기타')
              [...categories, null].map((cat) => {
                const group = tasks.filter(t => (t.category || null) === cat);
                if (group.length === 0) return null;
                const done = group.filter(t => t.status === 'done').length;
                return (
                  <div key={cat ?? '__none__'} className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <FolderOpen className="w-4 h-4 text-amber-500" />
                      <h3 className="text-sm font-semibold text-gray-700">{cat ?? '기타'}</h3>
                      <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700">{done}/{group.length}</Badge>
                      <button
                        onClick={() => { setNewCategory(cat ?? ''); setDialogOpen(true); }}
                        className="ml-auto flex items-center gap-0.5 text-xs text-amber-600 hover:bg-amber-50 rounded-full px-2 py-0.5 border border-amber-200"
                        title={`${cat ?? '기타'}에 할 일 추가`}
                      >
                        <Plus className="w-3 h-3" /> 추가
                      </button>
                    </div>
                    {group.map((task) => <TaskItem key={task.id} task={task} />)}
                  </div>
                );
              })
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

      {/* 할 일 수정 다이얼로그 */}
      <Dialog open={!!editTask} onOpenChange={(open) => !open && setEditTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>할 일 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>제목</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
            </div>
            <div className="space-y-2">
              <Label>카테고리 (선택)</Label>
              <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} list="category-suggestions" maxLength={20} placeholder="예: 자소서, 코딩테스트" />
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <button key={c} type="button" onClick={() => setEditCategory(c)}
                      className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>우선순위</Label>
              <Select value={editPriority} onValueChange={(v) => setEditPriority(v as 'low' | 'normal' | 'high')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="normal">보통</SelectItem>
                  <SelectItem value="low">낮음</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveEdit} className="w-full bg-amber-600 hover:bg-amber-700 text-white">저장</Button>
          </div>
        </DialogContent>
      </Dialog>
      <BottomNav />
    </div>
  );
}