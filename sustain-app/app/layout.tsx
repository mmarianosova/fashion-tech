import './globals.css';
export const metadata = { title: 'Textile Flow', description: 'Check clothing labels, sort garments, and approve pickups' };
export const viewport = { width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><div className="app">{children}</div></body></html>);
}
