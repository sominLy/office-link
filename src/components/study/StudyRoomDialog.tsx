import { FormEvent, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOffice } from '@/contexts/OfficeContext';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { track } from '@/lib/funnel';
import { checkPublicPost } from '@/lib/profanity';
import { kstNowHM } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { StudyRoom } from '@/lib/types';
import {
  checkMeetingUrl, formatStartTime, startsAtFromHM,
  NEW_MEETING_LINKS, NOTE_MAX, PROVIDER_META, STUDY_SUBJECTS, TITLE_MAX,
} from '@/lib/study';
import { ActionButton } from '@/seed/ui/action-button';
import { TextField, TextFieldInput } from '@/seed/ui/text-field';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/AppDialog';
import { ExternalLink, Video } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 방이 DB에 들어간 직후. 홈 목록을 realtime보다 먼저 갱신하는 데 쓴다. */
  onCreated?: (room: StudyRoom) => void;
}

// 할 일 폼과 같은 칩 모양
const chipBase = 'rounded-full border px-2.5 py-1 text-t2 font-medium transition-colors';
const chipIdle = 'bg-bg-layer-default text-fg-neutral-muted border-stroke-neutral-subtle hover:border-stroke-brand-weak';
const chipPicked = 'bg-bg-brand-solid text-white border-stroke-brand-solid';

