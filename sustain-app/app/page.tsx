'use client';
import Link from 'next/link';
import { Ico } from '@/components/icons';
import { useAppState } from '@/lib/useAppState';
import { fmtDate, plural, routeName } from '@/lib/plain';

// Home: what is waiting for you, and a short list to browse everything else.
export default function Home() {
  const { snap } = useAppState();
  if (!snap) return <div className="hello"><div className="eyebrow"><span className="brand"><span className="logo" />Textile Flow</span></div><h1>Loading…</h1></div>;

  const reviews = snap.reviews.filter((r: any) => r.state === 'pending').length;
  const pend = snap.approvals.filter((a: any) => a.state === 'pending');
  const approvals = pend.length;
  const unread = snap.alerts.filter((a: any) => !a.is_read).length;
  const needs = reviews + approvals;
  const first = reviews ? '/check' : '/pickups';
  const pi = pend[0]?.input;
  const partner = pi && snap.recyclers.find((r: any) => r.id === pi.partner_id);
  const nPick = (snap.pickups?.length ?? 0) + approvals;
  const Tile = ({ href, ic, t, d, n }: any) => (<Link href={href} className="tile"><span className="ic">{ic}</span><span><b>{t}</b><span className="d">{d}</span></span><span className={`n ${n ? '' : 'zero'}`}>{n}</span></Link>);
  const Row = ({ href, ic, t, d }: any) => (<Link href={href}><span className="bi">{ic}</span><span><b>{t}</b><span className="d">{d}</span></span><span className="go">{Ico.chev}</span></Link>);

  return (<>
    <div className="hello"><div className="eyebrow"><span className="brand"><span className="logo" />Textile Flow</span><span className="date">{fmtDate(snap.today)}</span></div>
      <h1>{needs > 0 ? `${plural(needs, 'item')} to review` : 'All caught up'}</h1></div>
    <main className="page">
      <Tile href="/check" ic={Ico.label} t="Labels to review" d={reviews ? 'Fibre content we could not read' : 'Nothing waiting'} n={reviews} />
      <Tile href="/pickups" ic={Ico.truck} t="Pickups to review" d={pi ? `${routeName(pi.route)}${partner ? ', ' + partner.name.replace(' (fictional)', '') : ''}` : 'Nothing waiting'} n={approvals} />
      {needs > 0
        ? <Link href={first} className="big">Start reviewing</Link>
        : <div className="need ok">{Ico.check}<span>You are all caught up<small>Nothing is waiting for you</small></span></div>}
      <div className="sect">Browse</div>
      <div className="browse">
        <Row href="/check" ic={Ico.label} t="All labels" d={`${snap.items.length} in today’s batch`} />
        <Row href="/pickups" ic={Ico.truck} t="All pickups" d={nPick ? plural(nPick, 'pickup') : 'None yet'} />
        <Row href="/messages" ic={Ico.bell} t="Messages" d={unread ? plural(unread, 'new alert') : 'No new alerts'} />
        <Row href="/guide" ic={Ico.book} t="Pile guide" d="What goes where" />
        <Row href="/history" ic={Ico.clock} t="History" d="Past decisions you can change" />
      </div>
      <div className="foot"><Link href="/team">For the tech team</Link></div>
    </main>
  </>);
}
