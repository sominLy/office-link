import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Lock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDays, formatDateLabel, formatTimeLabel, kstToday } from '@/lib/dates';
import { PRIORITY_META, TaskPriority, quickDueOptions } from '@/lib/tasks';

export interface TaskDraft {
  title: string;
  category: string;
  due_date: string; // '' = 날짜 없음 (이번 주 안에)
  due_time: string; // '' = 시간 없음
  is_private: boolean;
  priority: TaskPriority;
}

export const emptyDraft = (overrides: Partial<TaskDraft> = {}): TaskDraft => ({
  title: '',
  category: '',
  due_date: kstToday(),
  due_time: '',
  is_private: false,
  priority: 'normal',
  ...overrides,
});

interface TaskFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial: TaskDraft;
  categories: string[];
  onClose: () => void;
  onSubmit: (draft: TaskDraft) => Promise<boolean>;
}

const chipBase = 'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors';
const chipIdle = 'bg-white text-gray-600 border-gray-200 hover:border-amber-300';
const chipPicked = 'bg-amber-500 text-white border-amber-500';

/** 할 일 추가·수정 공용 폼 — 자주 쓰는 날짜는 칩 한 번, 나머지는 선택 */
export default function TaskFormDialog({ open, mode, initial, categories, onClose, onSubmit }: TaskFormDialogProps) {
  const [draft, setDraft] = useState<TaskDraft>(initial);
  const [saving, setSaving] = useState(false);
  const today = kstToday();

  // 열릴 때마다 초기값으로 (이전에 쓰다 만 내용이 남지 않게)
  useEffect(() => {
    if (open) {
      setDraft(initial);
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft(d => ({ ...d, [key]: value }));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.title.trim() || saving) return;
    setSaving(true);
    const ok = await onSubmit({ ...draft, title: draft.title.trim(), category: draft.category.trim() });
    setSaving(false);
    if (ok) onClose();
  };

  const timeLabel = formatTimeLabel(draft.due_time || null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* 수정할 땐 바로 키보드가 올라와 폼을 가리지 않도록 자동 포커스를 끈다 */}
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => mode === 'edit' && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '새 할 일' : '할 일 수정'}</DialogTitle>
          <DialogDescription className="sr-only">할 일 제목과 마감일, 우선순위를 정해요</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">제목</Label>
            <Input
              id="task-title"
              autoFocus={mode === 'create'}
              placeholder="예: 자소서 1번 문항 초안 쓰기"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={100}
              enterKeyHint="done"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-category">카테고리 <span className="text-gray-400 font-normal">(선택)</span></Label>
            <div className="relative">
              <Input
                id="task-category"
                placeholder="예: 자소서, 코딩테스트, 영어"
                value={draft.category}
                onChange={(e) => set('category', e.target.value)}
                maxLength={20}
                className={draft.category ? 'pr-8' : undefined}
              />
              {draft.category && (
                <button type="button" onClick={() => set('category', '')} aria-label="카테고리 지우기"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button key={c} type="button" onClick={() => set('category', draft.category === c ? '' : c)}
                    className={cn(chipBase, 'max-w-[10rem] truncate', draft.category === c ? chipPicked : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100')}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>마감</Label>
            <div className="flex flex-wrap gap-1.5">
              {quickDueOptions(today).map(o => {
                const picked = (o.date ?? '') === draft.due_date;
                return (
                  <button key={o.key} type="button"
                    onClick={() => setDraft(d => ({ ...d, due_date: o.date ?? '', due_time: o.date ? d.due_time : '' }))}
                    className={cn(chipBase, picked ? chipPicked : chipIdle)}>
                    {o.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input type="date" value={draft.due_date} onChange={(e) => set('due_date', e.target.value)}
                className="flex-1 min-w-0" aria-label="마감일" />
              <Input type="time" value={draft.due_time} onChange={(e) => set('due_time', e.target.value)}
                disabled={!draft.due_date} aria-label="마감 시간" className="w-32 flex-shrink-0" />
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1 min-h-[1rem]">
              {draft.due_date
                ? <>📅 {formatDateLabel(draft.due_date)}{timeLabel ? ` ${timeLabel}까지` : '까지'}
                    {draft.due_time && (
                      <button type="button" onClick={() => set('due_time', '')} className="ml-1 text-amber-600 underline underline-offset-2">시간 빼기</button>
                    )}
                  </>
                : '날짜 없이 이번 주 할 일로 담겨요'}
            </p>
            {/* 수정할 때: 지금 마감일에서 며칠 미루기 */}
            {mode === 'edit' && draft.due_date && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-xs text-gray-500 flex-shrink-0">미루기</span>
                <div className="grid grid-cols-4 gap-1.5 flex-1">
                  {[1, 2, 3, 7].map(n => (
                    <button key={n} type="button" onClick={() => set('due_date', addDays(draft.due_date, n))}
                      className="rounded-lg border border-amber-200 bg-white py-1 text-xs font-medium text-amber-700 hover:bg-amber-50">
                      {n === 7 ? '+일주일' : `+${n}일`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>우선순위</Label>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="우선순위">
              {(['high', 'normal', 'low'] as TaskPriority[]).map(p => (
                <button key={p} type="button" role="radio" aria-checked={draft.priority === p}
                  onClick={() => set('priority', p)}
                  className={cn('rounded-lg border py-2 text-sm font-medium transition-colors',
                    draft.priority === p ? PRIORITY_META[p].picked : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300')}>
                  {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
          </div>

          <label htmlFor="task-private" className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5 cursor-pointer">
            <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="flex-1">
              <span className="block text-sm text-gray-700">비공개</span>
              <span className="block text-xs text-gray-400">켜면 오피스 멤버에게 안 보이고 나만 볼 수 있어요</span>
            </span>
            <Switch id="task-private" checked={draft.is_private} onCheckedChange={(v) => set('is_private', v)} />
          </label>

          <Button type="submit" disabled={!draft.title.trim() || saving} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
            {saving ? '저장 중…' : mode === 'create' ? '추가하기' : '저장'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
