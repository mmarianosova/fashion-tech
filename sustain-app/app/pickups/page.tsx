'use client';
import { useState } from 'react';
import { Ico } from '@/components/icons';
import { Sheet, Opt, useToast } from '@/components/Sheet';
import { SwipeCard, type Dir } from '@/components/Swipe';
import Top from '@/components/Top';
import { fmtDate, plural, routeName } from '@/lib/plain';
import { post, useAppState } from '@/lib/useAppState';

const short = (items: string[] = []) => (items.length > 6 ? `${items.slice(0, 6).join(', ')} and ${items.length - 6} more` : items.join(', '));

function Face({ a, partner }: { a: any; partner?: any }) {
  const i = a.input ?? {};
  return (<>
    <div className="sc-head"><span className="sc-key">{routeName(i.route)}</span><span className="chip-gate">{a.sent_to ? `With ${a.sent_to}` : 'Needs a yes'}</span></div>
    <div className="think"><div className="k">Who collects</div><div className="big-t" style={{ fontSize: '1.3rem' }}>{partner?.name?.replace(' (fictional)', '') ?? i.partner_id}</div>
      {partner?.address && <div className="why">{partner.address}</div>}</div>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <div><div className="k">Hand over by</div><div className="dl">{fmtDate(i.deadline)}</div></div>
      <div style={{ textAlign: 'right' }}><div className="k">Items</div><div className="dl" style={{ color: 'var(--ink)' }}>{i.items?.length ?? 0}</div></div></div>
    <div className="items-line">{short(i.items)}</div>
    <div className="ask">Book this pickup?</div>
  </>);
}

// The pickup request the Disposition Agent files for a booked pickup (its artifact_publish step), shown as a one-page document.
export function RequestDoc({ p, partner }: { p: any; partner?: any }) {
  return (<div className="reqdoc">
    <h4>Pickup request {p.booking_id}</h4>
    <p><b>Collector:</b> {partner?.name?.replace(' (fictional)', '') ?? p.partner_id}{partner?.address ? `, ${partner.address}` : ''}</p>
    <p><b>Type:</b> {routeName(p.route)}</p><p><b>Hand over by:</b> {fmtDate(p.deadline)}</p>
    <p><b>Items ({p.items.length}):</b> {p.items.join(', ')}</p>
    {p.lots && Object.keys(p.lots).length > 0 && <p><b>Colour lots:</b> {Object.entries(p.lots).map(([g, v]: any) => `${g} ${v.length}`).join(', ')}</p>}
  </div>);
}

// Checkpoint 2: the Disposition Agent cannot book a pickup until a person says yes. Nothing times out and nothing is auto-denied.
export default function Pickups() {
  const { snap, reload } = useAppState(1000);
  const { toast, say } = useToast();
  const [exit, setExit] = useState<Dir | null>(null);
  const [sheet, setSheet] = useState<null | 'options' | 'who'>(null);
  const [doc, setDoc] = useState<any>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const partner = (id: string) => snap?.recyclers.find((r: any) => r.id === id);

  const queue = (snap?.approvals ?? []).filter((a: any) => a.state === 'pending' && !gone.includes(a.approval_id))
    .sort((a: any, b: any) => Number(!!a.sent_to) - Number(!!b.sent_to));
  const top = queue[0], nxt = queue[1];
  const booked: any[] = snap?.pickups ?? [];
  const running = !!snap?.runs.find((r: any) => r.agent === 'disposition' && !r.finished_at);

  const send = async (a: any, body: any, thanks: string, remove = true) => {
    setErr(null); setSheet(null);
    try { await post(`/api/approvals/${a.approval_id}`, body); if (remove) setGone((g) => [...g, a.approval_id]); say(thanks); reload(); }
    catch (e: any) { setErr(e.message); }
    setExit(null);
  };
  const fly = (d: Dir) => {
    if (!top || exit) return;
    setExit(d);
    setTimeout(() => { if (d === 'right') send(top, { allow: true }, 'Booked. Thank you.'); else { setExit(null); setSheet('options'); } }, 220);
  };

  return (<>
    <Top title="Approve pickups" />
    <main className="page">
      {!snap ? <div className="empty">Loading…</div> : top ? (<>
        <div className="count">{plural(queue.length, 'pickup')} left</div>
        <div className="deck" style={{ height: 400 }}>
          {nxt && <div className="sc next gate"><Face a={nxt} partner={partner(nxt.input?.partner_id)} /></div>}
          <SwipeCard key={top.approval_id} exit={exit} onDir={fly}><Face a={top} partner={partner(top.input?.partner_id)} /></SwipeCard>
        </div>
        <div className="choices">
          <button className="btn-no" onClick={() => fly('left')}>{Ico.x}Not yet</button>
          <button className="btn-yes" onClick={() => fly('right')}>{Ico.check}Yes, book it</button>
        </div>
        <p className="hint">Swipe right to book, left for other choices.</p>
      </>) : running ? (
        <div className="done"><div className="tick"><span className="spin" style={{ margin: 0 }} /></div><h2>Looking for items that are due</h2><p>Pickup proposals appear here for your yes.</p></div>
      ) : booked.length === 0 ? (
        <div className="done"><div className="tick">{Ico.check}</div><h2>Nothing to approve</h2><p>When the agent finds items that are due, its pickup proposals show up here.</p></div>
      ) : (<>
        <div className="count">{plural(booked.length, 'pickup')} booked</div>
        {booked.map((p: any) => (<div className="note" key={p.booking_id}><div className="note-ico n-ok">{Ico.truck}</div>
          <div><h4>{routeName(p.route)}</h4><p>{partner(p.partner_id)?.name?.replace(' (fictional)', '') ?? p.partner_id}</p>
            <p className="nx">Hand over by {fmtDate(p.deadline)} · {plural(p.items.length, 'item')}</p>
            <button className="alt" style={{ marginTop: 8, minHeight: 44, padding: '8px 16px' }} onClick={() => setDoc(p)}>Open pickup request</button></div></div>))}
      </>)}
      {err && <p className="err">{err}</p>}
    </main>
    {sheet === 'options' && top && (
      <Sheet title="What should we do?" sub={`${routeName(top.input?.route)} pickup for ${fmtDate(top.input?.deadline)}`} onClose={() => setSheet(null)}>
        <Opt icon={Ico.person} tone="warn" title="Send to someone" help="They decide. It stays here until someone answers." onClick={() => setSheet('who')} />
        <Opt icon={Ico.x} tone="bad" title="Do not book it" help="The agent is told no and sends an alert" onClick={() => send(top, { allow: false }, 'Not booked.')} />
      </Sheet>)}
    {sheet === 'who' && top && (
      <Sheet title="Who should decide?" sub="The booking stays in the queue until they answer." onClose={() => setSheet('options')}>
        {(snap?.people ?? []).map((p: any) => (<Opt key={p.name} icon={Ico.person} title={p.name} onClick={() => send(top, { send: { to: p.name } }, `Sent to ${p.name}.`, false)} />))}
      </Sheet>)}
    {doc && (<Sheet title="Pickup request" onClose={() => setDoc(null)}><RequestDoc p={doc} partner={partner(doc.partner_id)} />
      <button className="big" style={{ marginBottom: 8 }} onClick={() => window.print()}>Print</button></Sheet>)}
    {toast}
  </>);
}
