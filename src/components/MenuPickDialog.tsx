import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs text-center">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-amber-600" /> 메뉴 추천
          </DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList className="grid w-full grid-cols-3">
            {Object.entries(TAB_LABELS).map(([k, v]) => (
              <TabsTrigger key={k} value={k}>{v.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="py-6">
          <p className="text-sm text-gray-400 mb-2">{TAB_LABELS[tab].title}</p>
          <p className={`text-3xl font-bold ${rolling ? 'text-amber-400' : 'text-gray-800'}`}>
            {pick || '🎲'}
          </p>
        </div>
        <Button onClick={roll} disabled={rolling} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
          <Dices className="w-4 h-4 mr-1" />
          {pick ? '다시 뽑기' : '뽑기!'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
