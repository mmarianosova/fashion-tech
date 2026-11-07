'use client';
import Link from 'next/link';
import { Ico } from '@/components/icons';
import Top from '@/components/Top';
import { post, useAppState } from '@/lib/useAppState';
import { fmtDate } from '@/lib/plain';

const TITLE: Record<string, string> = { donate_recycle_due: 'Pickup ready', review_waiting: 'Needs a decision', dispute_deadline: 'Deadline coming', delay_risk: 'Possible delay', question: 'A question for you' };
const icon = (t: string) => (t === 'question' ? [Ico.question, 'n-ask'] : t === 'donate_recycle_due' ? [Ico.truck, 'n-ok'] : [Ico.flag, 'n-warn']);

export default function Messages() {
  const { snap, reload } = useAppState(1500);
  const mine: any[] = snap?.alerts ?? [];
  const unread = mine.filter((a: any) => !a.is_read).length;
  return (<>
    <Top title="Messages" />
    <main className="page">
      {!snap ? <div className="empty">Loading…</div> : mine.length === 0 ? (
        <div className="done"><div className="tick">{Ico.bell}</div><h2>No messages</h2><p>Messages from the agents and your team show up here.</p></div>
      ) : (<>
        {unread > 0 && <button className="big" style={{ marginBottom: 12 }} onClick={async () => { await post('/api/alerts/read'); reload(); }}>Mark {unread} as read</button>}
        {mine.map((a: any) => { const [ic, tone] = icon(a.type) as [any, string]; return (
          <div key={a.alert_id} className={`note ${a.is_read ? '' : 'unread'}`}>
            <div className={`note-ico ${tone}`}>{ic}</div>
            <div><h4>{TITLE[a.type] ?? 'Message'}</h4><p>{a.summary}</p>
              {a.deadline && <p className="nx">By {fmtDate(a.deadline)}</p>}
              <p className="nx">{a.next_step}</p>
              {a.type === 'question' && <Link className="open" href={/pickup/i.test(a.summary) ? '/pickups' : '/check'}>Open</Link>}</div>
          </div>); })}
      </>)}
    </main>
  </>);
}
