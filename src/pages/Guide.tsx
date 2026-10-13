import { ActionButton } from '@/seed/ui/action-button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, BookOpenText, Share, PlusSquare, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '@/components/BottomNav';

import { Icon } from '@seed-design/react';
// 연결오피스 200% 활용 공략집 + 아이폰/안드로이드 앱 설치 가이드
const TIPS: { emoji: string; title: string; body: string }[] = [
  { emoji: '🌅', title: '하루의 시작은 출근 버튼', body: '출근하면 멤버들에게 알림이 가고 소식 탭에 기록돼요. "나 시작했다!"는 선언이 최고의 동기부여예요.' },
  { emoji: '👋', title: '출근한 친구에게 인사부터', body: '멤버 카드를 눌러 👋 🙌 ☕ 💛 인사를 보내보세요. 상대에게 푸시가 가고 소식 탭에도 남아요. 아침 인사 문화 만들기!' },
  { emoji: '🎯', title: '집중 타이머는 꼭 업무를 골라서', body: '업무를 선택하고 집중을 시작하면 멤버 카드에 "🎯 자소서 쓰기 집중 중"이 뜨고, 그 할 일은 자동으로 "진행 중"이 돼요. 집중을 끝낼 때 "완료로 표시"를 누르면 바로 체크까지!' },
  { emoji: '⚡', title: '할 일은 한 줄로 바로', body: '할 일 탭이나 홈 카드 입력칸에 적고 Enter만 누르면 끝. 📅 칩으로 오늘·내일·모레를 고르고, 마감이 지난 할 일은 빨간 배너에서 한 번에 정리해요. 실수로 지워도 "되돌리기"가 있어요.' },
  { emoji: '🔁', title: '매주 반복되는 건 루틴으로', body: '할 일 탭의 루틴 버튼에 "영어 단어 50개" 같은 걸 등록하면 매주 자동으로 추가돼요. 매주 다시 입력할 필요 없어요.' },
  { emoji: '📅', title: '캘린더로 미리 심어두기', body: '할 일 캘린더 탭에서 미래 날짜를 눌러 "이 날짜에 추가"하면 마감일이 자동 설정돼요. 서류 마감일 관리에 딱!' },
  { emoji: '🔒', title: '부끄러운 할 일은 비공개로', body: '할 일 추가할 때 비공개를 체크하면 나만 볼 수 있어요. "이력서 사진 다시 찍기" 같은 건 몰래 해치우기.' },
  { emoji: '👍', title: '응원은 아끼지 말기', body: '친구 카드 → 할 일 옆 👍🔥💪를 눌러주세요. 상대에게 푸시가 가요. 응원 받은 할 일은 이상하게 꼭 하게 돼요.' },
  { emoji: '💌', title: '소식 탭으로 칭찬 릴레이', body: '소식 탭에서 특정 멤버를 골라 칭찬을 남기면 그 사람에게만 푸시가 가요. 매주 금요일 칭찬 릴레이 어때요?' },
  { emoji: '⏰', title: '근무 시간 알림 설정', body: '내 계정에서 근무 시작 시간을 정해두면, 그 시간이 지나도 출근 안 했을 때 "오늘 일 안 하나요? 👀" 푸시가 와요. 강제 기상 장치!' },
  { emoji: '🎲', title: '메뉴 고민은 3초 컷', body: '홈 상단 포크 버튼 → 점메추/저메추/야메추 룰렛을 돌리세요. 나온 메뉴에 토 달기 없기!' },
  { emoji: '📚', title: '인적성은 같이 풀어야 덜 지루해요', body: '홈의 "같이 공부하기"에서 스터디룸을 열고 줌·구글밋 링크를 붙여 두세요. 멤버들에게 푸시가 가고, 누가 들어와 있는지 홈에서 실시간으로 보여요. 참여하면 상태가 "스터디/회의 중"으로 바뀌고, 시간을 정해 두면 그때 모이는 방도 만들 수 있어요.' },
  { emoji: '🏷', title: '호칭 놀이로 분위기 전환', body: '방장은 오피스 이름 클릭 → 호칭 설정에서 직급제를 켜보세요. 먼저 들어온 순서대로 사장, 부사장... 갑자기 회사 놀이가 시작돼요.' },
  { emoji: '📬', title: '매주 회고와 상장 받기', body: '정한 요일·시간(기본 월요일 오전 7시)이 되면 지난 한 주 기록과 상장이 도착해요. 상장은 매주 다른 디자인! 회고를 열면 칭찬 스티커가 진열장에 쌓이고, 쌓인 만큼 트로피가 열려요.' },
  { emoji: '📊', title: '금요일엔 리포트 확인', body: '리포트 탭에서 이번 주 출근 일수, 총 집중시간, 요일별 그래프를 볼 수 있어요. 주간 회고에 캡처해서 쓰면 딱이에요.' },
];

