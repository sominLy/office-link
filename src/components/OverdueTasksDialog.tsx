import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays, CheckCheck, Clock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addDays, formatTimeLabel, getWeekStart, kstToday } from '@/lib/dates';

const EXTEND_OPTIONS = [
  { days: 1, label: '+1일' },
  { days: 2, label: '+2일' },
  { days: 3, label: '+3일' },
  { days: 7, label: '+일주일' },
];

/**
 * 마감일이 지났는데 아직 완료되지 않은 할 일을 정리하는 다이얼로그.
 * 출근 버튼을 누른 뒤 자동으로 열려서, 기간을 늘리거나 완료/삭제로 비울 수 있다.
 */
export default function OverdueTasksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { office } = useOffice();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null); // 날짜 직접 고르기를 연 할 일 id
  const today = kstToday();

  const fetchOverdue = useCallback(async () => {
    if (!user || !office) return;
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('office_id', office.id)
      .neq('status', 'done')
      .not('due_date', 'is', null)
      .lt('due_date', today)
      .order('due_date');
    setTasks(data || []);
  }, [user, office, today]);

  useEffect(() => {
    if (open) fetchOverdue();
  }, [open, fetchOverdue]);

  // 마감일을 옮기면 그 날짜가 속한 주의 할 일로 따라 옮긴다 (주간 목록에서 안 사라지게)
  const moveDue = async (task: Task, newDue: string) => {
    const [y, m, d] = newDue.split('-').map(Number);
    const { error } = await supabase
      .from('tasks')
      .update({ due_date: newDue, week_start: getWeekStart(new Date(y, m - 1, d)) })
      .eq('id', task.id);
    if (error) {
      toast.error('기간을 늘리지 못했어요');
      return;
    }
    setTasks(prev => prev.filter(t => t.id !== task.id));
    setPickerFor(null);
    toast.success(`"${task.title}" 마감일을 ${newDue}로 옮겼어요`);
  };

  const complete = async (task: Task) => {
    await supabase
      .from('tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', task.id);
    setTasks(prev => prev.filter(t => t.id !== task.id));
    toast.success('완료 처리했어요 🎉');
  };

  const remove = async (task: Task) => {
    await supabase.from('tasks').delete().eq('id', task.id);
    setTasks(prev => prev.filter(t => t.id !== task.id));
    toast.success('삭제했어요');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-red-500" /> 마감일이 지난 할 일
          </DialogTitle>
        </DialogHeader>
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">밀린 할 일이 없어요. 깔끔하네요 ✨</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 -mt-1">
              {tasks.length}개가 아직 완료되지 않았어요. 기간을 늘리거나 정리하고 시작해요.
            </p>
            <ul className="space-y-2">
              {tasks.map((task) => {
                const late = Math.round((new Date(today).getTime() - new Date(task.due_date as string).getTime()) / 86400000);
                const timeLabel = formatTimeLabel(task.due_time);
                return (
                  <li key={task.id} className="rounded-xl border border-red-100 bg-red-50/40 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="flex-1 text-sm text-gray-800 break-keep [overflow-wrap:anywhere]">{task.title}</span>
                      <Badge variant="outline" className="text-xs whitespace-nowrap bg-red-100 text-red-600 border-red-200">
                        {late}일 지남
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />{task.due_date}
                      {timeLabel && <><Clock className="w-3 h-3 ml-1" />{timeLabel}</>}
                      {task.status === 'in_progress' && (
                        <Badge variant="outline" className="ml-1 text-[10px] bg-blue-50 text-blue-600 border-blue-200">진행 중</Badge>
                      )}
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {EXTEND_OPTIONS.map(o => (
                        <button
                          key={o.days}
                          onClick={() => moveDue(task, addDays(today, o.days))}
                          className="rounded-lg border border-amber-200 bg-white py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    {pickerFor === task.id ? (
                      <input
                        type="date"
                        autoFocus
                        defaultValue={today}
                        onChange={(e) => e.target.value && moveDue(task, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => setPickerFor(task.id)}>
                          <CalendarDays className="w-3.5 h-3.5 mr-1" /> 날짜 다시 정하기
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-green-600" onClick={() => complete(task)}>
                          <CheckCheck className="w-3.5 h-3.5 mr-1" /> 완료
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500 ml-auto" onClick={() => remove(task)}>
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
        <Button variant="outline" className="w-full border-amber-200 text-amber-700" onClick={onClose}>
          {tasks.length === 0 ? '닫기' : '나중에 하기'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
