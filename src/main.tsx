import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadRuntimeConfig } from './lib/config.ts';

// Load runtime configuration before rendering the app
async function initializeApp() {
  // Prerendered blog pages are served as pure static HTML for SEO.
  // Intentionally skip React mounting so the crawler-facing markup stays
  // lightweight and self-contained — no client-side hydration needed.
  if (
    document
      .querySelector('meta[name="prerender-static-page"]')
      ?.getAttribute('content') === 'blog'
  ) {
    return;
  }

  try {
    await loadRuntimeConfig();
    console.log('Runtime configuration loaded successfully');
  } catch (error) {
    console.warn(
      'Failed to load runtime configuration, using defaults:',
      error
    );
  }

  // Render the app
  createRoot(document.getElementById('root')!).render(<App />);
}

// 새 버전이 배포된 뒤 오래 켜 둔 앱에서 아직 안 받은 화면(운영 대시보드 등)을 열면 옛 파일이 없어 실패한다 → 한 번 새로고침
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'office-link:reloaded-for-chunk';
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
  } catch {
    // 저장소를 못 쓰면 그냥 새로고침
  }
  event.preventDefault();
  window.location.reload();
});

// Initialize the app
initializeApp();
