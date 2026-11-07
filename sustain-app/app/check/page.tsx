'use client';
import { useState } from 'react';
import { Ico } from '@/components/icons';
import { Sheet, Opt, useToast } from '@/components/Sheet';
import { SwipeCard, type Dir } from '@/components/Swipe';
import Top from '@/components/Top';
import { MAT, MatIcon } from '@/components/Mat';
import { fixTags, PILE, pileName, plural } from '@/lib/plain';
import { post, useAppState } from '@/lib/useAppState';

type Step = null | 'options' | 'fix' | 'who';

function Face({ r, item }: { r: any; item?: any }) {
  const t = r.proposed_tags;
  return (<>
    <div className="sc-head"><span className="sc-key">{r.item_key}</span><span className="chip-gate">{r.sent_to ? `With ${r.sent_to}` : 'To review'}</span></div>
    {item && <div className="what">{[item.color, item.garment_type].filter(Boolean).join(' ')}</div>}
    <div className="label-box"><div className="k">The label says</div><div className="v">{r.label_text || 'Nothing could be read'}</div></div>
    <div className="think"><div className="k">Suggested category</div>{t ? <div className="matline"><MatIcon k={t.stream} /><div><div className="big-t">{pileName(t.stream)}</div><div className="why">{MAT[t.stream]?.desc}</div></div></div> : <div className="big-t">Not sure</div>}
      <div className="why" style={{ marginTop: 8 }}>{r.reason}</div></div>
    <div className="ask">Is that right?</div>
  </>);
}

// Checkpoint 1: anything the Intake Agent scored under 0.80 waits here until a person decides. Nothing times out.
export default function Check() {
  const { snap, reload } = useAppState(1000);
  const { toast, say } = useToast();
  const [exit, setExit] = useState<Dir | null>(null);
  const [step, setStep] = useState<Step>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Items already sent to someone stay in the queue, behind the ones nobody has looked at.
  const queue = (snap?.reviews ?? []).filter((r: any) => r.state === 'pending' && !gone.includes(r.review_id))
    .sort((a: any, b: any) => Number(!!a.sent_to) - Number(!!b.sent_to));
  const top = queue[0], nxt = queue[1];
  const running = !!snap?.runs.find((r: any) => r.agent === 'intake' && !r.finished_at);
  const itemOf = (r: any) => snap?.items.find((i: any) => i.item_key === r.item_key);

  const send = async (r: any, body: any, thanks: string, remove = true) => {
    setErr(null); setStep(null);
    try { await post(`/api/reviews/${r.review_id}`, body); if (remove) setGone((g) => [...g, r.review_id]); say(thanks); reload(); }
    catch (e: any) { setErr(e.message); }
    setExit(null);
  };
  const fly = (d: Dir) => {
    if (!top || exit) return;
    setExit(d);
    setTimeout(() => { if (d === 'right') send(top, { decision: 'approve' }, 'Saved. Thank you.'); else { setExit(null); setStep('options'); } }, 220);
  };

  return (<>
    <Top title="Items to review" sub="Labels to review. Swipe right if the suggestion is right, left if not." />
    <main className="page">
      {!snap ? <div className="empty">Loading…</div> : !top ? (
        running
          ? <div className="done"><div className="tick"><span className="spin" style={{ margin: 0 }} /></div><h2>Checking labels</h2><p>Anything that needs a second look appears here.</p></div>
          : <div className="done"><div className="tick">{Ico.check}</div><h2>Nothing to review</h2><p>When a label needs a second look, it shows up here.</p></div>
      ) : (<>
        <div className="count">{plural(queue.length, 'item')} left</div>
        <div className="deck">
          {nxt && <div className="sc next gate"><Face r={nxt} item={itemOf(nxt)} /></div>}
          <SwipeCard key={top.review_id} exit={exit} onDir={fly} canRight={!!top.proposed_tags}><Face r={top} item={itemOf(top)} /></SwipeCard>
        </div>
        <div className="choices three">
          <button className="btn-no" onClick={() => fly('left')}>{Ico.x}<span className="sr">No</span></button>
          <button className="btn-alt" onClick={() => setStep('fix')}>{Ico.wrench}Change this</button>
          <button className="btn-yes" disabled={!top.proposed_tags} onClick={() => fly('right')}>{Ico.check}<span className="sr">Yes</span></button>
        </div>
        <div className="dots">{queue.slice(0, 5).map((_: any, i: number) => <i key={i} className={i === 0 ? 'on' : ''} />)}</div>
      </>)}
      {err && <p className="err">{err}</p>}
    </main>

    {step === 'options' && top && (
      <Sheet title="Not right. What now?" sub={`${top.item_key}: choose a way forward.`} onClose={() => setStep(null)}>
        <Opt icon={Ico.person} tone="warn" title="Send to someone" help="They decide. It stays here until someone answers." onClick={() => setStep('who')} />
        <Opt icon={Ico.trash} tone="bad" title="Delete from pile" help="It is left out of the batch" onClick={() => send(top, { decision: 'reject' }, 'Deleted from the pile.')} />
      </Sheet>)}
    {step === 'fix' && top && (
      <Sheet title="Which pile is it?" sub={`${top.item_key} — ${top.label_text || 'no label text'}`} onClose={() => setStep(null)}>
        {Object.entries(PILE).map(([k, v]) => (
          <Opt key={k} icon={Ico.label} tone={k === 'trash' ? 'bad' : ''} title={v.name} help={v.help}
            onClick={() => send(top, { decision: 'edit', tags: fixTags(top.proposed_tags, k) }, `Saved as ${v.name.toLowerCase()}.`)} />))}
      </Sheet>)}
    {step === 'who' && top && (
      <Sheet title="Who should decide?" sub={`${top.item_key} stays in the queue until they answer.`} onClose={() => setStep('options')}>
        {(snap?.people ?? []).map((p: any) => (
          <Opt key={p.name} icon={Ico.person} title={p.name} onClick={() => send(top, { decision: 'send', to: p.name }, `Sent to ${p.name}.`, false)} />))}
      </Sheet>)}
    {toast}
  </>);
}
