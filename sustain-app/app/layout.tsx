import './globals.css';
import Nav from '@/components/Nav';
export const metadata = { title: 'Textile Flow', description: 'Scan labels, sort garments, notify people' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><div className="shell"><Nav /><div className="content">{children}</div></div></body></html>);
}
