'use client';
import { useState } from 'react';
import { post, useAppState } from '@/lib/useAppState';
import { Conf, Empty, Feed, Hero, Metric, Pill, Tags } from '@/components/ui';

export default function Intake() {
  const { snap, reload } = useAppState();
  const [threshold, setThreshold] = useState(0.8);
  const [err, setErr] = useState<string | null>(null);
  if (!snap) return <main><Empty>Loading...</Empty></main>;
  const items: any[] = snap.items;
  const c = (s: string) => items.filter((i) => i.state === s).length;
  const active = snap.runs.find((r: any) => r.agent === 'intake' && !r.finished_at);
  const start = async () => { setErr(null); try { await post('/api/runs/intake', { batch_id: snap.batch.batch_id, threshold }); reload(); } catch (e: any) { setErr(e.message); } };
  return (<>
    <Hero eyebrow={`Step 1 | Batch ${snap.batch?.batch_id}`} title="Scan labels. Tag every item."
      sub="The Intake Agent reads each label, tags the garment for recycling, and holds anything it is unsure about for a person.">
      <div className="row">
        <label style={{ color: '#c6cbf5', fontSize: 13 }}>Hold below confidence<br />
          <input type="number" step="0.05" min="0" max="1" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: 90, marginTop: 4 }} /></label>
        <button className="btn-ai" disabled={!!active} onClick={start}>{active ? 'Agent running...' : 'Start intake run'}</button>
      </div>
    </Hero>
    <main className="pull">
      {err && <p className="err">{err}</p>}
      <div className="metrics">
        <Metric label="Items in batch" n={items.length} sub="waiting to be scanned" />
        <Metric label="Tagged" n={c('tagged')} sub={`of ${items.length} items`} tone="m-green" />
        <Metric label="Held for review" n={c('held')} sub="needs a person" tone="m-amber" />
        <Metric label="Rejected" n={c('rejected')} sub="removed from the flow" tone="m-red" />
        <Metric label="Still waiting" n={c('pending')} sub="agent has not reached them" tone="m-violet" />
      </div>
      {c('held') > 0 && <div className="card row" style={{ borderLeft: '5px solid var(--gate)' }}><b>{c('held')} item{c('held') > 1 ? 's' : ''} waiting for a person.</b><a href="/review">Open the review queue</a></div>}
      <h2>Items</h2>
      <div className="tbl"><table><thead><tr><th>Item</th><th>Garment</th><th>Label text</th><th>Status</th><th>Tags</th><th>Confidence</th></tr></thead>
        <tbody>{items.map((i) => (<tr key={i.item_key}>
          <td className="key">{i.item_key}</td><td>{i.garment_type}<div className="sub">{i.color}</div></td><td className="lbl">{i.label_text || <i className="sub">no label text</i>}</td>
          <td><Pill v={i.state} /></td>
          <td>{i.stream ? <Tags t={{ stream: i.stream, fibre_type: i.fibre_type, color_group: i.color_group, condition: i.condition }} /> : ''}</td>
          <td><Conf v={i.confidence} /></td></tr>))}</tbody></table></div>
      <h2>Live agent feed</h2><Feed events={snap.events} />
    </main>
  </>);
}
