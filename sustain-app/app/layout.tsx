import './globals.css';
import '@/components/icons';
import TabBar from '@/components/TabBar';
export const metadata = { title: 'Sortix', description: 'Review labels and pickups for your textile batch' };
export const viewport = { width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com" /></head><body><div className="app"><div className="scroll">{children}</div><TabBar /></div></body></html>);
}
