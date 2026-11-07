'use client';
import { useState } from 'react';
import { post, useAppState } from '@/lib/useAppState';
import { Empty, Hero, Pill, Tags } from '@/components/ui';

const OPT = { stream: ['shred', 'denim', 'mixed', 'trash'], color_group: ['whites', 'darks', 'brights', 'mixed'], condition: ['wearable', 'damaged', 'unusable'] } as const;
const Q = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>;

function Card({ r, reload }: { r: any; reload: () => void }) {
  const [edit, setEdit] = useState(false);
  const [t, setT] = useState<any>(r.proposed_tags ?? { stream: 'mixed', fibre_type: 'unknown', color_group: 'mixed', condition: 'damaged' });
  const [err, setErr] = useState<string | null>(null);
  const act = async (decision: string, tags?: any) => { try { await post(`/api/reviews/${r.review_id}`, { decision, tags }); reload(); } catch (e: any) { setErr(e.message); } };
  const tone = r.confidence >= 0.8 ? 'ok' : r.confidence >= 0.55 ? 'warn' : 'bad';
  return (<div className={`fc ${r.state === 'pending' ? 'gate' : ''}`}>
    <div className="fc-head"><div className="fc-ico">{Q}</div><div className="grow"><div className="fc-t">{r.item_key}</div><div className="fc-s">Held for review</div></div><Pill v={r.state} /></div>
    <div className="fc-status">{r.reason}<small>The agent is paused on this item until you decide.</small></div>
    <div className="fc-leg"><div><div className="fc-k">Label text</div><div className="fc-mid">{r.label_text || 'No label text'}</div></div>
      <div style={{ textAlign: 'right' }}><div className="fc-k">Confidence</div><div className={`fc-big ${tone}`}>{r.confidence?.toFixed(2)}</div></div></div>
    {r.proposed_tags && <div className="fc-leg"><div><div className="fc-k">Proposed tags</div><div style={{ marginTop: 6 }}><Tags t={r.proposed_tags} /></div></div></div>}
    {r.state !== 'pending' && r.decided_tags && <div className="fc-leg"><div><div className="fc-k">Decision: {r.state}</div><div style={{ marginTop: 6 }}><Tags t={r.decided_tags} /></div></div></div>}
    {r.state === 'pending' && (edit ? (
      <div className="tagrow" style={{ marginTop: 12 }}>
        {(Object.keys(OPT) as (keyof typeof OPT)[]).map((k) => (<label key={k}>{k.replace('_', ' ')}<select value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })}>{OPT[k].map((o) => <option key={o}>{o}</option>)}</select></label>))}
        <label>fibre<input value={t.fibre_type} onChange={(e) => setT({ ...t, fibre_type: e.target.value })} style={{ width: 100 }} /></label>
        <button className="go" onClick={() => act('edit', t)}>Save edit</button><button className="alt" onClick={() => setEdit(false)}>Cancel</button>
      </div>) : (
      <div className="fc-act"><button className="go" disabled={!r.proposed_tags} onClick={() => act('approve')}>Approve proposed tags</button>
        <button className="alt" onClick={() => setEdit(true)}>Edit</button><button className="no" onClick={() => act('reject')}>Reject item</button></div>))}
    {err && <p className="err">{err}</p>}
  </div>);
}

export default function Review() {
  const { snap, reload } = useAppState();
  if (!snap) return <main><Empty>Loading...</Empty></main>;
  const pending = snap.reviews.filter((r: any) => r.state === 'pending');
  const done = snap.reviews.filter((r: any) => r.state !== 'pending');
  return (<>
    <Hero eyebrow="Step 2 | Human in the loop" title={pending.length ? `${pending.length} waiting for you` : 'Nothing waiting'}
      sub="Items the Intake Agent was not confident about. Approve its proposal, edit the tags, or reject the item." />
    <main className="pull">
      {pending.length === 0 ? <Empty>All clear. Start an intake run and uncertain items will appear here.</Empty> : pending.map((r: any) => <Card key={r.review_id} r={r} reload={reload} />)}
      {done.length > 0 && <><h2>Decided</h2>{done.map((r: any) => <Card key={r.review_id} r={r} reload={reload} />)}</>}
    </main>
  </>);
}
