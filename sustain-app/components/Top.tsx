import Link from 'next/link';
import { Ico } from './icons';

// The only chrome on a task screen: a big way back and the screen's name.
export default function Top({ title }: { title: string }) {
  return (<header className="top"><Link href="/" className="back">{Ico.back}Home</Link><h1>{title}</h1></header>);
}
