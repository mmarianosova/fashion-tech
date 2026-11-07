'use client';
import { useState } from 'react';
import { post, useAppState } from '@/lib/useAppState';
import { Empty, Pill, tagText } from '@/components/ui';

const OPT = { stream: ['shred', 'denim', 'mixed', 'trash'], color_group: ['whites', 'darks', 'brights', 'mixed'], condition: ['wearable', 'damaged', 'unusable'] } as const;

function Card({ r, reload }: { r: any; reload: () => void }) {
  const [edit, setEdit] = useState(false);
  const [t, setT] = useState<any>(r.proposed_tags ?? { stream: 'mixed', fibre_type: 'unknown', color_group: 'mixed', condition: 'damaged' });
  const [err, setErr] = useState<string | null>(null);
  const act = async (decision: string, tags?: any) => { try { await post(`/api/reviews/${r.review_id}`, { decision, tags }); reload(); } catch (e: any) { setErr(e.message); } };
  return (<div className="card">
    <div className="row"><b>{r.item_key}</b><Pill v={r.state} /><span className="sub">confidence {r.confidence?.toFixed(2)}</span></div>
    <p><b>Why held:</b> {r.reason}</p>
    <p><b>Label text:</b> {r.label_text || <i>none</i>}</p>
    {r.proposed_tags && <p><b>Proposed tags:</b> {tagText(r.proposed_tags)}</p>}
    {r.state !== 'pending' && <p><b>Decision:</b> {r.state}{r.decided_tags ? ` : ${tagText(r.decided_tags)}` : ''}</p>}
    {r.state === 'pending' && (edit ? (
      <div className="tagrow">
        {(Object.keys(OPT) as (keyof typeof OPT)[]).map((k) => (<label key={k}>{k.replace('_', ' ')} <select value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })}>{OPT[k].map((o) => <option key={o}>{o}</option>)}</select></label>))}
        <label>fibre <input value={t.fibre_type} onChange={(e) => setT({ ...t, fibre_type: e.target.value })} style={{ width: 90 }} /></label>
        <button className="go" onClick={() => act('edit', t)}>Save edit</button><button className="alt" onClick={() => setEdit(false)}>Cancel</button>
      </div>) : (
      <div className="row"><button className="go" disabled={!r.proposed_tags} onClick={() => act('approve')}>Approve proposed tags</button>
        <button className="alt" onClick={() => setEdit(true)}>Edit</button><button className="no" onClick={() => act('reject')}>Reject item</button></div>))}
    {err && <p className="err">{err}</p>}
  </div>);
}

export default function Review() {
  const { snap, reload } = useAppState();
  if (!snap) return <Empty>Loading...</Empty>;
  const pending = snap.reviews.filter((r: any) => r.state === 'pending');
  const done = snap.reviews.filter((r: any) => r.state !== 'pending');
  return (<>
    <h1>2. Review queue</h1>
    <p className="sub">Items the Intake Agent was not confident about. The agent is paused on each one until you decide.</p>
    {pending.length === 0 ? <Empty>Nothing waiting. Start an intake run on the Intake page.</Empty> : pending.map((r: any) => <Card key={r.review_id} r={r} reload={reload} />)}
    {done.length > 0 && <><h2>Decided</h2>{done.map((r: any) => <Card key={r.review_id} r={r} reload={reload} />)}</>}
  </>);
}
