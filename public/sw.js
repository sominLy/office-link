// 웹푸시 서비스워커: 브라우저가 닫혀 있어도 푸시를 받아 알림을 띄운다
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch { /* noop */ }
  event.waitUntil(
    self.registration.showNotification(data.title || '연결오피스', {
      body: data.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      // 같은 tag의 알림은 쌓이지 않고 하나로 갱신 → 알림함이 깔끔해지고 스팸 오탐 감소
      tag: data.tag || 'office-link',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});
