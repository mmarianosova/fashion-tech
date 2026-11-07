import Top from '@/components/Top';
import { MAT, MatIcon } from '@/components/Mat';

// What each pile means and what happens to it.
export default function Guide() {
  return (<>
    <Top title="Pile guide" sub="What each pile means and what happens to it." />
    <main className="page">{Object.entries(MAT).map(([k, m]) => (
      <div className="gcard" key={k}><MatIcon k={k} /><div><b>{m.name}</b><p>{m.desc}</p><small>For example: {m.eg}</small></div></div>))}</main>
  </>);
}
