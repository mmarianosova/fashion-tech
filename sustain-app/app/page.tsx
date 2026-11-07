'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Ico } from '@/components/icons';
import { post, useAppState } from '@/lib/useAppState';
import { plural } from '@/lib/plain';

// Home: what needs you, and three big buttons. The same for everyone.
export default function Home() {
  const { snap, reload } = useAppState();
  const [err, setErr] = useState<string | null>(null);
  if (!snap) return <div className="hello"><div className="eyebrow">Textile Flow</div><h1>Loading…</h1></div>;

  const reviews = snap.reviews.filter((r: any) => r.state === 'pending').length;
  const approvals = snap.approvals.filter((a: any) => a.state === 'pending').length;
  const unread = snap.alerts.filter((a: any) => !a.is_read).length;
  const needs = reviews + approvals;
  const first = reviews ? '/check' : '/pickups';

  const items: any[] = snap.items;
  const seen = items.filter((i) => i.state !== 'pending').length;
  const allSorted = items.length > 0 && items.every((i) => ['tagged', 'rejected'].includes(i.state));
  const intakeRun = snap.runs.find((r: any) => r.agent === 'intake' && !r.finished_at);
  const dispRun = snap.runs.find((r: any) => r.agent === 'disposition' && !r.finished_at);
  const go = async (url: string, body?: unknown) => { setErr(null); try { await post(url, body); reload(); } catch (e: any) { setErr(e.message); } };

  return (<>
    <div className="hello"><div className="eyebrow">Textile Flow · {snap.today}</div><h1>What would you like to do?</h1></div>
    <main className="page">
      {needs > 0
        ? <Link href={first} className="need">{Ico.bell}<span>{plural(needs, 'thing')} need{needs === 1 ? 's' : ''} you<small>Tap to start</small></span></Link>
        : <div className="need ok">{Ico.check}<span>You are all caught up<small>Nothing is waiting for you</small></span></div>}

      <Link href="/check" className="tile">
        <span className="ic">{Ico.label}</span><span><b>Check labels</b><span className="d">Confirm what the agent could not be sure of</span></span>
        <span className={`n ${reviews ? '' : 'zero'}`}>{reviews}</span></Link>
      <Link href="/pickups" className="tile t2">
        <span className="ic">{Ico.truck}</span><span><b>Approve pickups</b><span className="d">Say yes before a recycler is booked</span></span>
        <span className={`n ${approvals ? '' : 'zero'}`}>{approvals}</span></Link>
      <Link href="/messages" className="tile t3">
        <span className="ic">{Ico.bell}</span><span><b>Messages</b><span className="d">Alerts about what is due and what to do</span></span>
        <span className={`n ${unread ? '' : 'zero'}`}>{unread}</span></Link>

      <section className="start">
        {intakeRun ? <>
          <h3><span className="spin" />Reading your labels…</h3>
          <div className="prog"><i style={{ width: `${(seen / items.length) * 100}%` }} /></div>
          <p>{seen} of {items.length} done. Anything under 0.80 confidence comes to you as a card.</p></>
        : !allSorted ? <>
          <h3>A new batch arrived</h3><p>{plural(items.length, 'item')} to classify from label and catalog descriptions.</p>
          <button className="big go" onClick={() => go('/api/runs/intake', { batch_id: snap.batch?.batch_id })}>Start reading labels</button></>
        : dispRun ? <><h3><span className="spin" />Looking for items that are due…</h3><p>Pickups that need your yes will appear on Approve pickups.</p></>
        : <><h3>Due items</h3><p>This runs by itself every day. You can also run it now.</p>
          <button className="big go" onClick={() => go('/api/runs/disposition')}>Run now</button></>}
      </section>
      {snap.batch && <Link href={`/results?batch=${encodeURIComponent(snap.batch.batch_id)}`} className="tile">
        <span className="ic">{Ico.label}</span><span><b>Batch results</b><span className="d">See materials, sources and review decisions</span></span>
      </Link>}
      {err && <p className="err">{err}</p>}
      <div className="foot"><Link href="/team">For the tech team</Link></div>
    </main>
  </>);
}
