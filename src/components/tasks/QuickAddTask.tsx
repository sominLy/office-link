import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CalendarDays, Check, ChevronDown, Plus, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { kstToday } from '@/lib/dates';
import { quickDueOptions, shortDueLabel } from '@/lib/tasks';

interface QuickAddTaskProps {
  /** 추가 성공 시 true — 성공해야 입력칸을 비운다 */
  onAdd: (title: string, due: string | null) => Promise<boolean>;
  /** 날짜·시간·우선순위까지 정하고 싶을 때 전체 입력창 열기 */
  onOpenDetail?: (title: string, due: string | null) => void;
  defaultDue?: string | null;
  placeholder?: string;
  className?: string;
}

/** 다이얼로그 없이 한 줄로 바로 추가 — 제목 적고 Enter */
export default function QuickAddTask({ onAdd, onOpenDetail, defaultDue = kstToday(), placeholder = '할 일을 적고 Enter', className }: QuickAddTaskProps) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<string | null>(defaultDue);
  const [saving, setSaving] = useState(false);
  const today = kstToday();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    const ok = await onAdd(title.trim(), due);
    setSaving(false);
    if (ok) setTitle(''); // 연달아 적을 수 있게 포커스는 그대로 둔다
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        'flex items-center gap-1.5 rounded-xl border border-amber-100 bg-white pl-3 pr-1.5 py-1.5 shadow-sm transition-colors focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-100',
        className,
      )}
    >
      <Plus className="w-4 h-4 text-amber-500 flex-shrink-0" aria-hidden />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        maxLength={100}
        enterKeyHint="enter"
        aria-label="새 할 일 제목"
        className="flex-1 min-w-0 bg-transparent py-1 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 flex-shrink-0 whitespace-nowrap"
            aria-label={`마감: ${shortDueLabel(due, today)} (바꾸기)`}
          >
            <CalendarDays className="w-3 h-3" />
            {shortDueLabel(due, today)}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs text-gray-400 font-normal">언제까지 할까요?</DropdownMenuLabel>
          {quickDueOptions(today).map(o => (
            <DropdownMenuItem key={o.key} onClick={() => setDue(o.date)} className="cursor-pointer">
              <span className="flex-1">{o.date ? o.label : '날짜 없이 (이번 주)'}</span>
              {due === o.date && <Check className="w-4 h-4 text-amber-600" />}
            </DropdownMenuItem>
          ))}
          {onOpenDetail && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { onOpenDetail(title.trim(), due); setTitle(''); }} className="cursor-pointer text-amber-700">
                <SlidersHorizontal className="w-4 h-4 mr-2" /> 날짜·시간 직접 정하기
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button type="submit" size="sm" disabled={!title.trim() || saving}
        className="h-8 px-3 bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0">
        추가
      </Button>
    </form>
  );
}
