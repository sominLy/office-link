import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ListTodo, MessageCircleHeart, BarChart3, User } from 'lucide-react';

const TABS = [
  { path: '/', label: '홈', icon: Home },
  { path: '/tasks', label: '할 일', icon: ListTodo },
  { path: '/feed', label: '소식', icon: MessageCircleHeart },
  { path: '/report', label: '리포트', icon: BarChart3 },
  { path: '/profile', label: '내 계정', icon: User },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="주요 메뉴"
      // 콘텐츠 위에 떠 있는 Global 레이어라 경계는 중립 구분선으로 둔다.
      // safe-area는 SEED 변수를 쓴다 — constant()/env() 지원 분기를 base.css가 들고 있다.
      className="glass fixed bottom-0 left-0 right-0 z-20 border-t border-stroke-neutral-subtle pb-[var(--seed-safe-area-bottom)]"
    >
      <div className="max-w-5xl mx-auto grid grid-cols-5 px-x1_5 pt-x1_5 pb-x0_5">
        {TABS.map(({ path, label, icon: Icon }) => {
          const active = pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-x0_5 rounded-r3 py-x1_5 transition-colors ${
                active
                  ? 't1-bold text-fg-brand bg-bg-brand-weak'
                  : 't1-regular text-fg-neutral-muted hover:text-fg-neutral'
              }`}
            >
              <Icon
                aria-hidden="true"
                className={`w-x5 h-x5 transition-transform ${active ? 'stroke-[2.5] -translate-y-px scale-105' : ''}`}
              />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
