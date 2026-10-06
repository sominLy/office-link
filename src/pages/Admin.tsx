import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { addDays, kstToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BarList, ChartCard, ColumnChart, DataTable, TrendChart } from '@/components/admin/charts';
import { BLUE_RAMP, fmt, longDay, Marker, shortDay } from '@/components/admin/format';

// ===== 서버(admin_dashboard)가 돌려주는 모양 =====
type Daily = {
  day: string; dau: number; doers: number; visitors: number; anon_visitors: number; signups: number;
  clock_ins: number; work_min: number; tasks_created: number; tasks_done: number; focus_sessions: number; focus_min: number;
  chat: number; dm: number; feed_posts: number; reactions: number; retro_writes: number; active_min: number; visible_min: number;
};
type Kpi = {
  users_total: number; signups: number; signups_prev: number; active: number; active_prev: number;
  dau_avg: number; dau_avg_prev: number; wau: number; mau: number; visitors: number; visitors_prev: number;
  anon_visitors: number; anon_visitors_prev: number; active_min_per_visit_day: number | null;
  clock_ins: number; clock_ins_prev: number; tasks_done: number; tasks_done_prev: number; tasks_created: number;
  offices_total: number; offices_active_7d: number; together_week: number; together_prev_week: number; push_users: number;
};
type Weekly = { week: string; wau: number; active_offices: number; together_offices: number; signups: number };
type Office = { id: string; name: string; created: string; members: number; active_7d: number; clock_days_week: number; together: boolean; last_active: string | null };
type Dashboard = {
  generated_at: string; today: string; from: string; to: string; week: string; cohort: 'all' | 'seed' | 'new'; launch_day: string | null;
  tracking_since: string | null; anon_since: string | null; chat_since: string | null;
  kpi: Kpi; daily: Daily[]; weekly: Weekly[];
  features: { key: string; users: number; events: number }[];
  pages: { path: string; views: number; users: number; active_min: number }[];
  hours: { hour: number; clock_ins: number }[];
  funnel: { key: string; users: number; eligible?: number }[];
  retention: { week: string; size: number; rates: (number | null)[] }[];
  offices: Office[];
  markers: Marker[];
  sources: { visits: { source: string; n: number }[]; signups: { source: string; n: number }[]; signups_unknown: number };
  platform: { standalone: number; browser: number };
};

type Range = 'today' | '7' | '30' | '90' | 'all';
type Cohort = 'all' | 'seed' | 'new';

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: '오늘' }, { key: '7', label: '7일' }, { key: '30', label: '30일' }, { key: '90', label: '90일' }, { key: 'all', label: '전체' },
];

const FEATURE_LABELS: Record<string, string> = {
  visit: '앱 방문', clock_in: '출근', task_create: '할 일 추가', task_done: '할 일 완료', focus: '집중 타이머',
  status: '상태 바꾸기', feed_post: '소식 글', wave: '인사 👋', chat: '단체 채팅', dm: '1:1 채팅', reaction: '응원 이모지',
  retro_write: '회고 작성', sticker: '칭찬 스티커 받음', routine: '루틴 추가', office_join: '오피스 참여', push_on: '알림 켜기',
};
const PAGE_LABELS: Record<string, string> = {
  '/': '홈', '/tasks': '할 일', '/feed': '소식·채팅', '/report': '리포트', '/profile': '내 정보', '/retro': '주간 회고',
  '/trophies': '진열장', '/guide': '공략집', '/clock-out': '퇴근', '/office-setup': '오피스 설정', '/admin': '운영 대시보드', other: '기타',
};
const FUNNEL_LABELS: Record<string, string> = {
  signup: '가입', profile: '프로필 만듦', office: '오피스 참여', clock_in: '첫 출근', activated: '첫 주 2일+ 출근', week2: '둘째 주에도 사용',
};
const SOURCE_LABELS: Record<string, string> = { direct: '직접 방문·알 수 없음' };

type ActivityMetric = { key: keyof Daily; name: string; unit: string; scale?: number };
const ACTIVITY: ActivityMetric[] = [
  { key: 'clock_ins', name: '출근 횟수', unit: '회' },
  { key: 'work_min', name: '출근 시간 합', unit: '시간', scale: 1 / 60 },
  { key: 'tasks_done', name: '할 일 완료', unit: '개' },
  { key: 'tasks_created', name: '할 일 추가', unit: '개' },
  { key: 'focus_min', name: '집중 시간', unit: '분' },
  { key: 'chat', name: '단체 채팅', unit: '개' },
  { key: 'dm', name: '1:1 채팅', unit: '개' },
  { key: 'feed_posts', name: '소식 글', unit: '개' },
  { key: 'retro_writes', name: '회고 작성', unit: '개' },
  { key: 'active_min', name: '앱 조작 시간', unit: '분' },
];

