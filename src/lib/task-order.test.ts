import { describe, it, expect } from 'vitest';
import type { Task } from '@/lib/types';
import { reorderTaskSubset } from '@/lib/task-order';

function task(id: string, sortOrder: number): Task {
  return {
    id,
    office_id: 'office-1',
    user_id: 'user-1',
    title: id,
    description: null,
    category: null,
    status: 'todo',
    priority: 'normal',
    due_date: null,
    due_time: null,
    week_start: '2026-10-05',
    sort_order: sortOrder,
    completed_at: null,
    routine_id: null,
    is_private: false,
    created_at: '2026-10-05T00:00:00Z',
  };
}

describe('reorderTaskSubset', () => {
  const list = [task('a', 0), task('b', 1), task('c', 2), task('d', 3)];

  // 입력이 수상할 때 조용히 원본을 돌려주는 것이 계약이다.
  // 여기서 새 배열을 만들면 호출부가 저장을 시도해 멀쩡한 순서를 덮어쓴다.
  it('재정렬할 항목이 2개 미만이면 원본 그대로', () => {
    expect(reorderTaskSubset(list, [])).toBe(list);
    expect(reorderTaskSubset(list, ['a'])).toBe(list);
  });

  it('orderedIds에 중복이 있으면 원본 그대로', () => {
    expect(reorderTaskSubset(list, ['a', 'a'])).toBe(list);
  });

  it('목록에 없는 id가 섞이면 원본 그대로', () => {
    expect(reorderTaskSubset(list, ['a', 'zzz'])).toBe(list);
  });

  it('순서가 이미 같으면 원본 그대로', () => {
    expect(reorderTaskSubset(list, ['a', 'c'])).toBe(list);
  });

  it('선택한 항목만 자리를 바꾸고 나머지는 제자리를 지킨다', () => {
    const next = reorderTaskSubset(list, ['c', 'a']);
    expect(next.map(t => t.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('sort_order를 전체 목록의 위치로 다시 매긴다', () => {
    const next = reorderTaskSubset(list, ['c', 'a']);
    expect(next.map(t => t.sort_order)).toEqual([0, 1, 2, 3]);
  });

  it('비선택 항목의 sort_order가 어긋나 있으면 그것도 바로잡는다', () => {
    const skewed = [task('a', 5), task('b', 9), task('c', 2)];
    const next = reorderTaskSubset(skewed, ['c', 'a']);
    expect(next.map(t => t.id)).toEqual(['c', 'b', 'a']);
    expect(next.map(t => t.sort_order)).toEqual([0, 1, 2]);
  });

  it('원본 배열을 변형하지 않는다', () => {
    const before = list.map(t => ({ id: t.id, sort_order: t.sort_order }));
    reorderTaskSubset(list, ['c', 'a']);
    expect(list.map(t => ({ id: t.id, sort_order: t.sort_order }))).toEqual(before);
  });
});
