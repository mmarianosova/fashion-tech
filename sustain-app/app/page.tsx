'use client';
import { useState } from 'react';
import { post, useAppState } from '@/lib/useAppState';
import { Empty, Feed, Pill, Stat, tagText } from '@/components/ui';

export default function Intake() {
  const { snap, reload } = useAppState();
  const [threshold, setThreshold] = useState(0.8);
  const [err, setErr] = useState<string | null>(null);
  if (!snap) return <Empty>Loading...</Empty>;
  const items: any[] = snap.items;
  const c = (s: string) => items.filter((i) => i.state === s).length;
  const active = snap.runs.find((r: any) => r.agent === 'intake' && !r.finished_at);
  const start = async () => { setErr(null); try { await post('/api/runs/intake', { batch_id: snap.batch.batch_id, threshold }); reload(); } catch (e: any) { setErr(e.message); } };
  return (<>
    <h1>1. Intake: scan labels and tag items</h1>
    <p className="sub">The Intake Agent reads each label, tags the garment, and holds anything it is unsure about for a person.</p>
    <div className="card row">
      <div className="grow"><b>Batch {snap.batch?.batch_id}</b> <span className="sub">({items.length} items)</span></div>
      <label>Confidence threshold <input type="number" step="0.05" min="0" max="1" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: 80 }} /></label>
      <button className="go" disabled={!!active} onClick={start}>{active ? 'Agent running...' : 'Start intake run'}</button>
    </div>
    {err && <p className="err">{err}</p>}
    <div className="card row">
      <Stat n={items.length} label="items" /><Stat n={c('tagged')} label="tagged" /><Stat n={c('held')} label="held for review" />
      <Stat n={c('rejected')} label="rejected" /><Stat n={c('pending')} label="waiting" />
    </div>
    {c('held') > 0 && <p><b>{c('held')}</b> items are waiting for a person. <a href="/review">Open the review queue</a></p>}
    <h2>Items</h2>
    <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 420 }}>
      <table><thead><tr><th>Item</th><th>Garment</th><th>Label text</th><th>Status</th><th>Tags (stream / fibre / colour / condition)</th><th>Conf.</th></tr></thead>
        <tbody>{items.map((i) => (<tr key={i.item_key}>
          <td>{i.item_key}</td><td>{i.garment_type}, {i.color}</td><td>{i.label_text || <i>none</i>}</td><td><Pill v={i.state} /></td>
          <td>{i.stream ? tagText(i) : ''}</td><td>{i.confidence != null ? i.confidence.toFixed(2) : ''}</td></tr>))}</tbody></table>
    </div>
    <h2>Live agent feed</h2><Feed events={snap.events} />
  </>);
}