const COMPARE: { key: keyof Daily; name: string }[] = [
  { key: 'dau', name: '활성 사용자' },
  { key: 'clock_ins', name: '출근' },
  { key: 'tasks_done', name: '할 일 완료' },
  { key: 'focus_min', name: '집중(분)' },
];

type Problem = 'missing' | 'forbidden' | 'error' | null;

function missingFn(err: { code?: string; message?: string } | null) {
  return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message || ''));
}

/** 지난 기간 대비 변화 — 위·아래 화살표와 글자로 (색만으로 구분하지 않게) */
function Delta({ now, prev, label = '지난 기간 대비' }: { now: number; prev: number | null | undefined; label?: string }) {
  if (prev == null) return null;
  if (prev === 0 && now === 0) return <span className="text-[11px] text-[#898781]">변화 없음</span>;
  if (prev === 0) return <span className="text-[11px] text-[#006300]">▲ 새로 생김 <span className="text-[#898781]">· {label}</span></span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return <span className="text-[11px] text-[#898781]">변화 없음 · {label}</span>;
  return (
    <span className={cn('text-[11px]', pct > 0 ? 'text-[#006300]' : 'text-[#d03b3b]')}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% <span className="text-[#898781]">· {label}</span>
    </span>
  );
}

function Stat({ label, value, sub, delta, hint }: { label: string; value: string; sub?: string; delta?: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-[#fcfcfb] p-3" title={hint}>
      <p className="text-xs text-[#52514e]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#0b0b0b] leading-tight">
        {value}{sub && <span className="text-sm font-normal text-[#52514e]"> {sub}</span>}
      </p>
      <div className="mt-0.5 min-h-[1rem]">{delta}</div>
    </div>
  );
}

const avg = (rows: Daily[], key: keyof Daily) => (rows.length ? rows.reduce((s, r) => s + Number(r[key] || 0), 0) / rows.length : null);

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>('30');
  const [cohort, setCohort] = useState<Cohort>('all');
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [checked, setChecked] = useState(false);
  const [metric, setMetric] = useState<ActivityMetric>(ACTIVITY[0]);
  const [markerDay, setMarkerDay] = useState(kstToday());
  const [markerLabel, setMarkerLabel] = useState('');
  const [launchDay, setLaunchDay] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/', { replace: true });
  }, [authLoading, user, navigate]);

  // 위에 붙어 있는 머리말(제목+필터)에 입력칸이 가려지지 않게
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.scrollPaddingTop;
    root.style.scrollPaddingTop = '7.5rem';
    return () => { root.style.scrollPaddingTop = prev; };
  }, []);

  // 운영자인지 먼저 확인
  useEffect(() => {
    if (!user) return;
    supabase.rpc('is_app_admin').then(({ data: ok, error }) => {
      if (missingFn(error)) setProblem('missing');
      else if (error) setProblem('error');
      else if (!ok) setProblem('forbidden');
      setChecked(true);
    });
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const to = kstToday();
    const from = range === 'today' ? to : range === 'all' ? '2020-01-01' : addDays(to, -(Number(range) - 1));
    const { data: d, error } = await supabase.rpc('admin_dashboard', { p_from: from, p_to: to, p_cohort: cohort });
    if (missingFn(error)) setProblem('missing');
    else if (error?.code === '42501' || /forbidden/.test(error?.message || '')) setProblem('forbidden');
    else if (error) {
      toast.error('지표를 불러오지 못했어요: ' + error.message);
    } else {
      const dash = d as Dashboard;
      setData(dash);
      setLaunchDay(dash.launch_day || '');
    }
    setLoading(false);
  }, [user, range, cohort]);

  useEffect(() => {
    if (checked && !problem) load();
  }, [checked, problem, load]);

  // 차트는 최소 14일을 보여 준다 (오늘·7일만 고르면 선이 너무 짧아서)
  const chartRows = useMemo(() => {
    if (!data) return [];
    const chartFrom = data.from < addDays(data.to, -13) ? data.from : addDays(data.to, -13);
    return data.daily.filter(r => r.day >= chartFrom && r.day <= data.to);
  }, [data]);
  const rangeRows = useMemo(() => (data ? data.daily.filter(r => r.day >= data.from && r.day <= data.to) : []), [data]);
  const activityRows = useMemo(
    () => chartRows.map(r => ({ day: r.day, value: Math.round(Number(r[metric.key]) * (metric.scale ?? 1) * 10) / 10 })),
    [chartRows, metric],
  );

  // 업데이트·메모 전후 7일 비교
  const comparisons = useMemo(() => {
    if (!data) return [];
    const byDay = new Map(data.daily.map(r => [r.day, r]));
    const pick = (from: string, to: string) => {
      const out: Daily[] = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const r = byDay.get(d);
        if (r) out.push(r);
      }
      return out;
    };
    return [...data.markers].reverse().map(m => {
      const before = pick(addDays(m.day, -7), addDays(m.day, -1));
      const after = pick(m.day, addDays(m.day, 6) < data.today ? addDays(m.day, 6) : data.today);
      return { m, before, after, afterDays: after.length };
    }).filter(c => c.before.length > 0 || c.after.length > 0);
  }, [data]);

  const addMarker = async () => {
    if (!markerLabel.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_add_marker', { p_day: markerDay, p_label: markerLabel.trim() });
    setBusy(false);
    if (error) return toast.error('메모를 저장하지 못했어요: ' + error.message);
    setMarkerLabel('');
    toast.success('메모를 추가했어요');
    load();
  };
  const deleteMarker = async (id: string) => {
    const { error } = await supabase.rpc('admin_delete_marker', { p_id: id });
    if (error) return toast.error('지우지 못했어요: ' + error.message);
    load();
  };
  const saveLaunch = async (day: string | null) => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_launch_day', { p_day: day });
    setBusy(false);
    if (error) return toast.error('저장하지 못했어요: ' + error.message);
    toast.success(day ? `공개 시작일을 ${longDay(day)}로 정했어요` : '공개 시작일을 지웠어요');
    if (!day) setCohort('all');
    load();
  };

  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/profile'));

  // ===== 운영자가 아니거나 SQL을 아직 안 돌렸을 때 =====
  if (problem) {
    return (
      <div className="min-h-screen bg-[#f9f9f7] px-4 py-6">
        <div className="max-w-lg mx-auto space-y-4">
          <Button variant="ghost" size="sm" onClick={back}><ArrowLeft className="w-4 h-4 mr-1" />뒤로</Button>
          <div className="rounded-xl border border-black/10 bg-white p-5 space-y-3 text-sm text-[#0b0b0b]">
            {problem === 'missing' && (
              <>
                <h1 className="font-semibold">📊 대시보드를 켜려면 SQL을 한 번 실행해야 해요</h1>
                <p className="text-[#52514e]">Supabase 대시보드 → SQL Editor에서 <code>019_admin_dashboard.sql</code>을 실행한 뒤, 아래 줄로 본인을 운영자로 등록하세요.</p>
                <pre className="rounded-lg bg-[#f4f4f1] p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{`insert into public.app_admins (user_id)\nselect id from auth.users where email = '${user?.email ?? '내 이메일'}'\non conflict do nothing;`}</pre>
              </>
            )}
            {problem === 'forbidden' && (
              <>
                <h1 className="font-semibold">🔒 운영자만 볼 수 있어요</h1>
                <p className="text-[#52514e]">운영자라면 Supabase SQL Editor에서 이 줄을 한 번 실행하세요.</p>
                <pre className="rounded-lg bg-[#f4f4f1] p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{`insert into public.app_admins (user_id)\nselect id from auth.users where email = '${user?.email ?? '내 이메일'}'\non conflict do nothing;`}</pre>
              </>
            )}
            {problem === 'error' && <p>대시보드를 확인하지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
          </div>
        </div>
      </div>
    );
  }

  const k = data?.kpi;
  const prevLabel = range === 'today' ? '어제 대비' : '지난 기간 대비';
  const funnelTop = data?.funnel[0]?.users || 0;
  const week2 = data?.funnel.find(f => f.key === 'week2');
  // 이번 주가 며칠 지났는지 (월=1) — 덜 끝난 주를 지난주와 그대로 비교하면 '▼100%'처럼 보여서
  const weekDay = data ? Math.round((Date.parse(data.to) - Date.parse(data.week)) / 86_400_000) + 1 : 7;

  return (
    <div className="min-h-screen bg-[#f9f9f7] pb-16">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-[#f9f9f7]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={back} aria-label="뒤로"><ArrowLeft className="w-4 h-4" /></Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-[#0b0b0b] leading-tight">📊 운영 대시보드</h1>
            <p className="text-[11px] text-[#898781] leading-tight">
              {data ? `${shortDay(data.from)} ~ ${shortDay(data.to)} · ${new Date(data.generated_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준` : '불러오는 중…'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} aria-label="새로고침">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </Button>
        </div>
        {/* 필터: 기간이 먼저, 모든 차트에 같이 적용 */}
        <div className="max-w-5xl mx-auto px-4 pb-2.5 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-black/10 bg-white p-0.5" role="radiogroup" aria-label="기간">
            {RANGES.map(r => (
              <button key={r.key} type="button" role="radio" aria-checked={range === r.key} onClick={() => setRange(r.key)}
                className={cn('px-2.5 py-1 text-xs rounded-md', range === r.key ? 'bg-[#0b0b0b] text-white font-medium' : 'text-[#52514e] hover:bg-black/[0.04]')}>
                {r.label}
              </button>
            ))}
          </div>
          <select
            value={cohort}
            onChange={e => setCohort(e.target.value as Cohort)}
            disabled={!data?.launch_day}
            className="h-8 rounded-lg border border-black/10 bg-white px-2 text-xs text-[#0b0b0b] disabled:text-[#898781]"
            aria-label="사용자 묶음"
            title={data?.launch_day ? undefined : "'기록·메모' 탭에서 공개 시작일을 정하면 기존/새 사용자를 나눠 볼 수 있어요"}
          >
            <option value="all">전체 사용자</option>
            <option value="seed">기존 사용자 (공개 전 가입)</option>
            <option value="new">새 사용자 (공개 후 가입)</option>
          </select>
        </div>
      </header>

      <main className={cn('max-w-5xl mx-auto px-4 pt-4 space-y-4 transition-opacity', loading && data && 'opacity-60')}>
        {!data || !k ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-black/[0.04] animate-pulse" />)}
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-5 bg-black/[0.04] h-auto">
              {[['overview', '개요'], ['features', '기능'], ['retention', '유지율'], ['offices', '오피스'], ['notes', '업데이트']].map(([v, l]) => (
                <TabsTrigger key={v} value={v} className="text-xs sm:text-sm px-1">{l}</TabsTrigger>
              ))}
            </TabsList>

            {/* ===== 개요 ===== */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              <section className="rounded-xl border border-black/10 bg-[#fcfcfb] p-4 flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p className="text-xs text-[#52514e]">이번 주 함께 출근한 오피스 <span className="text-[#898781]">(북극성 지표)</span></p>
                  <p className="text-5xl font-semibold text-[#0b0b0b] leading-none mt-2">{fmt(k.together_week)}<span className="text-lg font-normal text-[#52514e]"> 개</span></p>
                </div>
                <div className="pb-1">
                  {weekDay < 7
                    ? <span className="text-[11px] text-[#52514e]">이번 주 {weekDay}일째 · 지난주 {fmt(k.together_prev_week)}개</span>
                    : <Delta now={k.together_week} prev={k.together_prev_week} label="지난주 대비" />}
                  <p className="text-[11px] text-[#898781] mt-0.5">2명 이상이 각자 3일 이상 출근한 오피스 · 주는 월요일 시작</p>
                </div>
              </section>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="활성 사용자" value={fmt(k.active)} sub="명" delta={<Delta now={k.active} prev={k.active_prev} label={prevLabel} />}
                  hint="기간 안에 앱을 열었거나 출근·할 일·채팅 등을 한 사람" />
                <Stat label="하루 평균 활성 (DAU)" value={fmt(k.dau_avg, 1)} sub="명" delta={<Delta now={k.dau_avg} prev={k.dau_avg_prev} label={prevLabel} />} />
                <Stat label="주간 · 월간 활성" value={`${fmt(k.wau)} · ${fmt(k.mau)}`} sub="명"
                  delta={<span className="text-[11px] text-[#898781]">DAU/MAU {k.mau ? Math.round((k.dau_avg / k.mau) * 100) : 0}%</span>}
                  hint="마지막 날 기준 최근 7일·30일" />
                <Stat label="신규 가입" value={fmt(k.signups)} sub="명" delta={<Delta now={k.signups} prev={k.signups_prev} label={prevLabel} />} />
                <Stat label="앱 방문자 (로그인)" value={fmt(k.visitors)} sub="명" delta={<Delta now={k.visitors} prev={k.visitors_prev} label={prevLabel} />}
                  hint="로그인한 상태로 앱을 연 사람 — 기록 시작 이후만" />
                <Stat label="로그인 전 방문자" value={fmt(k.anon_visitors)} sub="명" delta={<Delta now={k.anon_visitors} prev={k.anon_visitors_prev} label={prevLabel} />}
                  hint="로그인 화면을 본 기기 수 — 홍보 링크로 들어온 사람" />
                <Stat label="1인 하루 이용 시간" value={k.active_min_per_visit_day == null ? '—' : fmt(k.active_min_per_visit_day, 1)} sub="분"
                  delta={<span className="text-[11px] text-[#898781]">실제로 누르거나 스크롤한 시간</span>} />
                <Stat label="출근" value={fmt(k.clock_ins)} sub="회" delta={<Delta now={k.clock_ins} prev={k.clock_ins_prev} label={prevLabel} />} />
                <Stat label="할 일 완료" value={fmt(k.tasks_done)} sub="개" delta={<Delta now={k.tasks_done} prev={k.tasks_done_prev} label={prevLabel} />}
                  hint={`같은 기간 새로 추가한 할 일 ${fmt(k.tasks_created)}개`} />
                <Stat label="전체 가입자" value={fmt(k.users_total)} sub="명" />
                <Stat label="활성 오피스 (7일)" value={`${fmt(k.offices_active_7d)} / ${fmt(k.offices_total)}`} sub="개" />
                <Stat label="알림 켠 사람" value={fmt(k.push_users)} sub="명"
                  delta={<span className="text-[11px] text-[#898781]">전체의 {k.users_total ? Math.round((k.push_users / k.users_total) * 100) : 0}%</span>} />
              </div>

              <ChartCard
                title="일별 사람 수"
                subtitle="🚀 업데이트 공지 · 📌 내 메모 — 선 위에 올리면 내용이 보여요"
                table={<DataTable head={['날짜', '활성 사용자', '신규 가입', '로그인 전 방문']}
                  rows={[...chartRows].reverse().map(r => [longDay(r.day), fmt(r.dau), fmt(r.signups), fmt(r.anon_visitors)])} />}
              >
                <TrendChart data={chartRows} markers={data.markers}
                  series={[{ key: 'dau', name: '활성 사용자', unit: '명' }, { key: 'signups', name: '신규 가입', unit: '명' }, { key: 'anon_visitors', name: '로그인 전 방문', unit: '명' }]} />
              </ChartCard>

              <ChartCard
                title={`일별 ${metric.name}`}
                subtitle={metric.key === 'chat' || metric.key === 'dm'
                  ? `채팅은 7일 뒤 지워져서 개수는 ${data.chat_since ? shortDay(data.chat_since) : '대시보드 설치'}부터 쌓여요`
                  : metric.key === 'active_min' ? `이용 시간은 ${data.tracking_since ? shortDay(data.tracking_since) : '대시보드 설치'}부터 기록돼요` : undefined}
                table={<DataTable head={['날짜', `${metric.name} (${metric.unit})`]} rows={[...activityRows].reverse().map(r => [longDay(r.day), fmt(r.value, 1)])} />}
              >
                <div className="flex flex-wrap gap-1.5 mb-3" role="radiogroup" aria-label="볼 지표">
                  {ACTIVITY.map(m => (
                    <button key={m.key} type="button" role="radio" aria-checked={metric.key === m.key} onClick={() => setMetric(m)}
                      className={cn('px-2 py-1 rounded-full text-[11px] border', metric.key === m.key ? 'border-[#2a78d6] bg-[#2a78d6]/10 text-[#0b0b0b] font-medium' : 'border-black/10 text-[#52514e] hover:bg-black/[0.03]')}>
                      {m.name}
                    </button>
                  ))}
                </div>
                <TrendChart data={activityRows} markers={data.markers} series={[{ key: 'value', name: metric.name, unit: metric.unit }]} />
              </ChartCard>

              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard title="주별 함께 출근한 오피스" subtitle="최근 12주 · 진한 막대가 이번 주"
                  table={<DataTable head={['주 (월요일)', '오피스']} rows={[...data.weekly].reverse().map(w => [shortDay(w.week), fmt(w.together_offices)])} />}>
                  <ColumnChart data={data.weekly} xKey="week" yKey="together_offices" name="함께 출근한 오피스" unit="개" xFormat={shortDay} highlight={w => w.week === data.week} />
                </ChartCard>
                <ChartCard title="주간 활성 사용자 (WAU)" subtitle="최근 12주"
                  table={<DataTable head={['주 (월요일)', '활성 사용자', '활성 오피스', '신규 가입']} rows={[...data.weekly].reverse().map(w => [shortDay(w.week), fmt(w.wau), fmt(w.active_offices), fmt(w.signups)])} />}>
                  <ColumnChart data={data.weekly} xKey="week" yKey="wau" name="주간 활성 사용자" unit="명" xFormat={shortDay} highlight={w => w.week === data.week} />
                </ChartCard>
              </div>
            </TabsContent>

            {/* ===== 기능·화면 ===== */}
            <TabsContent value="features" className="space-y-4 mt-4">
              <ChartCard title="기능별로 써 본 사람" subtitle="기간 안에 한 번 이상 쓴 사람 수 · 오른쪽은 총 횟수"
                table={<DataTable head={['기능', '사람', '횟수']} rows={data.features.map(f => [FEATURE_LABELS[f.key] || f.key, fmt(f.users), fmt(f.events)])} />}>
                <BarList rows={data.features.map(f => ({ label: FEATURE_LABELS[f.key] || f.key, value: f.users, sub: `${fmt(f.events)}회` }))}
                  valueLabel={v => `${fmt(v)}명`} />
              </ChartCard>

              <ChartCard title="화면별 조회 · 이용 시간" subtitle={data.tracking_since ? `${shortDay(data.tracking_since)}부터 기록` : '대시보드를 켠 뒤부터 기록돼요'}>
                {data.pages.length === 0
                  ? <p className="text-xs text-[#898781] py-4 text-center">아직 기록이 없어요 — 사람들이 앱을 쓰면 쌓여요</p>
                  : <DataTable head={['화면', '조회', '본 사람', '조작 시간(분)']}
                      rows={data.pages.map(p => [PAGE_LABELS[p.path] || p.path, fmt(p.views), fmt(p.users), fmt(p.active_min)])} />}
              </ChartCard>

              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard title="출근 시각" subtitle="몇 시에 출근 버튼을 누르는지 (한국 시간)"
                  table={<DataTable head={['시', '출근']} rows={data.hours.map(h => [`${h.hour}시`, fmt(h.clock_ins)])} />}>
                  <ColumnChart data={data.hours} xKey="hour" yKey="clock_ins" name="출근" unit="회" xFormat={v => `${v}시`} />
                </ChartCard>
                <ChartCard title="앱으로 설치해서 쓰는 사람" subtitle="홈 화면에 추가한 앱이어야 iPhone 알림이 와요">
                  {data.platform.standalone + data.platform.browser === 0
                    ? <p className="text-xs text-[#898781] py-4 text-center">아직 기록이 없어요</p>
                    : <BarList rows={[{ label: '설치한 앱', value: data.platform.standalone }, { label: '브라우저', value: data.platform.browser }]} valueLabel={v => `${fmt(v)}명`} />}
                </ChartCard>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard title="로그인 전 방문 — 어디서 왔나" subtitle="홍보 링크에 ?utm_source=instagram 처럼 붙이면 구분돼요">
                  <BarList rows={data.sources.visits.map(s => ({ label: SOURCE_LABELS[s.source] || s.source, value: s.n }))} valueLabel={v => `${fmt(v)}명`} />
                </ChartCard>
                <ChartCard title="가입한 사람 — 어디서 왔나" subtitle={data.sources.signups_unknown ? `경로를 모르는 가입 ${fmt(data.sources.signups_unknown)}명 (기록 시작 전·앱 미접속)` : undefined}>
                  <BarList rows={data.sources.signups.map(s => ({ label: SOURCE_LABELS[s.source] || s.source, value: s.n }))} valueLabel={v => `${fmt(v)}명`} />
                </ChartCard>
              </div>
            </TabsContent>

            {/* ===== 가입·유지 ===== */}
            <TabsContent value="retention" className="space-y-4 mt-4">
              <ChartCard title="가입 후 어디까지 왔나" subtitle="기간 안에 가입한 사람 기준 · 앞 단계를 통과한 사람만 다음 단계에 셈"
                table={<DataTable head={['단계', '사람', '가입 대비']} rows={data.funnel.map(f => [FUNNEL_LABELS[f.key] || f.key, fmt(f.users), funnelTop ? `${Math.round((f.users / funnelTop) * 100)}%` : '—'])} />}>
                <BarList max={Math.max(1, funnelTop)} rows={data.funnel.map(f => ({
                  label: FUNNEL_LABELS[f.key] || f.key, value: f.users,
                  sub: f.key === 'week2' && !f.eligible ? '판단 전' : funnelTop ? `${Math.round((f.users / funnelTop) * 100)}%` : undefined,
                }))} valueLabel={v => `${fmt(v)}명`} />
                {week2 && week2.eligible != null && (
                  <p className="mt-3 text-[11px] text-[#898781]">
                    {week2.eligible > 0
                      ? `'둘째 주에도 사용'은 가입한 지 14일이 지난 ${fmt(week2.eligible)}명 중에서만 셀 수 있어요`
                      : "'둘째 주에도 사용'은 가입하고 14일이 지나야 알 수 있어요 — 아직 해당하는 사람이 없어요"}
                  </p>
                )}
              </ChartCard>

              <ChartCard title="가입 주차별 유지율" subtitle="그 주에 가입한 사람 중 n주 뒤에도 무언가를 한 사람 비율 · 진할수록 높음">
                {data.retention.length === 0 ? <p className="text-xs text-[#898781] py-4 text-center">최근 10주 안에 가입한 사람이 없어요</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-separate" style={{ borderSpacing: 2 }}>
                      <thead>
                        <tr>
                          <th className="text-left font-medium text-[#52514e] px-1 whitespace-nowrap">가입 주</th>
                          {Array.from({ length: 8 }).map((_, i) => <th key={i} className="font-medium text-[#52514e] px-1 whitespace-nowrap">{i === 0 ? '가입 주' : `${i}주 뒤`}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {data.retention.map(r => (
                          <tr key={r.week}>
                            <td className="px-1 py-1 whitespace-nowrap text-[#0b0b0b]">{shortDay(r.week)} <span className="text-[#898781]">({fmt(r.size)}명)</span></td>
                            {r.rates.map((rate, i) => {
                              if (rate == null) return <td key={i} />;
                              const idx = Math.round(rate * (BLUE_RAMP.length - 1));
                              return (
                                <td key={i} className="text-center rounded-[4px] py-1.5 tabular-nums min-w-[2.6rem]"
                                  style={{ background: BLUE_RAMP[idx], color: idx >= 7 ? '#ffffff' : '#0b0b0b' }}
                                  title={`${shortDay(r.week)} 가입 ${r.size}명 중 ${Math.round(rate * r.size)}명`}>
                                  {Math.round(rate * 100)}%
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>
            </TabsContent>

            {/* ===== 오피스 ===== */}
            <TabsContent value="offices" className="space-y-4 mt-4">
              <ChartCard title={`오피스 ${fmt(data.offices.length)}개`} subtitle="최근 7일에 활동한 멤버가 많은 순 · ✅ = 이번 주 함께 출근 조건 달성">
                <div className="overflow-x-auto">
                  <DataTable head={['오피스', '멤버', '7일 활동', '이번 주 출근일', '함께 출근', '마지막 활동', '만든 날']}
                    rows={data.offices.map(o => [o.name, fmt(o.members), fmt(o.active_7d), fmt(o.clock_days_week), o.together ? '✅' : '', o.last_active ? shortDay(o.last_active) : '—', shortDay(o.created)])} />
                </div>
              </ChartCard>
            </TabsContent>

            {/* ===== 업데이트·메모 ===== */}
            <TabsContent value="notes" className="space-y-4 mt-4">
              <ChartCard title="업데이트 전후 비교" subtitle="날짜 전 7일과 그날부터 7일의 하루 평균 · 다른 일(시험 기간, 홍보)도 함께 영향을 줘요">
                {comparisons.length === 0 ? <p className="text-xs text-[#898781] py-4 text-center">비교할 업데이트나 메모가 없어요</p> : (
                  <ul className="space-y-3 max-h-[36rem] overflow-auto pr-1">
                    {comparisons.map(({ m, before, after, afterDays }) => (
                      <li key={m.id} className="rounded-lg border border-black/5 bg-white p-3">
                        <p className="text-xs text-[#0b0b0b] flex gap-2 min-w-0">
                          <span className="text-[#898781] flex-shrink-0">{shortDay(m.day)}</span>
                          <span className="truncate" title={m.label}>{m.kind === 'release' ? '🚀' : '📌'} {m.label}</span>
                          {afterDays < 7 && <span className="text-[#898781] flex-shrink-0">· {afterDays}일째</span>}
                        </p>
                        <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
                          {COMPARE.map(c => {
                            const b = avg(before, c.key);
                            const a = avg(after, c.key);
                            const pct = a == null || b == null || b === 0 ? null : Math.round(((a - b) / b) * 100);
                            return (
                              <div key={c.key} className="min-w-0">
                                <dt className="text-[11px] text-[#52514e]">{c.name} <span className="text-[#898781]">(하루 평균)</span></dt>
                                <dd className="text-xs text-[#0b0b0b] tabular-nums whitespace-nowrap">
                                  {a == null || b == null ? '—' : <>{fmt(b, 1)} → <b>{fmt(a, 1)}</b></>}
                                  {pct != null && pct !== 0 && <span className={pct > 0 ? 'text-[#006300]' : 'text-[#d03b3b]'}> {pct > 0 ? '▲' : '▼'}{Math.abs(pct)}%</span>}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      </li>
                    ))}
                  </ul>
                )}
              </ChartCard>

              <div className="grid md:grid-cols-2 gap-4">
                <section className="min-w-0 rounded-xl border border-black/10 bg-[#fcfcfb] p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-[#0b0b0b]">📌 메모 추가</h3>
                  <p className="text-xs text-[#52514e]">'인스타 첫 게시물', '에타 홍보', '시험 기간' 같은 일을 적어 두면 차트에 표시되고 전후 비교에 나와요. 업데이트 공지(🚀)는 자동으로 들어가요.</p>
                  <div className="flex flex-wrap gap-2">
                    <Input type="date" value={markerDay} onChange={e => setMarkerDay(e.target.value)} className="w-[9.5rem] h-9 text-xs" max={kstToday()} aria-label="메모 날짜" />
                    <Input value={markerLabel} onChange={e => setMarkerLabel(e.target.value)} maxLength={60} placeholder="무슨 일이 있었나요?" className="h-9 text-xs flex-1 min-w-[10rem]"
                      aria-label="메모 내용" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addMarker(); }} />
                    <Button size="sm" className="h-9" onClick={addMarker} disabled={busy || !markerLabel.trim()}>추가</Button>
                  </div>
                  <ul className="divide-y divide-black/5 max-h-64 overflow-auto">
                    {[...data.markers].reverse().map(m => (
                      <li key={m.id} className="flex items-center gap-2 py-1.5 text-xs">
                        <span className="text-[#898781] w-10 flex-shrink-0">{shortDay(m.day)}</span>
                        <span className="flex-1 min-w-0 truncate text-[#0b0b0b]" title={m.label}>{m.kind === 'release' ? '🚀' : '📌'} {m.label}</span>
                        {m.kind === 'note' && (
                          <button type="button" onClick={() => deleteMarker(m.id)} className="text-[#898781] hover:text-[#d03b3b] p-1" aria-label="메모 지우기">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="min-w-0 rounded-xl border border-black/10 bg-[#fcfcfb] p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-[#0b0b0b]">🚪 공개 시작일</h3>
                  <p className="text-xs text-[#52514e]">이 날 전에 가입한 사람(친구들)은 '기존 사용자', 이후는 '새 사용자'로 나눠 볼 수 있어요. 친구들은 매일 쓰는 열성 사용자라 섞이면 숫자가 실제보다 좋아 보여요.</p>
                  <div className="flex flex-wrap gap-2">
                    <Input type="date" value={launchDay} onChange={e => setLaunchDay(e.target.value)} className="w-[9.5rem] h-9 text-xs" aria-label="공개 시작일" />
                    <Button size="sm" className="h-9" onClick={() => launchDay && saveLaunch(launchDay)} disabled={busy || !launchDay}>저장</Button>
                    {data.launch_day && <Button size="sm" variant="outline" className="h-9" onClick={() => saveLaunch(null)} disabled={busy}>지우기</Button>}
                  </div>
                  {data.launch_day && <p className="text-xs text-[#0b0b0b]">지금 설정: {longDay(data.launch_day)}</p>}
                </section>
              </div>

              <section className="rounded-xl border border-black/10 bg-[#fcfcfb] p-4 text-xs text-[#52514e] space-y-1.5">
                <h3 className="text-sm font-semibold text-[#0b0b0b] mb-1">데이터 안내</h3>
                <p>· 출근·할 일·집중·소식·회고는 처음부터 다 있어요. '활성 사용자'는 그날 앱을 열었거나 무언가를 한 사람이에요.</p>
                <p>· 앱 방문·이용 시간·화면별 조회는 {data.tracking_since ? `${longDay(data.tracking_since)}부터` : '이 대시보드를 켠 뒤부터'}, 로그인 전 방문은 {data.anon_since ? `${longDay(data.anon_since)}부터` : '켠 뒤부터'} 기록돼요.</p>
                <p>· 이용 시간은 화면이 켜져 있던 시간이 아니라 실제로 누르거나 스크롤한 뒤 1분까지만 세요. 하루 종일 켜두는 앱이라서요.</p>
                <p>· 채팅은 7일 뒤 지워져서 개수만 따로 남겨요 ({data.chat_since ? `${longDay(data.chat_since)}부터` : '켠 뒤부터'}). 내용은 저장하지 않아요.</p>
                <p>· 사람·오피스 수가 적을 때는 변화율이 크게 흔들려요. 몇 명이 바뀐 건지 숫자도 같이 보세요.</p>
              </section>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
