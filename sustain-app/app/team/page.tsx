'use client';
import Link from 'next/link';
import { useState } from 'react';
import { post, useAppState } from '@/lib/useAppState';
import { Conf, Empty, Feed, Metric, Pill, Tags } from '@/components/ui';
import Top from '@/components/Top';

// For the team building this, not for the people using the app: cost guard, run controls, every item, and the raw agent feed.
export default function Team() {
  const { snap, reload } = useAppState();
  const [err, setErr] = useState<string | null>(null);
  const go = async (url: string, body?: unknown) => { setErr(null); try { await post(url, body); reload(); } catch (e: any) { setErr(e.message); } };
  if (!snap) return <><Top title="Tech team" /><main className="page"><Empty>Loading…</Empty></main></>;
  const items: any[] = snap.items;
  const c = (s: string) => items.filter((i) => i.state === s).length;
  const active = snap.runs.filter((r: any) => !r.finished_at);
  return (<>
    <Top title="Tech team" />
    <main className="page">
      <div className="metrics">
        <Metric label="ZooWork balance" n={snap.balance != null ? `$${Number(snap.balance).toFixed(2)}` : 'n/a'} sub={snap.mode === 'fake' ? 'demo mode, no spend' : 'prepaid credit'} tone="m-green" />
        <Metric label="Runs" n={snap.runs.length} sub={`${active.length} running now`} tone="m-violet" />
        <Metric label="Tagged" n={c('tagged')} sub={`of ${items.length} items`} />
        <Metric label="Held / rejected" n={`${c('held')} / ${c('rejected')}`} sub="needs a person / removed" tone="m-amber" />
      </div>
      <div className="card row">
        <button className="alt" onClick={() => go('/api/runs/intake', { batch_id: snap.batch?.batch_id })}>Run label reading</button>
        <button className="alt" onClick={() => go('/api/runs/disposition')}>Run due-items check</button></div>
      {err && <p className="err">{err}</p>}
      {active.length > 0 && <div className="card row">{active.map((r: any) => <button key={r.session_id} className="no" onClick={async () => { await post('/api/stop', { session_id: r.session_id }); reload(); }}>Stop {r.agent} run</button>)}</div>}
      <h2>Items</h2>
      <div className="tbl"><table><thead><tr><th>Item</th><th>Label text</th><th>Status</th><th>Tags</th><th>Conf.</th></tr></thead>
        <tbody>{items.map((i) => (<tr key={i.item_key}><td className="key">{i.item_key}</td><td>{i.label_text || <i className="sub">none</i>}</td><td><Pill v={i.state} /></td>
          <td>{i.stream ? <Tags t={{ stream: i.stream, fibre_type: i.fibre_type, color_group: i.color_group, condition: i.condition }} /> : ''}</td><td><Conf v={i.confidence} /></td></tr>))}</tbody></table></div>
      <h2>Runs</h2>
      <div className="tbl"><table><thead><tr><th>Agent</th><th>Started</th><th>Status</th></tr></thead>
        <tbody>{snap.runs.map((r: any) => <tr key={r.session_id}><td className="key">{r.agent}</td><td>{r.started_at.slice(11, 19)}</td><td>{r.finished_at ? (r.status ?? 'done') : 'running'}</td></tr>)}</tbody></table></div>
      <h2>Live agent feed</h2><Feed events={snap.events} />
      <div className="foot"><Link href="/">Back to the app</Link></div>
    </main></>);
}
