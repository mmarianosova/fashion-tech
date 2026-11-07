'use client';
import { useState } from 'react';
import { post, useAppState } from '@/lib/useAppState';
import { Empty, Feed, Pill, Stat } from '@/components/ui';

export default function Disposition() {
  const { snap, reload } = useAppState();
  const [err, setErr] = useState<string | null>(null);
  if (!snap) return <Empty>Loading...</Empty>;
  const pl = snap.plan;
  const active = snap.runs.find((r: any) => r.agent === 'disposition' && !r.finished_at);
  const pend = snap.approvals.filter((a: any) => a.state === 'pending');
  const start = async () => { setErr(null); try { await post('/api/runs/disposition'); reload(); } catch (e: any) { setErr(e.message); } };
  const decide = async (id: string, allow: boolean) => { try { await post(`/api/approvals/${id}`, { allow }); reload(); } catch (e: any) { setErr(e.message); } };
  const reasons: Record<string, string> = { received_60d: '60+ days in stock', item_date: 'item date passed', return_window: 'return window closed', season_end: 'season ended' };
  return (<>
    <h1>3. Disposition: route, book, notify</h1>
    <p className="sub">The Disposition Agent finds items whose time is up, routes them, books pickups (you approve each one), and sends alerts.</p>
    <div className="card row">
      <div className="grow"><b>Review date: {snap.today}</b> <span className="sub">{snap.inventoryCount} items in inventory</span></div>
      <button className="go" disabled={!!active} onClick={start}>{active ? 'Agent running...' : "Run today's review"}</button>
    </div>
    {err && <p className="err">{err}</p>}
    <div className="card row"><Stat n={pl.due.length} label="due now" /><Stat n={pl.pickups.length} label="pickups possible" />
      <Stat n={pl.escalations.length} label="need a person" /><Stat n={pl.skipped.length} label="skipped" /></div>

    <h2>Pickup approvals {pend.length > 0 && <span className="badge">{pend.length}</span>}</h2>
    {snap.approvals.length === 0 ? <Empty>No bookings requested yet.</Empty> : snap.approvals.map((a: any) => (
      <div className="card" key={a.approval_id}><div className="row"><b>{String(a.input?.route ?? '').replace('_', ' ')} pickup</b><Pill v={a.state} />
        <span className="sub">{a.input?.items?.length} items, deadline {a.input?.deadline}, partner {a.input?.partner_id}</span></div>
        <p>Items: {a.input?.items?.join(', ')}</p>
        {a.input?.lots && Object.keys(a.input.lots).length > 0 && <p>Colour lots: {Object.entries(a.input.lots).map(([g, v]: any) => `${g} (${v.length})`).join(', ')}</p>}
        {a.state === 'pending' && <div className="row"><button className="go" onClick={() => decide(a.approval_id, true)}>Approve booking</button><button className="no" onClick={() => decide(a.approval_id, false)}>Deny</button></div>}
      </div>))}

    <h2>Due now and why</h2>
    <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 300 }}>
      {pl.routes.length === 0 ? <Empty>Nothing is due.</Empty> : (<table><thead><tr><th>Item</th><th>Route</th><th>Colour</th><th>Why due</th></tr></thead>
        <tbody>{pl.routes.map((r: any) => <tr key={r.item_key}><td>{r.item_key}</td><td>{r.route}</td><td>{r.color_group}</td><td>{r.reasons.map((x: string) => reasons[x]).join(', ')}</td></tr>)}</tbody></table>)}
    </div>
    {pl.escalations.length > 0 && <><h2>Needs a person</h2>{pl.escalations.map((e: any, i: number) => (
      <div className="card" key={i}><b>{e.reason.replace('_', ' ')}</b>: {e.items.join(', ')}</div>))}</>}

    <h2>Booked pickups</h2>
    {snap.pickups.length === 0 ? <Empty>None yet.</Empty> : snap.pickups.map((p: any) => (
      <div className="card" key={p.booking_id}><b>{p.booking_id}</b> {p.route} with {p.partner_id}, {p.items.length} items, by {p.deadline}</div>))}
    <h2>Live agent feed</h2><Feed events={snap.events} />
  </>);
}
