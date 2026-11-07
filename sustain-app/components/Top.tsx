import Link from 'next/link';
import { Ico } from './icons';

// The only chrome on a task screen: a way back to Home, the screen's name and one line saying what it is for.
export default function Top({ title, sub }: { title: string; sub?: string }) {
  return (<header className="top"><Link href="/" className="back" aria-label="Back to Home">{Ico.back}</Link><div><h1>{title}</h1>{sub && <p className="lede">{sub}</p>}</div></header>);
}
