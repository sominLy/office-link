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
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-sm border-t border-amber-100 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-5xl mx-auto grid grid-cols-5">
        {TABS.map(({ path, label, icon: Icon }) => {
          const active = pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
                active ? 'text-amber-600 font-semibold' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
