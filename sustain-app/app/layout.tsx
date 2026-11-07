import './globals.css';
import Nav from '@/components/Nav';
export const metadata = { title: 'Textile Sustainability Flow', description: 'Scan labels, sort garments, notify people' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><Nav /><main>{children}</main></body></html>);
}