// "시간 정하기"를 누르면 다음 30분 단위부터 고르게 한다
function nextHalfHour(): string {
  const [h, m] = kstNowHM().split(':').map(Number);
  const rounded = (Math.ceil((h * 60 + m + 1) / 30) * 30) % (24 * 60);
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

/**
 * 스터디룸 열기 — 제목·인적성 영역·회의 링크·시작 시간을 받아 방을 만든다.
 * 링크는 checkMeetingUrl이 화상 회의 서비스 주소만 통과시키고, DB의 CHECK가 같은 규칙을 한 번 더 본다.
 */
export default function StudyRoomDialog({ open, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const { office, myWorkSession, myStatusSession, changeStatus } = useOffice();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  // 붙여 넣는 즉시 어느 서비스 링크인지(또는 왜 안 되는지) 보여준다
  const linkCheck = link.trim() ? checkMeetingUrl(link) : null;

  const reset = () => {
    setTitle(''); setSubject(''); setLink(''); setNote(''); setWhen('now'); setTime('');
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!user || !office || saving) return;
    const cleanTitle = title.trim();
    const cleanNote = note.trim();
    if (!cleanTitle) {
      toast.error('어떤 공부를 할지 제목을 적어 주세요');
      return;
    }
    const check = checkMeetingUrl(link);
    // strict가 꺼진 tsconfig라 `!check.ok`로는 유니온이 좁혀지지 않는다
    if (check.ok === false) {
      toast.error(check.reason);
      return;
    }
    // 공개 오피스의 글은 모르는 사람이 읽는다. 소식 글과 같은 검사를 거친다.
    if (office.is_public) {
      for (const text of [cleanTitle, cleanNote]) {
        if (!text) continue;
        const c = checkPublicPost(text);
        if (!c.ok) {
          toast.error(c.reason ?? '올릴 수 없는 내용이에요');
          return;
        }
      }
    }
    let startsAt: string | undefined;
    if (when === 'later') {
      const at = startsAtFromHM(time);
      if (!at) {
        toast.error('이미 지난 시간이에요. 시간을 다시 고르거나 지금 바로 시작해 주세요');
        return;
      }
      startsAt = at;
    }

    setSaving(true);
    const row: Record<string, unknown> = {
      office_id: office.id,
      host_id: user.id,
      title: cleanTitle,
      subject: subject || null,
      meeting_url: check.url,
      note: cleanNote || null,
    };
    // 지금 시작하는 방은 starts_at을 보내지 않는다. DB 시계(now())로 받아야 기기 시계가 틀려도 "진행 중"으로 보인다.
    if (startsAt) row.starts_at = startsAt;
    const { data, error } = await supabase.from('study_rooms').insert(row).select('*').single();
    if (error || !data) {
      setSaving(false);
      if (error?.code === '42P01' || error?.code === 'PGRST205') {
        // 테이블이 없는 DB. 다시 시도해도 되지 않으므로 그렇게 말하지 않는다.
        console.warn('024_study_rooms.sql 미적용 — study_rooms 없음');
        toast.error('스터디룸은 아직 켜지지 않았어요');
      } else if (error?.code === '23514') {
        toast.error('제목이나 링크가 규칙에 맞지 않아요. 다시 확인해 주세요');
      } else {
        toast.error('스터디룸을 열지 못했어요. 잠시 후 다시 시도해 주세요');
      }
      return;
    }
    const room = data as StudyRoom;
    track('study_room_created', { provider: check.provider, subject: subject || null, scheduled: !!startsAt });

    // 지금 시작하는 방은 연 사람이 바로 들어간다. 출근 중이면 상태도 스터디로.
    if (!startsAt) {
      await supabase
        .from('study_room_members')
        .upsert({ room_id: room.id, user_id: user.id }, { onConflict: 'room_id,user_id', ignoreDuplicates: true });
      if (myWorkSession && myStatusSession?.status !== '스터디/회의 중') void changeStatus('스터디/회의 중');
    }

    // 소식 기록과 멤버 푸시. 실패해도 방은 열렸으므로 결과를 버린다.
    const feedText = startsAt
      ? `📚 ${formatStartTime(startsAt)}에 스터디룸 "${cleanTitle}"을 열어요. 홈에서 들어올 수 있어요`
      : `📚 스터디룸 "${cleanTitle}"을 열었어요. 홈에서 바로 들어올 수 있어요`;
    supabase.from('office_feed').insert({ office_id: office.id, user_id: user.id, type: 'post', content: feedText }).then(() => {});
    supabase.functions.invoke('push-notify', {
      body: { action: 'study', office_id: office.id, actor_id: user.id, room_id: room.id },
    }).catch(() => {});

    setSaving(false);
    onCreated?.(room);
    reset();
    onClose();

    if (startsAt) {
      toast.success(`${formatStartTime(startsAt)}에 시작하는 스터디룸을 열었어요. 멤버들에게 알렸어요 📚`);
      return;
    }
    // 저장이 끝난 뒤의 새 탭 열기는 사파리가 막는다. 막히면 스낵바의 버튼으로 연다 (버튼 클릭은 사용자 동작이라 열린다).
    const openMeeting = () => { window.open(check.url, '_blank', 'noopener,noreferrer'); };
    openMeeting();
    toast.success('스터디룸을 열었어요. 멤버들에게 알렸어요 📚', { action: { label: '회의 열기', onClick: openMeeting } });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>📚 스터디룸 열기</DialogTitle>
          <DialogDescription>줌·구글밋 링크를 붙여 두면 멤버들에게 알림이 가고, 홈에서 바로 들어올 수 있어요</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <TextField label="무슨 공부를 할까요?" value={title} onValueChange={(d) => setTitle(d.value)} maxGraphemeCount={TITLE_MAX}>
            <TextFieldInput autoFocus placeholder="예: GSAT 수리 모의고사 같이 풀기" enterKeyHint="next" />
          </TextField>

          <div className="space-y-1.5">
            <Label>인적성 영역 <span className="font-normal text-fg-neutral-muted">(선택)</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {STUDY_SUBJECTS.map((s) => (
                <button key={s} type="button" onClick={() => setSubject(subject === s ? '' : s)}
                  aria-pressed={subject === s}
                  className={cn(chipBase, subject === s ? chipPicked : chipIdle)}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <TextField
              label="회의 링크"
              value={link}
              onValueChange={(d) => setLink(d.value)}
              invalid={linkCheck?.ok === false}
              errorMessage={linkCheck?.ok === false ? linkCheck.reason : undefined}
              description={linkCheck?.ok ? `${PROVIDER_META[linkCheck.provider].label} 링크예요 ✅` : '줌·구글밋·팀즈·디스코드·웹엑스·Whereby 링크를 받아요'}
            >
              <TextFieldInput inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                placeholder="https://meet.google.com/abc-defg-hij" />
            </TextField>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-t2 text-fg-neutral-muted">링크가 아직 없다면</span>
              {NEW_MEETING_LINKS.map((l) => (
                <a key={l.provider} href={l.url} target="_blank" rel="noopener noreferrer"
                  className={cn(chipBase, chipIdle, 'inline-flex items-center gap-1')}>
                  {l.label} <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              ))}
            </div>
            <p className="text-t2 text-fg-neutral-muted">새 탭에서 회의를 만들고 주소를 복사해 위에 붙여 넣어요</p>
          </div>

          <div className="space-y-1.5">
            <Label>언제 시작할까요?</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setWhen('now')} aria-pressed={when === 'now'}
                className={cn(chipBase, when === 'now' ? chipPicked : chipIdle)}>
                지금 바로
              </button>
              <button type="button" onClick={() => { setWhen('later'); if (!time) setTime(nextHalfHour()); }} aria-pressed={when === 'later'}
                className={cn(chipBase, when === 'later' ? chipPicked : chipIdle)}>
                오늘 시간 정하기
              </button>
              {when === 'later' && (
                <TextField value={time} onValueChange={(d) => setTime(d.value)} className="w-32">
                  <TextFieldInput type="time" aria-label="시작 시간" />
                </TextField>
              )}
            </div>
            {when === 'later' && (
              <p className="text-t2 text-fg-neutral-muted">그 시간이 되기 전에도 홈에 떠 있어서 미리 들어갈 수 있어요</p>
            )}
          </div>

          <TextField label="한 줄 안내" indicator="선택" value={note} onValueChange={(d) => setNote(d.value)} maxGraphemeCount={NOTE_MAX}>
            <TextFieldInput placeholder="예: 수리 10번부터 20번까지, 25분 타이머로 풀어요" />
          </TextField>

          <ActionButton type="submit" variant="brandSolid" className="w-full" loading={saving}
            disabled={saving || !title.trim() || !link.trim()}>
            <Video className="w-4 h-4 mr-1" /> 스터디룸 열기
          </ActionButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
