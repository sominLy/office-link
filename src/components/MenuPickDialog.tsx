import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { ActionButton } from '@/seed/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from '@/seed/ui/segmented-control';
import { PrefixIcon } from '@seed-design/react';
import { UtensilsCrossed, Dices } from 'lucide-react';

const MENUS: Record<string, string[]> = {
  lunch: ['김치찌개', '제육볶음', '돈까스', '국밥', '칼국수', '파스타', '샐러드', '마라탕', '쌀국수', '냉면', '비빔밥', '샌드위치', '초밥', '라멘', '부대찌개', '카레', '김밥+라면', '순두부찌개', '햄버거', '분식 세트'],
  dinner: ['삼겹살', '치킨', '피자', '곱창', '족발', '회', '떡볶이', '감자탕', '닭갈비', '파스타', '수제버거', '훠궈', '보쌈', '순대국', '양꼬치', '스테이크', '초밥', '쭈꾸미볶음'],
  latenight: ['라면', '치킨', '떡볶이', '편의점 디저트', '붕어빵', '아이스크림', '만두', '피자', '곱창', '닭발', '컵라면+삼각김밥', '치즈볼', '물 한잔 마시고 자기 😇'],
};

const TAB_LABELS: Record<string, { label: string; title: string }> = {
  lunch: { label: '점메추', title: '오늘 점심은...' },
  dinner: { label: '저메추', title: '오늘 저녁은...' },
  latenight: { label: '야메추', title: '오늘 야식은...' },
};

export default function MenuPickDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState('lunch');
  const [pick, setPick] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  const roll = () => {
    if (rolling) return;
    setRolling(true);
    const list = MENUS[tab];
    // 두구두구 효과: 빠르게 몇 번 바뀌다가 멈춤
    let count = 0;
    const timer = setInterval(() => {
      setPick(list[Math.floor(Math.random() * list.length)]);
      count++;
      if (count >= 10) {
        clearInterval(timer);
        setRolling(false);
      }
    }, 80);
  };

  const changeTab = (t: string) => {
    setTab(t);
    setPick(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} headerAlign="center">
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-x2 text-center">
            <UtensilsCrossed className="w-5 h-5 text-fg-brand" /> 메뉴 추천
          </DialogTitle>
        </DialogHeader>
        <SegmentedControl aria-label="끼니" value={tab} onValueChange={changeTab}>
          {Object.entries(TAB_LABELS).map(([k, v]) => (
            // SEED 기본 높이(34px)는 터치 영역 40px에 못 미쳐 올린다(클래스는 SEED CSS에 질 수 있어 style)
            <SegmentedControlItem key={k} value={k} style={{ minHeight: 'var(--seed-dimension-x10)' }}>{v.label}</SegmentedControlItem>
          ))}
        </SegmentedControl>
        {/* 뽑기 결과 자리. 굴리는 동안은 브랜드색으로 바뀌며 돌아간다 */}
        <div className="flex flex-col items-center gap-x2 rounded-r3 bg-bg-neutral-weak px-x4 py-x8 text-center">
          <p className="t4-regular text-fg-neutral-muted">{TAB_LABELS[tab].title}</p>
          <p className={`t11-bold ${rolling ? 'text-fg-brand' : 'text-fg-neutral'}`}>
            {pick || '🎲'}
          </p>
        </div>
        <DialogFooter>
          <ActionButton size="large" variant="brandSolid" onClick={roll} disabled={rolling} className="w-full">
            <PrefixIcon svg={<Dices />} />
            {pick ? '다시 뽑기' : '뽑기'}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
