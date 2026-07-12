export type StatusPreset =
  | '출근'
  | '집중 중'
  | '업무 중'
  | '휴식 중'
  | '자리 비움'
  | '스터디/회의 중'
  | '퇴근';

export interface Profile {
  id: string;
  nickname: string;
  avatar_url: string | null;
  work_start: string | null; // 근무 시작 시간 "HH:MM:SS" (미출근 알림용)
  created_at: string;
}

export interface Office {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
}

export interface OfficeMember {
  id: string;
  office_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  profiles?: Profile;
}

export interface WorkSession {
  id: string;
  office_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface StatusSession {
  id: string;
  office_id: string;
  user_id: string;
  status: StatusPreset;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  office_id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'normal' | 'high';
  due_date: string | null;
  week_start: string;
  sort_order: number;
  completed_at: string | null;
  routine_id: string | null; // 루틴에서 자동 생성된 할 일이면 원본 루틴 id
  created_at: string;
}

export interface Routine {
  id: string;
  office_id: string;
  user_id: string;
  title: string;
  category: string | null;
  priority: 'low' | 'normal' | 'high';
  created_at: string;
}

export interface FocusSession {
  id: string;
  office_id: string;
  user_id: string;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface MemberStatus {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  current_status: StatusPreset;
  status_started_at: string;
  is_working: boolean;
  focus_task_title: string | null; // 지금 집중 중인 업무 제목 (자유 집중이면 null)
  is_focusing: boolean;
}