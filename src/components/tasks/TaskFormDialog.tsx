import { FormEvent, useEffect, useId, useState } from 'react';
import { Icon } from '@seed-design/react';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/AppDialog';
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

/** 고르는 칩. 시트 안에서 누르는 곳은 40px 이상, 라벨은 t4로 맞춘다 */
const chipBase = 'inline-flex h-x10 items-center whitespace-nowrap rounded-full border px-x3 t4-medium transition-colors';
const chipIdle = 'bg-bg-layer-default text-fg-neutral border-stroke-neutral-muted hover:bg-bg-neutral-weak';
const chipPicked = 'bg-bg-brand-solid text-fg-on-brand-solid border-stroke-brand-solid';
const chipCategory = 'bg-bg-brand-weak text-fg-brand border-stroke-brand-weak hover:bg-bg-brand-weak-pressed';
/** 칩 묶음 위 이름. 바로 위 SEED TextField 라벨(t5 medium)과 같은 모양이어야 한 폼으로 읽힌다 */
const fieldLabel = 't5-medium text-fg-neutral px-x0_5';
/** PRIORITY_META.picked에 아직 text-white가 남아 있어 고른 우선순위 글자색을 SEED 토큰으로 덮는다(cn의 twMerge가 text-white를 지운다) */
const priorityPickedFg: Record<TaskPriority, string> = {
  high: 'text-fg-on-critical-solid',
  normal: 'text-fg-on-brand-solid',
  low: 'text-fg-on-neutral-solid',
};

/** 할 일 추가·수정 공용 폼 — 자주 쓰는 날짜는 칩 한 번, 나머지는 선택 */
export default function TaskFormDialog({ open, mode, initial, categories, onClose, onSubmit }: TaskFormDialogProps) {
  const [draft, setDraft] = useState<TaskDraft>(initial);
  const [saving, setSaving] = useState(false);
  const formId = useId();
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
        {/* 제출 버튼은 푸터(본문 밖)에 있어서 form 속성으로 이 폼에 묶는다. 그래야 제목 칸에서
            Enter로 제출하는 것도 그대로 된다 */}
        <form id={formId} onSubmit={submit} className="flex flex-col gap-x4">
          <TextField label="제목" value={draft.title} onValueChange={(d) => set('title', d.value)}>
            <TextFieldInput id="task-title" autoFocus={mode === 'create'} placeholder="예: 자소서 1번 문항 초안 쓰기" maxLength={100} enterKeyHint="done" />
          </TextField>

          <div className="flex flex-col gap-x2">
            <TextField label="카테고리" indicator="선택" value={draft.category} onValueChange={(d) => set('category', d.value)}>
              <TextFieldInput id="task-category" placeholder="예: 자소서, 코딩테스트, 영어" maxLength={20} aria-label="예: 자소서, 코딩테스트, 영어" />
              {/* 입력칸 안 오른쪽 끝에 둔다. 칸 밖에 띄우면 라벨까지 합친 높이의 가운데에 걸린다 */}
              {draft.category && (
                <ActionButton type="button" variant="ghost" size="medium" layout="iconOnly" color="fg.neutralSubtle"
                  className="mr-x1_5 flex-shrink-0" onClick={() => set('category', '')} aria-label="카테고리 지우기">
                  <Icon svg={<X />} />
                </ActionButton>
              )}
            </TextField>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-x2">
                {categories.map((c) => (
                  <button key={c} type="button" onClick={() => set('category', draft.category === c ? '' : c)}
                    className={cn(chipBase, 'max-w-[10rem]', draft.category === c ? chipPicked : chipCategory)}>
                    <span className="truncate">{c}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-x2">
            <p className={fieldLabel}>마감</p>
            <div className="flex flex-wrap gap-x2">
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
            <div className="grid grid-cols-2 gap-x2">
              <TextField value={draft.due_date} onValueChange={(d) => set('due_date', d.value)}>
                <TextFieldInput type="date" aria-label="마감일" />
              </TextField>
              <TextField value={draft.due_time} onValueChange={(d) => set('due_time', d.value)} disabled={!draft.due_date}>
                <TextFieldInput type="time" aria-label="마감 시간" />
              </TextField>
            </div>
            {/* '시간 빼기'가 나타났다 사라져도 아래가 들썩이지 않게 버튼 높이만큼 늘 잡아 둔다 */}
            <p className="flex min-h-x10 flex-wrap items-center gap-x1 t4-regular text-fg-neutral-muted">
              {draft.due_date
                ? <>
                    <span>📅 {formatDateLabel(draft.due_date)}{timeLabel ? ` ${timeLabel}까지` : '까지'}</span>
                    {draft.due_time && (
                      <ActionButton type="button" variant="ghost" size="medium" color="fg.brand" fontWeight="medium" className="px-x2"
                        onClick={() => set('due_time', '')}>
                        시간 빼기
                      </ActionButton>
                    )}
                  </>
                : '날짜 없이 이번 주 할 일로 담겨요'}
            </p>
            {/* 수정할 때: 지금 마감일에서 며칠 미루기 */}
            {mode === 'edit' && draft.due_date && (
              <div className="flex items-center gap-x2">
                <span className="t4-regular text-fg-neutral-muted flex-shrink-0">미루기</span>
                <div className="grid flex-1 grid-cols-4 gap-x1_5">
                  {[1, 2, 3, 7].map(n => (
                    <button key={n} type="button" onClick={() => set('due_date', addDays(draft.due_date, n))}
                      className="h-x10 whitespace-nowrap rounded-r2 border border-stroke-brand-weak bg-bg-layer-default t4-medium text-fg-brand transition-colors hover:bg-bg-brand-weak active:bg-bg-brand-weak-pressed">
                      {n === 7 ? '+일주일' : `+${n}일`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-x2">
            <p className={fieldLabel}>우선순위</p>
            <div className="grid grid-cols-3 gap-x2" role="radiogroup" aria-label="우선순위">
              {(['high', 'normal', 'low'] as TaskPriority[]).map(p => (
                <button key={p} type="button" role="radio" aria-checked={draft.priority === p}
                  onClick={() => set('priority', p)}
                  className={cn('h-x10 rounded-r2 border t4-medium transition-colors',
                    draft.priority === p ? [PRIORITY_META[p].picked, priorityPickedFg[p]] : chipIdle)}>
                  {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
          </div>

          <label htmlFor="task-private" className="flex items-center gap-x3 rounded-r3 border border-stroke-neutral-subtle bg-bg-neutral-muted p-x3 cursor-pointer">
            <Lock className="w-5 h-5 text-fg-neutral-muted flex-shrink-0" />
            <span className="flex flex-1 min-w-0 flex-col gap-x0_5">
              <span className="t5-medium text-fg-neutral">비공개</span>
              <span className="t4-regular text-fg-neutral-muted">켜면 오피스 멤버에게 안 보이고 나만 볼 수 있어요</span>
            </span>
            <Switch id="task-private" checked={draft.is_private} onCheckedChange={(v) => set('is_private', v)} />
          </label>
        </form>

        <DialogFooter>
          <ActionButton type="submit" form={formId} variant="brandSolid" size="large" disabled={!draft.title.trim() || saving} className="w-full">
            {saving ? '저장 중…' : mode === 'create' ? '추가하기' : '저장'}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
