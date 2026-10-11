import { supabase } from '@/lib/supabase';
import type { Task } from '@/lib/types';

/** Reorder a visible group while keeping every other task in its existing slot. */
export function reorderTaskSubset(tasks: Task[], orderedIds: string[]): Task[] {
  const selectedIds = new Set(orderedIds);
  const taskById = new Map(tasks.map(task => [task.id, task]));
  if (
    orderedIds.length < 2 ||
    selectedIds.size !== orderedIds.length ||
    taskById.size !== tasks.length ||
    orderedIds.some(id => !taskById.has(id))
  ) return tasks;

  const currentIds = tasks.filter(task => selectedIds.has(task.id)).map(task => task.id);
  if (currentIds.every((id, index) => id === orderedIds[index])) return tasks;

  let groupIndex = 0;
  return tasks.map((task, sortOrder) => {
    const reordered = selectedIds.has(task.id)
      ? taskById.get(orderedIds[groupIndex++])!
      : task;
    return reordered.sort_order === sortOrder
      ? reordered
      : { ...reordered, sort_order: sortOrder };
  });
}

/** Save only ranks; never overwrite task content from a stale list snapshot. */
export async function saveTaskOrder(
  previous: Task[],
  next: Task[],
  userId: string,
  officeId: string,
): Promise<void> {
  const previousById = new Map(previous.map(task => [task.id, task]));
  const nextIds = new Set(next.map(task => task.id));
  if (
    !userId || !officeId ||
    previousById.size !== previous.length ||
    nextIds.size !== next.length ||
    previous.length !== next.length ||
    next.some(task => !previousById.has(task.id)) ||
    [...previous, ...next].some(task =>
      task.user_id !== userId || task.office_id !== officeId ||
      !Number.isInteger(task.sort_order),
    )
  ) throw new Error('할 일 순서를 저장할 목록이 올바르지 않습니다.');

  const changed = next.filter(task => previousById.get(task.id)!.sort_order !== task.sort_order);
  if (changed.length === 0) return;

  const updateRank = async (taskId: string, sortOrder: number) => {
    const { data, error } = await supabase
      .from('tasks')
      .update({ sort_order: sortOrder })
      .eq('id', taskId)
      .eq('user_id', userId)
      .eq('office_id', officeId)
      .select('id')
      .single();
    if (error) throw error;
    if (data?.id !== taskId) throw new Error('순서를 저장할 할 일을 찾을 수 없습니다.');
  };

  // Wait for every write before rolling back, including requests that rejected.
  const results = await Promise.allSettled(changed.map(task => updateRank(task.id, task.sort_order)));
  if (results.every(result => result.status === 'fulfilled')) return;

  // A failed response may still have committed. Restore all attempted ranks and
  // let the caller refetch, since a rollback can also fail when offline.
  await Promise.allSettled(changed.map(task =>
    updateRank(task.id, previousById.get(task.id)!.sort_order),
  ));
  throw new Error('할 일 순서를 저장하지 못했습니다. 다시 시도해 주세요.');
}
