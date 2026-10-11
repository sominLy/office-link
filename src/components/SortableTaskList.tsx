import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';
import { Task } from '@/lib/types';

interface Props {
  tasks: Task[];
  disabled?: boolean;
  onReorder: (ids: string[]) => void;
  renderTask: (task: Task, handle: ReactNode) => ReactNode;
}

interface Drag {
  id: string;
  pointerId: number;
  ids: string[];
  startY: number;
  x: number;
  y: number;
  offsetY: number;
  left: number;
  width: number;
  active: boolean;
  index: number | null;
}

// Pointer capture keeps the handle usable with both a mouse and a touch screen.
// Only this list's rows are targets, so dragging never changes a task's category/status.
export default function SortableTaskList({ tasks, disabled = false, onReorder, renderTask }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const frameRef = useRef<number>(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const instructionsId = useId();

  const cancel = () => {
    cancelAnimationFrame(frameRef.current);
    dragRef.current = null;
    setDrag(null);
  };

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  useEffect(() => {
    if (disabled) cancel();
  }, [disabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', cancel);
    };
  }, []);

  const updateTarget = () => {
    const current = dragRef.current;
    const list = listRef.current;
    if (!current?.active || !list) return;
    const bounds = list.getBoundingClientRect();
    const inside = current.x >= bounds.left - 24 && current.x <= bounds.right + 24
      && current.y >= bounds.top - 24 && current.y <= bounds.bottom + 24;
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-task-id]'))
      .filter(row => row.dataset.taskId !== current.id);
    current.index = inside ? rows.filter(row => {
      const rect = row.getBoundingClientRect();
      return current.y > rect.top + rect.height / 2;
    }).length : null;
    setDrag({ ...current });
  };

  const autoScroll = () => {
    const current = dragRef.current;
    if (!current?.active) return;
    const bounds = listRef.current?.getBoundingClientRect();
    if (bounds && current.x >= bounds.left - 24 && current.x <= bounds.right + 24) {
      const margin = 100;
      const speed = current.y < margin ? -Math.min(14, (margin - current.y) / 5)
        : current.y > window.innerHeight - margin ? Math.min(14, (current.y - window.innerHeight + margin) / 5) : 0;
      if (speed) {
        window.scrollBy(0, speed);
        updateTarget();
      }
    }
    frameRef.current = requestAnimationFrame(autoScroll);
  };

  const commit = (id: string, index: number) => {
    const ids = tasks.map(task => task.id);
    const from = ids.indexOf(id);
    if (from < 0 || from === index || disabled) return;
    ids.splice(from, 1);
    ids.splice(index, 0, id);
    setAnnouncement(`${tasks.find(task => task.id === id)?.title}, ${index + 1}번째로 이동`);
    onReorder(ids);
  };

  const handle = (task: Task) => (
    <button
      type="button"
      aria-label={`${task.title} 순서 변경`}
      aria-describedby={instructionsId}
      title="위아래로 드래그해서 순서 변경 (키보드: ↑ ↓)"
      disabled={tasks.length < 2}
      aria-disabled={disabled || tasks.length < 2}
      className="-ml-1 -mt-1 flex h-7 w-7 shrink-0 touch-none select-none items-center justify-center rounded text-gray-400 hover:bg-amber-50 hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-grab active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
      onPointerDown={event => {
        if (disabled || tasks.length < 2 || event.button !== 0 || !event.isPrimary) return;
        const rect = event.currentTarget.closest('[data-task-id]')!.getBoundingClientRect();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          id: task.id, pointerId: event.pointerId, ids: tasks.map(t => t.id),
          startY: event.clientY, x: event.clientX, y: event.clientY,
          offsetY: event.clientY - rect.top, left: rect.left, width: rect.width,
          active: false, index: tasks.findIndex(t => t.id === task.id),
        };
      }}
      onPointerMove={event => {
        const current = dragRef.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.x = event.clientX;
        current.y = event.clientY;
        if (!current.active && Math.abs(current.y - current.startY) >= 5) {
          current.active = true;
          frameRef.current = requestAnimationFrame(autoScroll);
        }
        updateTarget();
      }}
      onPointerUp={event => {
        const current = dragRef.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const unchanged = current.ids.join(',') === tasks.map(t => t.id).join(',');
        cancel();
        if (current.active && current.index !== null && unchanged) commit(current.id, current.index);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={event => {
        if (dragRef.current || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const from = tasks.findIndex(t => t.id === task.id);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? tasks.length - 1
          : Math.max(0, Math.min(tasks.length - 1, from + (event.key === 'ArrowUp' ? -1 : 1)));
        commit(task.id, index);
      }}
    >
      <GripVertical className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  const draggedTask = drag?.active ? tasks.find(task => task.id === drag.id) : null;
  const remaining = tasks.filter(task => task.id !== drag?.id);
  const showTarget = drag?.active && drag.index !== null && drag.index !== tasks.findIndex(task => task.id === drag.id);
  const beforeId = showTarget ? remaining[drag.index]?.id : null;
  const afterId = showTarget && drag.index === remaining.length ? remaining[remaining.length - 1]?.id : null;

  return (
    <div ref={listRef} className="space-y-2" aria-busy={disabled}>
      <p id={instructionsId} className="sr-only">위아래로 드래그하거나 방향키로 순서를 바꾸세요. Home은 맨 위, End는 맨 아래로 이동하고 Escape는 드래그를 취소합니다.</p>
      {tasks.map(task => (
        <div key={task.id} data-task-id={task.id} className={`relative ${draggedTask?.id === task.id ? 'opacity-30' : ''}`}>
          {beforeId === task.id && <div className="pointer-events-none absolute -top-1.5 inset-x-0 z-10 border-t-2 border-amber-500" />}
          {renderTask(task, handle(task))}
          {afterId === task.id && <div className="pointer-events-none absolute -bottom-1.5 inset-x-0 z-10 border-t-2 border-amber-500" />}
        </div>
      ))}
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      {draggedTask && createPortal(
        <div className="pointer-events-none fixed z-50 rounded-lg shadow-xl ring-2 ring-amber-400 opacity-95" aria-hidden="true" ref={node => node?.setAttribute('inert', '')}
          style={{ top: drag.y - drag.offsetY, left: drag.left, width: drag.width }}>
          {renderTask(draggedTask, <GripVertical className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />)}
        </div>, document.body,
      )}
    </div>
  );
}