const IPHONE_STEPS = [
  { step: '1', text: '사파리(Safari)로 연결오피스에 접속해요', icon: Smartphone },
  { step: '2', text: '하단 가운데 공유 버튼(⬆️ 네모에 화살표)을 눌러요', icon: Share },
  { step: '3', text: '메뉴에서 "홈 화면에 추가"를 찾아 눌러요', icon: PlusSquare },
  { step: '4', text: '오른쪽 위 "추가" → 홈 화면에 연결오피스 아이콘 완성!', icon: null },
];

export default function Guide() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-10 border-b border-stroke-neutral-subtle">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <ActionButton variant="ghost" layout="iconOnly" aria-label="뒤로" onClick={() => navigate(-1)}>
              <Icon svg={<ArrowLeft className="w-4 h-4" />} />
            </ActionButton>
          <h1 className="font-bold text-fg-neutral flex items-center gap-1.5">
            <BookOpenText className="w-4 h-4 text-fg-brand" /> 200% 활용 공략집
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4">
        {/* 아이폰 앱 설치 */}
        <Card className="p-5 border-stroke-brand-weak bg-bg-brand-weak">
          <h2 className="font-semibold text-fg-neutral mb-1 flex items-center gap-1.5">
            📱 앱처럼 설치하기 (강력 추천!)
          </h2>
          <p className="text-t2 text-fg-neutral-muted mb-3">
            홈 화면에 추가하면 진짜 앱처럼 아이콘으로 실행돼요.
            특히 <b>아이폰은 이렇게 해야 푸시 알림을 받을 수 있어요!</b>
          </p>
          <div className="space-y-2">
            <p className="text-t4 font-medium text-fg-neutral-muted">🍎 아이폰 (Safari)</p>
            <ol className="space-y-1.5">
              {IPHONE_STEPS.map(s => (
                <li key={s.step} className="flex items-center gap-2 text-t4 text-fg-neutral-muted bg-white/70 rounded-lg px-3 py-2">
                  <span className="w-5 h-5 rounded-full bg-bg-brand-solid text-white text-t2 flex items-center justify-center flex-shrink-0">{s.step}</span>
                  {s.text}
                  {s.icon && <s.icon className="w-4 h-4 text-fg-brand ml-auto flex-shrink-0" />}
                </li>
              ))}
            </ol>
            <p className="text-t2 text-fg-brand bg-bg-brand-weak rounded-lg p-2">
              💡 설치 후엔 <b>홈 화면 아이콘으로 실행</b>해서 홈의 종(🔔) 버튼으로 알림을 허용하세요. 그래야 아이폰에서도 푸시가 와요!
            </p>
            <p className="text-t4 font-medium text-fg-neutral-muted pt-1">🤖 안드로이드 (크롬)</p>
            <p className="text-t4 text-fg-neutral-muted bg-white/70 rounded-lg px-3 py-2">
              오른쪽 위 ⋮ 메뉴 → <b>"홈 화면에 추가"</b> (또는 "앱 설치") 한 번이면 끝! 알림은 그냥 허용만 하면 돼요.
            </p>
          </div>
        </Card>

        {/* 공략 팁 */}
        <div className="space-y-2">
          <h2 className="text-t4 font-medium text-fg-neutral-muted px-1">🏆 고인물처럼 쓰는 법 {TIPS.length}가지</h2>
          {TIPS.map((tip, i) => (
            <Card key={i} className="p-4 border-stroke-neutral-subtle">
              <p className="text-t4 font-semibold text-fg-neutral mb-1">{tip.emoji} {tip.title}</p>
              <p className="text-t4 text-fg-neutral-muted leading-relaxed">{tip.body}</p>
            </Card>
          ))}
        </div>

        <p className="text-center text-t2 text-fg-neutral-muted pt-2">
          더 궁금한 건 소식 탭에 남겨주세요! 🐥
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
