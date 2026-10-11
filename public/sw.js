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
      // 알림을 누르면 열 화면 (예: 공지 → /feed, 주간 회고 → /retro)
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          // 열려 있는 앱이 있으면 그 창에서 해당 화면으로 이동
          if (url !== '/' && 'navigate' in c) return c.navigate(url).then((w) => (w || c).focus());
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
