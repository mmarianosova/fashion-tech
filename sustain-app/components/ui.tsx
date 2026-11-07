import type { ReactNode } from 'react';

export const Pill = ({ v }: { v: string }) => <span className={`pill p-${v}`}>{v}</span>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const Metric = ({ n, label, sub, tone = '' }: { n: ReactNode; label: string; sub?: string; tone?: string }) =>
  <div className={`metric ${tone}`}><label>{label}</label><b>{n}</b>{sub && <small>{sub}</small>}</div>;

export function Hero({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub: string; children?: ReactNode }) {
  return (<div className="hero"><div className="hero-in"><div className="grow"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{sub}</p></div>{children}</div></div>);
}

export const Dot = ({ g }: { g: string }) => <span className={`sw sw-${g}`} />;
export const StreamChip = ({ s }: { s: string }) => <span className={`chip c-${s}`}>{s}</span>;
export function Tags({ t }: { t: any }) {
  if (!t) return null;
  return (<span><StreamChip s={t.stream} /><span className="chip">{t.fibre_type}</span><span className="chip"><Dot g={t.color_group} />{t.color_group}</span><span className="chip">{t.condition}</span></span>);
}
export const Conf = ({ v }: { v: number | null }) => v == null ? null : (
  <span className="conf">{v.toFixed(2)}<span className="bar"><i style={{ width: `${v * 100}%`, background: v >= 0.8 ? 'var(--green)' : v >= 0.55 ? 'var(--gate)' : 'var(--red)' }} /></span></span>);
export const tagText = (t: any) => (t ? `${t.stream} / ${t.fibre_type} / ${t.color_group} / ${t.condition}` : '');

export function Feed({ events }: { events: any[] }) {
  if (!events?.length) return <Empty>No agent activity yet.</Empty>;
  return (<div className="feed">{events.map((e) => {
    const pl = e.payload ?? {};
    const what = pl.name ? `${pl.name}(${pl.input?.item_key ?? pl.input?.batch_id ?? pl.input?.today ?? (pl.input?.items ? pl.input.items.length + ' items' : '')})`
      : pl.tool ? `approval requested: ${String(pl.tool).split('__').pop()}` : (pl.status ?? '');
    return <div key={e.id}>{e.created_at.slice(11, 19)}  <b>{e.type}</b>  {what}</div>;
  })}</div>);
}
