'use client';
import { post, useAppState } from '@/lib/useAppState';
import { Empty, Pill, Stat } from '@/components/ui';

export default function Alerts() {
  const { snap, reload } = useAppState();
  if (!snap) return <Empty>Loading...</Empty>;
  const unread = snap.alerts.filter((a: any) => !a.is_read).length;
  const active = snap.runs.filter((r: any) => !r.finished_at);
  return (<>
    <h1>4. Alerts and cost</h1>
    <p className="sub">What the responsible person receives, and what the agents are costing.</p>
    <div className="card row">
      <Stat n={snap.balance != null ? `$${Number(snap.balance).toFixed(2)}` : 'n/a'} label="ZooWork balance" />
      <Stat n={snap.runs.length} label="recent runs" /><Stat n={active.length} label="running now" />
      {active.map((r: any) => <button key={r.session_id} className="no" onClick={async () => { await post('/api/stop', { session_id: r.session_id }); reload(); }}>Stop {r.agent} run</button>)}
    </div>
    <div className="row"><h2 className="grow">Inbox {unread > 0 && <span className="badge">{unread}</span>}</h2>
      <button className="alt" disabled={!unread} onClick={async () => { await post('/api/alerts/read'); reload(); }}>Mark all read</button></div>
    {snap.alerts.length === 0 ? <Empty>No alerts yet. Run the Disposition review.</Empty> : snap.alerts.map((a: any) => (
      <div key={a.alert_id} className={`card ${a.is_read ? '' : 'alert-unread'}`}>
        <div className="row"><Pill v={a.type === 'review_waiting' ? 'pending' : 'sent'} /><b>[{a.type.toUpperCase()}] {a.summary}</b></div>
        <p style={{ margin: '6px 0' }}>Items: {a.items.join(', ')}{a.location ? ` | Location: ${a.location}` : ''}{a.deadline ? ` | Deadline: ${a.deadline}` : ''}</p>
        <p style={{ margin: 0 }}><b>Next step:</b> {a.next_step}</p>
      </div>))}
    <h2>Runs</h2>
    <div className="card" style={{ padding: 0 }}><table><thead><tr><th>Agent</th><th>Started</th><th>Status</th><th>Session</th></tr></thead>
      <tbody>{snap.runs.map((r: any) => <tr key={r.session_id}><td>{r.agent}</td><td>{r.started_at.slice(11, 19)}</td><td>{r.finished_at ? (r.status ?? 'done') : 'running'}</td><td>{r.session_id}</td></tr>)}</tbody></table></div>
  </>);
}
