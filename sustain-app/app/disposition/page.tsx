'use client';
import { useState } from 'react';
import { post, useAppState } from '@/lib/useAppState';
import { Empty, Feed, Hero, Metric, Pill, Dot } from '@/components/ui';

const TRUCK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg>;
const REASON: Record<string, string> = { received_60d: '60+ days in stock', item_date: 'item date passed', return_window: 'return window closed', season_end: 'season ended' };
const ESC: Record<string, string> = { below_minimum: 'Below the partner minimum', dispose_confirm: 'Disposal needs confirmation', no_partner: 'No partner accepts this route' };
const fmt = (d?: string) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');

export default function Disposition() {
  const { snap, reload } = useAppState();
  const [err, setErr] = useState<string | null>(null);
  if (!snap) return <main><Empty>Loading...</Empty></main>;
  const pl = snap.plan;
  const active = snap.runs.find((r: any) => r.agent === 'disposition' && !r.finished_at);
  const start = async () => { setErr(null); try { await post('/api/runs/disposition'); reload(); } catch (e: any) { setErr(e.message); } };
  const decide = async (id: string, allow: boolean) => { try { await post(`/api/approvals/${id}`, { allow }); reload(); } catch (e: any) { setErr(e.message); } };
  const name = (id: string) => snap.recyclers.find((r: any) => r.id === id)?.name?.replace(' (fictional)', '') ?? id;
  return (<>
    <Hero eyebrow={`Step 3 | Review date ${snap.today}`} title="Route, book, notify."
      sub="The Disposition Agent finds items whose time is up, routes them to donate, recycle or dispose, books pickups (you approve each one), and sends alerts.">
      <button className="btn-ai" disabled={!!active} onClick={start}>{active ? 'Agent running...' : "Run today's review"}</button>
    </Hero>
    <main className="pull">
      {err && <p className="err">{err}</p>}
      <div className="metrics">
        <Metric label="Due now" n={pl.due.length} sub={`of ${snap.inventoryCount} in inventory`} tone="m-amber" />
        <Metric label="Pickups possible" n={pl.pickups.length} sub="meet partner minimums" tone="m-green" />
        <Metric label="Need a person" n={pl.escalations.length} sub="escalated groups" tone="m-red" />
        <Metric label="Skipped" n={pl.skipped.length} sub="held, not due, or alerted" />
      </div>

      <h2>Pickup bookings</h2>
      {snap.approvals.length === 0 ? <Empty>No bookings requested yet. Run today's review.</Empty> : snap.approvals.map((a: any) => {
        const i = a.input ?? {}; const pend = a.state === 'pending';
        return (<div className={`fc ${pend ? 'gate' : ''}`} key={a.approval_id}>
          <div className="fc-head"><div className="fc-ico">{TRUCK}</div><div className="grow"><div className="fc-t">{String(i.route ?? '').replace('_', ' ')} pickup</div><div className="fc-s">{i.items?.length} items | {name(i.partner_id)}</div></div><Pill v={a.state} /></div>
          <div className="fc-status">{pend ? 'Waiting for your approval' : a.state === 'allowed' ? 'Booked' : 'Denied'}<small>The agent is {pend ? 'paused until you decide' : 'done with this booking'}.</small></div>
          <div className="fc-leg"><div><div className="fc-k">Hand over by</div><div className={`fc-big ${pend ? 'warn' : 'ok'}`}>{fmt(i.deadline)}</div></div>
            <div style={{ textAlign: 'right' }}><div className="fc-k">Partner</div><span className="chip c-gate">{i.partner_id}</span></div></div>
          <div className="fc-leg"><div><div className="fc-k">Items</div><div className="fc-mid" style={{ fontSize: 15 }}>{i.items?.join(', ')}</div>
            {i.lots && Object.keys(i.lots).length > 0 && <div style={{ marginTop: 8 }}>{Object.entries(i.lots).map(([g, v]: any) => <span className="chip" key={g}><Dot g={g} />{g} {v.length}</span>)}</div>}</div></div>
          {pend && <div className="fc-act"><button className="go" onClick={() => decide(a.approval_id, true)}>Approve booking</button><button className="no" onClick={() => decide(a.approval_id, false)}>Deny</button></div>}
        </div>);
      })}

      <h2>Due now and why</h2>
      {pl.routes.length === 0 ? <Empty>Nothing is due. Everything due has already been handled.</Empty> : (
        <div className="tbl" style={{ maxHeight: 320 }}><table><thead><tr><th>Item</th><th>Route</th><th>Colour</th><th>Why it is due</th></tr></thead>
          <tbody>{pl.routes.map((r: any) => <tr key={r.item_key}><td className="key">{r.item_key}</td><td><span className="chip">{r.route.replace('_', ' ')}</span></td>
            <td><span className="chip"><Dot g={r.color_group} />{r.color_group}</span></td><td>{r.reasons.map((x: string) => REASON[x]).join(', ')}</td></tr>)}</tbody></table></div>)}

      {pl.escalations.length > 0 && <><h2>Needs a person</h2>{pl.escalations.map((e: any, k: number) => (
        <div className="note" key={k}><div className="note-ico n-warn">!</div><div><h4>{ESC[e.reason] ?? e.reason}</h4><p>{e.items.join(', ')}</p></div></div>))}</>}

      {snap.pickups.length > 0 && <><h2>Booked pickups</h2>{snap.pickups.map((p: any) => (
        <div className="note" key={p.booking_id}><div className="note-ico n-ok">{TRUCK}</div><div><h4>{p.route.replace('_', ' ')} with {name(p.partner_id)}</h4><p>{p.items.length} items, by {fmt(p.deadline)} | {p.booking_id}</p></div></div>))}</>}
      <h2>Live agent feed</h2><Feed events={snap.events} />
    </main>
  </>);
}
