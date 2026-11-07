'use client';
import { post, useAppState } from '@/lib/useAppState';
import { Empty, Hero, Metric } from '@/components/ui';

const CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>;
const FLAG = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>;
const TITLE: Record<string, string> = { donate_recycle_due: 'Pickup ready', review_waiting: 'Needs your attention', dispute_deadline: 'Deadline approaching', delay_risk: 'Delay risk' };

export default function Alerts() {
  const { snap, reload } = useAppState();
  if (!snap) return <main><Empty>Loading...</Empty></main>;
  const unread = snap.alerts.filter((a: any) => !a.is_read).length;
  const active = snap.runs.filter((r: any) => !r.finished_at);
  return (<>
    <Hero eyebrow="Step 4 | Notify" title={unread ? `${unread} new alert${unread > 1 ? 's' : ''}` : 'Alerts'} sub="What the responsible person receives, and what the agents are costing.">
      <button className="alt" disabled={!unread} onClick={async () => { await post('/api/alerts/read'); reload(); }}>Mark all read</button>
    </Hero>
    <main className="pull">
      <div className="metrics">
        <Metric label="ZooWork balance" n={snap.balance != null ? `$${Number(snap.balance).toFixed(2)}` : 'n/a'} sub={snap.mode === 'fake' ? 'demo mode, no spend' : 'prepaid credit'} tone="m-green" />
        <Metric label="Alerts sent" n={snap.alerts.length} sub={`${unread} unread`} />
        <Metric label="Runs" n={snap.runs.length} sub={`${active.length} running now`} tone="m-violet" />
      </div>
      {active.length > 0 && <div className="card row">{active.map((r: any) => <button key={r.session_id} className="no" onClick={async () => { await post('/api/stop', { session_id: r.session_id }); reload(); }}>Stop {r.agent} run</button>)}</div>}
      <h2>Inbox</h2>
      {snap.alerts.length === 0 ? <Empty>No alerts yet. Run the Disposition review.</Empty> : snap.alerts.map((a: any) => (
        <div key={a.alert_id} className={`note ${a.is_read ? '' : 'unread'}`}>
          <div className={`note-ico ${a.type === 'review_waiting' ? 'n-warn' : 'n-ok'}`}>{a.type === 'review_waiting' ? FLAG : CHECK}</div>
          <div><h4>{TITLE[a.type] ?? a.type}: {a.summary}</h4>
            <p>Items: {a.items.join(', ')}{a.location ? ` | ${a.location}` : ''}{a.deadline ? ` | by ${a.deadline}` : ''}</p>
            <p className="nx">Next step: {a.next_step}</p></div>
        </div>))}
      <h2>Runs</h2>
      <div className="tbl"><table><thead><tr><th>Agent</th><th>Started</th><th>Status</th><th>Session</th></tr></thead>
        <tbody>{snap.runs.map((r: any) => <tr key={r.session_id}><td className="key">{r.agent}</td><td>{r.started_at.slice(11, 19)}</td><td>{r.finished_at ? (r.status ?? 'done') : 'running'}</td><td className="sub">{r.session_id}</td></tr>)}</tbody></table></div>
    </main>
  </>);
}
