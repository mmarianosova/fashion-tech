export const Pill = ({ v }: { v: string }) => <span className={`pill p-${v}`}>{v}</span>;
export const Stat = ({ n, label }: { n: number | string; label: string }) => <div className="stat"><b>{n}</b><span>{label}</span></div>;
export const Empty = ({ children }: { children: React.ReactNode }) => <div className="empty">{children}</div>;
export const tagText = (t: any) => (t ? `${t.stream} / ${t.fibre_type} / ${t.color_group} / ${t.condition}` : '');
export function Feed({ events }: { events: any[] }) {
  if (!events?.length) return <Empty>No agent activity yet.</Empty>;
  return (<div className="feed">{events.map((e) => {
    const pl = e.payload ?? {};
    const what = pl.name ? `${pl.name}(${pl.input?.item_key ?? pl.input?.batch_id ?? pl.input?.today ?? (pl.input?.items ? pl.input.items.length + ' items' : '')})`
      : pl.tool ? `approval requested: ${String(pl.tool).split('__').pop()}` : (pl.status ?? '');
    return <div key={e.id}>{e.created_at.slice(11, 19)}  {e.type}  {what}</div>;
  })}</div>);
}
