import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { track } from '@/lib/funnel';
import { trackAnonVisitOnce } from '@/lib/analytics';
import { ActionButton } from '@/seed/ui/action-button';

/**
 * 로그인하지 않은 방문자가 보는 첫 화면.
 * 예전에는 주소를 열면 바로 로그인 폼이 떴다. 무슨 서비스인지 모르는 채로 가입 여부를
 * 정해야 해서, 유입을 받아도 가입으로 이어질 근거가 화면에 없었다.
 */
const POINTS = [
  {
    emoji: '🔔',
    title: '출근하면 멤버들에게 알림이 가요',
    body: '혼자 책상에 앉는 대신 같이 시작해요. 누가 먼저 와 있는지도 보여요.',
  },
  {
    emoji: '👀',
    title: '지금 누가 집중하고 누가 쉬는지 보여요',
    body: '상태를 바꾸면 서로 방해하지 않고 속도를 맞출 수 있어요.',
  },
  {
    emoji: '📬',
    title: '한 주가 끝나면 기록을 모아서 보내요',
    body: '출근한 날, 집중한 시간, 해낸 할 일을 월요일 아침에 정리해서 보내요.',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  // 유입 → 가입 전환의 분모. trackAnonVisitOnce는 하루 1번 방문 집계,
  // track은 전환 계산용 이벤트 원본이라 둘 다 보낸다.
  useEffect(() => {
    void trackAnonVisitOnce();
    track('landing_view');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-[32rem] px-x5 pt-x12 pb-x16">
        <header className="text-center">
          <div className="mx-auto mb-x5 grid h-x14 w-x14 place-items-center rounded-r4 bg-bg-brand-weak">
            <span className="text-t12" aria-hidden="true">🏢</span>
          </div>
          <h1 className="text-t9 font-bold leading-snug text-fg-neutral [word-break:keep-all]">
            같이 출근하고, 서로 뭘 하는지 보이는 가상 오피스
          </h1>
          <p className="mt-x3 text-t4 leading-relaxed text-fg-neutral-muted [word-break:keep-all]">
            혼자 일하면 오늘 뭘 했는지도 흐려져요. 연결오피스는 출근과 집중, 할 일을 한 화면에 두고
            같은 오피스 사람들에게 보이게 해요.
          </p>
        </header>

        <ul className="mt-x10 flex flex-col gap-x3">
          {POINTS.map((p) => (
            <li key={p.title} className="rounded-r3 bg-bg-layer-default p-x5">
              <p className="text-t6" aria-hidden="true">{p.emoji}</p>
              <h2 className="mt-x2 text-t5 font-bold text-fg-neutral [word-break:keep-all]">{p.title}</h2>
              <p className="mt-x1 text-t4 leading-relaxed text-fg-neutral-muted [word-break:keep-all]">{p.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-x10 flex flex-col gap-x3">
          <ActionButton
            variant="brandSolid"
            size="large"
            className="w-full"
            onClick={() => navigate('/login?mode=register')}
          >
            시작하기
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="medium"
            className="w-full"
            onClick={() => navigate('/login')}
          >
            로그인
          </ActionButton>
        </div>

        <p className="mt-x8 text-center text-t2 leading-relaxed text-fg-neutral-muted [word-break:keep-all]">
          이메일과 비밀번호로 가입해요. 같은 오피스 사람들에게는 닉네임, 프로필 사진, 상태, 출근과 집중 시간, 할 일, 소식 글이 보여요.
          할 일은 하나씩 비공개로 바꿀 수 있어요.
        </p>
        <p className="mt-x3 text-center text-t2 text-fg-neutral-muted">
          <Link to="/terms" className="underline underline-offset-2">이용약관</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/privacy" className="underline underline-offset-2">개인정보 처리방침</Link>
        </p>
      </main>
    </div>
  );
}
