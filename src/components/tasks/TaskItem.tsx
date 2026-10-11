import { Task } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CalendarDays, CalendarClock, CheckCircle2, Circle, CircleDot, Flag, Lock, MoreVertical, Pencil, Repeat, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRIORITY_META, STATUS_META, TaskStatus, dueInfo, postponeLabel } from '@/lib/tasks';

interface TaskItemProps {
  task: Task;
  today: string;
  nowHM: string;
  showCategory?: boolean;
  onToggle: (task: Task) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onPostpone: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** 할 일 카드 — 동그라미로 완료, 제목을 누르면 수정, ⋯ 메뉴로 미루기·삭제 */
export default function TaskItem({ task, today, nowHM, showCategory, onToggle, onStatus, onEdit, onPostpone, onDelete }: TaskItemProps) {
  const done = task.status === 'done';
  const due = done ? null : dueInfo(task, today, nowHM);
  const overdue = due?.tone === 'overdue';

  return (
    <div
      className={cn(
        'group flex items-start gap-2.5 rounded-xl border bg-white p-3 transition-colors hover:border-amber-200',
        overdue ? 'border-red-100 bg-red-50/40' : 'border-gray-100',
        done && 'bg-white/70',
      )}
    >
      <button
        onClick={() => onToggle(task)}
        className="mt-px flex-shrink-0 rounded-full p-0.5 -m-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        aria-label={done ? '완료 취소' : '완료로 표시'}
        title={done ? '완료 취소' : '완료로 표시'}
      >
        {done ? (
          <CheckCircle2 className="w-5 h-5 text-green-500 check-pop" />
        ) : task.status === 'in_progress' ? (
          <CircleDot className="w-5 h-5 text-blue-500" />
        ) : (
          <Circle className="w-5 h-5 text-gray-300 hover:text-amber-400" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        {/* 제목을 누르면 바로 수정 */}
        <button
          onClick={() => onEdit(task)}
          className={cn(
            'block w-full text-left text-sm leading-snug break-keep [overflow-wrap:anywhere] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300',
            done ? 'line-through text-gray-400' : 'text-gray-800',
          )}
        >
          {task.title}
          {task.routine_id && <Repeat className="w-3 h-3 text-amber-400 inline ml-1 align-[-1px]" aria-label="루틴" />}
          {task.is_private && <Lock className="w-3 h-3 text-gray-400 inline ml-1 align-[-1px]" aria-label="비공개" />}
        </button>

        <div className="flex flex-wrap items-center gap-1 mt-1.5">
          {/* 상태 직접 고르기: 시작 전 / 진행 중 / 완료 */}
          <Select value={task.status} onValueChange={(v) => onStatus(task, v as TaskStatus)}>
            <SelectTrigger
              className={cn('h-6 w-auto gap-1 rounded-full px-2 text-xs font-medium [&>svg]:h-3 [&>svg]:w-3', STATUS_META[task.status].chip)}
              aria-label="진행 상태"
            >
              <i aria-hidden className={cn('h-1.5 w-1.5 rounded-full', STATUS_META[task.status].dot)} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_META) as TaskStatus[]).map(s => (
                <SelectItem key={s} value={s} className="text-xs">{STATUS_META[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {due && (
            <Badge variant="outline" className={cn('text-xs font-medium whitespace-nowrap', due.cls)}>
              <CalendarDays className="w-3 h-3 mr-0.5" />{due.label}
            </Badge>
          )}
          {/* '보통'은 기본값이라 굳이 표시하지 않는다 (카드를 가볍게) */}
          {task.priority !== 'normal' && (
            <Badge variant="outline" className={cn('text-xs whitespace-nowrap', PRIORITY_META[task.priority].chip)}>
              <Flag className="w-3 h-3 mr-0.5" />{PRIORITY_META[task.priority].label}
            </Badge>
          )}
          {showCategory && task.category && (
            <Badge variant="outline" className="text-xs whitespace-nowrap bg-white text-amber-700 border-amber-200 max-w-[8rem] truncate">
              {task.category}
            </Badge>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="w-7 h-7 -mr-1 flex-shrink-0 text-gray-400 hover:text-gray-700" aria-label="할 일 메뉴">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(task)}>
            <Pencil className="w-4 h-4 mr-2 text-amber-600" /> 수정
          </DropdownMenuItem>
          {!done && (
            <DropdownMenuItem onClick={() => onPostpone(task)}>
              <CalendarClock className="w-4 h-4 mr-2 text-amber-600" /> {postponeLabel(task, today)}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDelete(task)} className="text-red-500 focus:text-red-500">
            <Trash2 className="w-4 h-4 mr-2" /> 삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
