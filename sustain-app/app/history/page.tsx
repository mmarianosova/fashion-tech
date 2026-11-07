'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Ico } from '@/components/icons';
import Top from '@/components/Top';
import { Sheet } from '@/components/Sheet';
import { useAppState } from '@/lib/useAppState';
import { fmtDate, pileName, plural, routeName } from '@/lib/plain';

type Filter = 'all' | 'labels' | 'pickups' | 'alerts';
const L: Record<string, [string, string]> = { approved: ['Accepted', 'ok'], edited: ['Changed', 'book'], rejected: ['Removed', 'no'] };
const P: Record<string, [string, string]> = { allowed: ['Booked', 'book'], denied: ['Not booked', 'no'], rescheduled: ['Rescheduled', 'book'] };

// Everything already decided. "Change" reopens the normal review screen; it is not a new design.
export default function History() {
  const { snap } = useAppState(2000);
  const [f, setF] = useState<Filter>('all');
  const [open, setOpen] = useState<any>(null);
  if (!snap) return <><Top title="History" /><main className="page"><div className="empty">Loading…</div></main></>;

  const item = (k: string) => snap.items.find((i: any) => i.item_key === k);
  const labels = snap.reviews.filter((r: any) => r.state !== 'pending');
  const picks = snap.approvals.filter((a: any) => a.state !== 'pending');
  const alerts = snap.alerts.filter((a: any) => a.is_read);
  const partner = (id: string) => snap.recyclers.find((r: any) => r.id === id)?.name?.replace(' (fictional)', '') ?? '';
  const Row = ({ ic, t, st, tone, sub, href, word, onClick }: any) => (
    <div className="hrow"><span className="ic">{ic}</span><span className="t"><b>{t}</b><small>{sub}</small></span>
      <span className="r"><span className={`st st-${tone}`}>{st}</span>
        {href ? <Link className="chg" href={href}>{word}</Link> : <button className="chg" onClick={onClick}>{word}</button>}</span></div>);
  const Group = ({ title, children, empty }: any) => (<div className="hgroup"><div className="sect">{title}</div><div className="hlist">{children ?? <div className="hrow"><span className="t"><small>{empty}</small></span></div>}</div></div>);
  const Chip = ({ k, t }: { k: Filter; t: string }) => <button className={f === k ? 'on' : ''} onClick={() => setF(k)}>{t}</button>;
  const show = (k: Filter) => f === 'all' || f === k;

  return (<>
    <Top title="History" sub="Everything you have decided. Tap Change to look at it again." />
    <main className="page">
      <div className="chips"><Chip k="all" t="All" /><Chip k="labels" t="Labels" /><Chip k="pickups" t="Pickups" /><Chip k="alerts" t="Alerts" /></div>
      {show('labels') && <Group title="Label decisions" empty="No label decisions yet.">{labels.length ? labels.map((r: any) => {
        const [st, tone] = L[r.state] ?? [r.state, 'seen']; const it = item(r.item_key); const tags = r.decided_tags ?? r.proposed_tags;
        return <Row key={r.review_id} ic={Ico.label} t={`${r.item_key} ${[it?.color, it?.garment_type].filter(Boolean).join(' ')}`.trim()} st={st} tone={tone} sub={r.state === 'rejected' ? 'Taken out of the batch' : pileName(tags?.stream)} href="/check" word="Change" />;
      }) : undefined}</Group>}
      {show('pickups') && <Group title="Pickups" empty="No pickups decided yet.">{picks.length ? picks.map((a: any) => {
        const [st, tone] = P[a.state] ?? [a.state, 'seen']; const i = a.input ?? {};
        return <Row key={a.approval_id} ic={Ico.truck} t={routeName(i.route)} st={st} tone={tone} sub={`${partner(i.partner_id)} · ${plural(i.items?.length ?? 0, 'item')} · ${fmtDate(a.resched_to ?? i.deadline)}`} href="/pickups" word="Change" />;
      }) : undefined}</Group>}
      {show('alerts') && <Group title="Alerts seen" empty="No alerts seen yet.">{alerts.length ? alerts.map((a: any) => (
        <Row key={a.alert_id} ic={Ico.bell} t={a.type === 'reply' && a.from_name ? `${a.from_name} replied` : 'Message'} st="Seen" tone="seen" sub={a.summary} word="Open" onClick={() => setOpen(a)} />)) : undefined}</Group>}
    </main>
    {open && <Sheet title="Message" onClose={() => setOpen(null)}><p className="msg-body">{open.summary}</p></Sheet>}
  </>);
}
