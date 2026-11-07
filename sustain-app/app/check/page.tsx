'use client';
import { useState } from 'react';
import type { Tags } from '@/lib/rules';
import { Ico } from '@/components/icons';
import { Sheet, Opt, useToast } from '@/components/Sheet';
import { SwipeCard, type Dir } from '@/components/Swipe';
import Top from '@/components/Top';
import { fixTags, PILE, pileName, plural } from '@/lib/plain';
import { post, useAppState } from '@/lib/useAppState';

type Step = null | 'options' | 'fix' | 'who';

function Face({ r, item }: { r: any; item?: any }) {
  const t = r.proposed_tags;
  return (<>
    <div className="sc-head"><span className="sc-key">{r.item_key}</span><span className="chip-gate">{r.sent_to ? `With ${r.sent_to}` : 'Needs a look'}</span></div>
    {item && <div className="what">{[item.color, item.garment_type].filter(Boolean).join(' ')}</div>}
    <div className="label-box"><div className="k">The label says</div><div className="v">{r.label_text || 'Nothing could be read'}</div></div>
    <div className="think"><div className="k">The agent thinks</div><div className="big-t">{t ? pileName(t.stream) : 'It is not sure'}</div>
      <div className="why">{r.reason}</div></div>
    <div className="ask">Is that right?</div>
  </>);
}

function CatalogCorrection({ tags, onSave }: { tags: Tags; onSave: (tags: Tags) => void }) {
  const [draft, setDraft] = useState(tags);
  const choices = {
    stream: Object.keys(PILE),
    color_group: ['whites', 'darks', 'brights', 'mixed'],
    condition: ['wearable', 'damaged', 'unusable'],
  };
  return <form onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
    {(Object.keys(choices) as (keyof typeof choices)[]).map((field) => (
      <p key={field}><label>{field.replace('_', ' ')}{' '}
        <select required value={draft[field] === 'unknown' ? '' : draft[field]}
          onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}>
          <option value="" disabled>Choose</option>
          {choices[field].map((value) => <option key={value} value={value}>{field === 'stream' ? pileName(value) : value}</option>)}
        </select>
      </label></p>
    ))}
    <p><label>Fibre <input required value={draft.fibre_type}
      onChange={(e) => setDraft({ ...draft, fibre_type: e.target.value })} /></label></p>
    <button className="big go" type="submit">Save corrections</button>
  </form>;
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
  const canApprove = !!top?.proposed_tags && top.proposed_tags.condition !== 'unknown';
  const workbook = top?.evidence?.workbook;
  const running = !!snap?.runs.find((r: any) => r.agent === 'intake' && !r.finished_at);
  const itemOf = (r: any) => snap?.items.find((i: any) => i.item_key === r.item_key);

  const send = async (r: any, body: any, thanks: string, remove = true) => {
    setErr(null); setStep(null);
    try { await post(`/api/reviews/${r.review_id}`, body); if (remove) setGone((g) => [...g, r.review_id]); say(thanks); reload(); }
    catch (e: any) { setErr(e.message); }
    setExit(null);
  };
  const fly = (d: Dir) => {
    if (!top || exit || (d === 'right' && !canApprove)) return;
    setExit(d);
    setTimeout(() => { if (d === 'right') send(top, { decision: 'approve' }, 'Saved. Thank you.'); else { setExit(null); setStep('options'); } }, 220);
  };

  return (<>
    <Top title="Check labels" />
    <main className="page">
      {!snap ? <div className="empty">Loading…</div> : !top ? (
        running
          ? <div className="done"><div className="tick"><span className="spin" style={{ margin: 0 }} /></div><h2>Still reading labels</h2><p>Your next card appears here as soon as the agent is unsure about one.</p></div>
          : <div className="done"><div className="tick">{Ico.check}</div><h2>Nothing to check</h2><p>When the agent is unsure about a label, it shows up here.</p></div>
      ) : (<>
        <div className="count">{plural(queue.length, 'card')} left</div>
        <div className="deck">
          {nxt && <div className="sc next gate"><Face r={nxt} item={itemOf(nxt)} /></div>}
          <SwipeCard key={top.review_id} exit={exit} onDir={fly} canRight={canApprove}><Face r={top} item={itemOf(top)} /></SwipeCard>
        </div>
        <div className="choices">
          <button className="btn-no" onClick={() => fly('left')}>{Ico.x}Not right</button>
          <button className="btn-yes" disabled={!canApprove} onClick={() => fly('right')}>{Ico.check}Yes, right</button>
        </div>
        <p className="hint">{canApprove ? 'Swipe right to approve, or left to see other options.' : 'Use Not right to record the item’s condition or choose another action.'}</p>
        {workbook && <details>
          <summary>Catalog evidence</summary>
          {/^https:\/\/(drive|docs)\.google\.com\//.test(workbook.sourceUrl) &&
            <a href={workbook.sourceUrl} target="_blank" rel="noreferrer">Open workbook</a>}
          <ul>{workbook.rows.map((row: { sheet: string; row: number; composition?: string; color?: string }) =>
            <li key={`${row.sheet}:${row.row}`}>{row.sheet}, row {row.row} {[row.composition, row.color].filter(Boolean).join(' · ')}</li>)}</ul>
          <p>Website lookup {top.evidence.lookup.status.replaceAll('_', ' ')}</p>
        </details>}
      </>)}
      {err && <p className="err">{err}</p>}
    </main>

    {step === 'options' && top && (
      <Sheet title="What should we do with it?" sub={`${top.item_key}: choose a way forward.`} onClose={() => setStep(null)}>
        <Opt icon={Ico.wrench} title="Change it" help={workbook ? "Record the correct tags and condition" : "Pick the right pile"} onClick={() => setStep('fix')} />
        <Opt icon={Ico.person} tone="warn" title="Send to someone" help="They decide. It stays here until someone answers." onClick={() => setStep('who')} />
        <Opt icon={Ico.trash} tone="bad" title="Take it out of this batch" help="The agent skips this item" onClick={() => send(top, { decision: 'reject' }, 'Taken out of the batch.')} />
      </Sheet>)}
    {step === 'fix' && top && workbook && (
      <Sheet title="Correct the tags" sub={top.item_key} onClose={() => setStep('options')}>
        <CatalogCorrection key={top.review_id} tags={top.proposed_tags}
          onSave={(tags) => send(top, { decision: 'edit', tags }, 'Corrections saved.')} />
      </Sheet>)}
    {step === 'fix' && top && !workbook && (
      <Sheet title="Which pile is it?" sub={`${top.item_key} — ${top.label_text || 'no label text'}`} onClose={() => setStep('options')}>
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
