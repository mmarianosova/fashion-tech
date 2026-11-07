'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Sheet } from '@/components/Sheet';
import { Ico } from '@/components/icons';
import Top from '@/components/Top';
import { post, useAppState } from '@/lib/useAppState';
import { fmtDate } from '@/lib/plain';

const TITLE: Record<string, string> = { donate_recycle_due: 'Pickup ready', review_waiting: 'Item to review', dispute_deadline: 'Deadline coming', delay_risk: 'Possible delay', reply: 'Reply' };
const TAG: Record<string, string> = { reply: 'REPLY', donate_recycle_due: 'PICKUP', review_waiting: 'REVIEW' };
const icon = (t: string) => (t === 'reply' ? [Ico.person, 'n-ask'] : t === 'donate_recycle_due' ? [Ico.truck, 'n-ok'] : [Ico.flag, 'n-warn']);
const title = (a: any) => (a.type === 'reply' && a.from_name ? `${a.from_name} replied` : TITLE[a.type] ?? 'Message');
// Where the related item lives.
const target = (a: any) => (a.ref_kind === 'review' ? { href: '/check', label: 'Go to Items to review' } : a.ref_kind === 'approval' ? { href: '/pickups', label: 'Go to Pickups to review' }
  : a.type === 'review_waiting' ? { href: '/check', label: 'Go to Items to review' } : a.type === 'donate_recycle_due' ? { href: '/pickups', label: 'Go to Pickups to review' } : null);

export default function Messages() {
  const { snap, reload } = useAppState(1500);
  const [open, setOpen] = useState<any>(null);
  const mine: any[] = snap?.alerts ?? [];
  // Opening a message counts as checking it: no separate button.
  const read = async (a: any) => { setOpen(a); if (!a.is_read) { await post('/api/alerts/read', { id: a.alert_id }); reload(); } };
  const t = open && target(open);
  return (<>
    <Top title="Messages" sub="What is due and what to do." />
    <main className="page">
      {!snap ? <div className="empty">Loading…</div> : mine.length === 0 ? (
        <div className="done"><div className="tick">{Ico.bell}</div><h2>No messages</h2><p>Updates and replies show up here.</p></div>
      ) : mine.map((a: any) => { const [ic, tone] = icon(a.type) as [any, string]; return (
        <button key={a.alert_id} className={`note tap ${a.is_read ? '' : 'unread'}`} onClick={() => read(a)}>
          <div className={`note-ico ${tone}`}>{ic}</div>
          <div><h4>{title(a)}</h4><p className="clamp">{a.summary}</p><span className="tag">{TAG[a.type] ?? 'ALERT'}</span></div>
        </button>); })}
    </main>
    {open && (
      <Sheet title={title(open)} sub={open.items?.length ? open.items.join(', ') : undefined} onClose={() => setOpen(null)}>
        <p className="msg-body">{open.summary}</p>
        {open.deadline && <p className="msg-body nx">By {fmtDate(open.deadline)}</p>}
        {open.next_step && <p className="msg-body nx">{open.next_step}</p>}
        {t && <Link className="open big-link" href={t.href}>{t.label}</Link>}
      </Sheet>)}
  </>);
}
