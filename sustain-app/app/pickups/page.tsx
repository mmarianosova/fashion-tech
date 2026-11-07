'use client';
import { useState } from 'react';
import { Ico } from '@/components/icons';
import { Sheet, Opt, useToast } from '@/components/Sheet';
import { MAT, MatIcon, ROUTE_MAT } from '@/components/Mat';
import Top from '@/components/Top';
import { addDays, fmtDate, plural, RESCHEDULE_DAYS, routeName } from '@/lib/plain';
import { post, useAppState } from '@/lib/useAppState';

const short = (items: string[] = []) => (items.length > 6 ? `${items.slice(0, 6).join(', ')} and ${items.length - 6} more` : items.join(', '));

function Card({ a, partner, onYes, onDate, onNo, onMore }: { a: any; partner?: any; onYes: () => void; onDate: () => void; onNo: () => void; onMore: () => void }) {
  const i = a.input ?? {};
  const ids: string[] = i.items ?? [];
  const mon = i.deadline ? new Date(i.deadline + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase() : '';
  const day = i.deadline ? new Date(i.deadline + 'T00:00:00Z').getUTCDate() : '';
  return (<div className="pick">
    <div className="head"><b>{routeName(i.route)}</b><span className="chip-gate" style={{ marginLeft: 0 }}>{a.sent_to ? `With ${a.sent_to}` : 'To review'}</span></div>
    <div className="matrow"><MatIcon k={ROUTE_MAT[i.route]} /><div><b>{MAT[ROUTE_MAT[i.route]]?.name}</b><span className="d">{MAT[ROUTE_MAT[i.route]]?.desc}</span></div></div>
    <div className="when"><div className="cal"><span>{mon}</span><strong>{day}</strong></div>
      <div><div className="k">Hand over by</div><div className="who">{partner?.name?.replace(' (fictional)', '') ?? i.partner_id}</div>{partner?.address && <div className="addr">{Ico.pin}{partner.address}</div>}</div></div>
    <div><div className="k" style={{ marginBottom: 6 }}>Items {ids.length}</div><div className="ids">{ids.slice(0, 6).map((x) => <span key={x}>{x}</span>)}{ids.length > 6 && <span>+{ids.length - 6} more</span>}</div></div>
    <div className="actions"><button className="btn-yes" onClick={onYes}>Book pickup</button>
      <div className="duo"><button className="btn-alt" onClick={onDate}>Reschedule</button><button className="btn-no" onClick={onNo}>Don’t book</button></div>
      <button className="link" onClick={onMore}>More options</button></div>
  </div>);
}

// The pickup request the Disposition Agent files for a booked pickup (its artifact_publish step), shown as a one-page document.
function RequestDoc({ p, partner }: { p: any; partner?: any }) {
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
  const [sheet, setSheet] = useState<null | 'options' | 'who' | 'date'>(null);
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
  };

  return (<>
    <Top title="Pickups to review" sub="Confirm each pickup before the recycler is booked." />
    <main className="page">
      {!snap ? <div className="empty">Loading…</div> : top ? (<>
        <Card a={top} partner={partner(top.input?.partner_id)} onYes={() => send(top, { allow: true }, 'Booked. Thank you.')} onDate={() => setSheet('date')}
          onNo={() => send(top, { allow: false }, 'Not booked. It can come back on the next run.')} onMore={() => setSheet('options')} />
        {nxt && <div className="upnext"><span style={{ flex: 1 }}><span className="k">Up next</span><b>{routeName(nxt.input?.route)} · {plural(nxt.input?.items?.length ?? 0, 'item')}</b><small>{partner(nxt.input?.partner_id)?.name?.replace(' (fictional)', '')}</small></span><span style={{ color: 'var(--mute)', display: 'flex' }}>{Ico.chev}</span></div>}
      </>) : running ? (
        <div className="done"><div className="tick"><span className="spin" style={{ margin: 0 }} /></div><h2>Looking for items that are due</h2><p>Pickups to review appear here.</p></div>
      ) : booked.length === 0 ? (
        <div className="done"><div className="tick">{Ico.check}</div><h2>Nothing to review</h2><p>When items are due to leave, their pickups show up here.</p></div>
      ) : (<>
        <div className="count">{plural(booked.length, 'pickup')} booked</div>
        {booked.map((p: any) => (<div className="note" key={p.booking_id}><MatIcon k={ROUTE_MAT[p.route]} />
          <div><h4>{routeName(p.route)}</h4><p>{partner(p.partner_id)?.name?.replace(' (fictional)', '') ?? p.partner_id}</p>
            <p className="nx">Hand over by {fmtDate(p.deadline)} · {plural(p.items.length, 'item')}</p>
            <button className="alt" style={{ marginTop: 8, minHeight: 44, padding: '8px 16px' }} onClick={() => setDoc(p)}>Open pickup request</button></div></div>))}
      </>)}
      {err && <p className="err">{err}</p>}
    </main>
    {sheet === 'options' && top && (
      <Sheet title="What should we do?" sub={`${routeName(top.input?.route)} pickup for ${fmtDate(top.input?.deadline)}`} onClose={() => setSheet(null)}>
        <Opt icon={Ico.person} tone="warn" title="Send to someone" help="They decide. It stays here until someone answers." onClick={() => setSheet('who')} />
        <Opt icon={Ico.calendar} title="Reschedule" help="Pick a later hand-over date" onClick={() => setSheet('date')} />
        <Opt icon={Ico.x} tone="bad" title="Don’t book it" help="The items come back on the next run." onClick={() => send(top, { allow: false }, 'Not booked. It can come back on the next run.')} />
      </Sheet>)}
    {sheet === 'date' && top && (
      <Sheet title="Pick a new date" sub={`Now: ${fmtDate(top.input?.deadline)}. The pickup is proposed again with the new date.`} onClose={() => setSheet(null)}>
        {RESCHEDULE_DAYS.map((n) => { const d = addDays(top.input?.deadline, n); return (
          <Opt key={n} icon={Ico.calendar} title={fmtDate(d)} help={`${n} days later`} onClick={() => send(top, { reschedule: { deadline: d } }, `Moved to ${fmtDate(d)}.`)} />); })}
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
