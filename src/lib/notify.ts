// 브라우저 알림 유틸 — 사이트가 브라우저에 열려 있는 동안 동작한다

export function notificationsSupported(): boolean {
  return 'Notification' in window;
}

export function notificationsEnabled(): boolean {
  return notificationsSupported() && Notification.permission === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

const MUTE_KEY = 'notifications_muted';

/** 사용자가 앱에서 알림을 껐는지 (브라우저 권한과 별개) */
export function isMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === '1';
}

export function setMuted(muted: boolean) {
  if (muted) localStorage.setItem(MUTE_KEY, '1');
  else localStorage.removeItem(MUTE_KEY);
}

export function notify(title: string, body: string) {
  if (!notificationsEnabled() || isMuted()) return;
  try {
    new Notification(title, { body, icon: '/favicon.svg' });
  } catch {
    // 일부 모바일 브라우저는 페이지 컨텍스트의 Notification 생성을 막는다 — 조용히 무시
  }
}
