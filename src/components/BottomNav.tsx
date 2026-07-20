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
    <nav className="glass fixed bottom-0 left-0 right-0 z-20 border-t border-amber-100/70 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-5xl mx-auto grid grid-cols-5 px-1.5 pt-1.5 pb-0.5">
        {TABS.map(({ path, label, icon: Icon }) => {
          const active = pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] transition-colors ${
                active ? 'text-amber-700 font-semibold bg-amber-50' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform ${active ? 'stroke-[2.5] -translate-y-px scale-105' : ''}`} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
