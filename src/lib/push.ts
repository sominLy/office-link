import { supabase } from './supabase';

// VAPID 공개키 — 공개되어도 안전한 값 (비밀키는 서버에만 있음)
const VAPID_PUBLIC_KEY = 'BIGtkUuMsh7jK7No0EqNIcYNZ8BCp3RZgTrEdFG8xBmo2ltNvl8xPpKbfLUGU6G7Vv2qqFOuiMEnO3iOhMi3N2k';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/** 서비스워커 등록 + 푸시 구독 + 서버 저장. 성공 여부 반환 */
export async function subscribePush(userId: string): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys) return false;
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: 'endpoint' },
    );
    return !error;
  } catch {
    return false;
  }
}
