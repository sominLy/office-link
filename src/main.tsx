import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prerendered blog pages are served as pure static HTML for SEO.
// Intentionally skip React mounting so the crawler-facing markup stays
// lightweight and self-contained — no client-side hydration needed.
const isPrerenderedBlog =
  document
    .querySelector('meta[name="prerender-static-page"]')
    ?.getAttribute('content') === 'blog';

if (!isPrerenderedBlog) {
  createRoot(document.getElementById('root')!).render(<App />);
}
