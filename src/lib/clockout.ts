import { kstNowHM, kstToday } from '@/lib/dates';

// 예상 퇴근 알림 설정. Home의 백그라운드 타이머가 30초마다 읽어 "지금 ≥ 예상 시각"이면 하루 한 번 울린다.
export const CLOCKOUT_KEY = 'clockout_target'; // "HH:MM" (오늘 기준)

/** 오늘 이미 울렸는지 표시하는 키. 날짜가 붙어 있어 다음 날에는 다시 울린다. */
export const clockoutFiredKey = () => `clockout_fired-${kstToday()}`;

/** 아직 오지 않은 시각인지. 이미 지난 시각을 걸면 타이머가 바로 울린다. */
export function isUpcomingHM(hm: string): boolean {
  return !!hm && hm > kstNowHM();
}

/**
 * 퇴근 알림을 건다. 비었거나 이미 지난 시각이면 걸지 않고 기존 알림도 지운 뒤 false.
 * 걸 때는 오늘 울렸다는 표시도 지운다 — 남아 있으면 오늘 울린 뒤 고른 새 시각이 안 울린다.
 */
export function armClockout(hm: string): boolean {
  if (!isUpcomingHM(hm)) {
    localStorage.removeItem(CLOCKOUT_KEY);
    return false;
  }
  localStorage.setItem(CLOCKOUT_KEY, hm);
  localStorage.removeItem(clockoutFiredKey());
  return true;
}
