'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppState } from '@/lib/useAppState';

const I = {
  scan: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16"/></svg>,
  review: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>,
  route: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/></svg>,
  bell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>,
  logo: <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c4 3 6 6 6 9a6 6 0 0 1-12 0c0-3 2-6 6-9Z"/><path d="M12 21v-8"/></svg>,
};

export default function Nav() {
  const path = usePathname();
  const { snap } = useAppState(2000);
  const pendRev = snap?.reviews.filter((r: any) => r.state === 'pending').length ?? 0;
  const pendApp = snap?.approvals.filter((r: any) => r.state === 'pending').length ?? 0;
  const unread = snap?.alerts.filter((a: any) => !a.is_read).length ?? 0;
  const L = (href: string, label: string, icon: React.ReactNode, n = 0) => (
    <Link href={href} className={path === href ? 'on' : ''}>{icon}<span>{label}</span>{n > 0 && <span className="badge">{n}</span>}</Link>);
  return (
    <aside className="side">
      <div className="brand"><div className="logo">{I.logo}</div>Textile Flow</div>
      {L('/', 'Intake', I.scan)}{L('/review', 'Review', I.review, pendRev)}{L('/disposition', 'Disposition', I.route, pendApp)}{L('/alerts', 'Alerts', I.bell, unread)}
      <div className="sp" />
      <div className="meta">{snap ? `${snap.mode === 'fake' ? 'Demo agents' : 'ZooWork agents'} | ${snap.today}` : 'loading'}</div>
    </aside>);
}
