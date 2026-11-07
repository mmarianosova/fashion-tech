'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppState } from '@/lib/useAppState';

export default function Nav() {
  const path = usePathname();
  const { snap } = useAppState(2000);
  const pendRev = snap?.reviews.filter((r: any) => r.state === 'pending').length ?? 0;
  const pendApp = snap?.approvals.filter((r: any) => r.state === 'pending').length ?? 0;
  const unread = snap?.alerts.filter((a: any) => !a.is_read).length ?? 0;
  const L = (href: string, label: string, n = 0) => (
    <Link href={href} className={path === href ? 'on' : ''}>{label}{n > 0 && <span className="badge">{n}</span>}</Link>);
  return (
    <nav><b>Textile Sustainability Flow</b>
      {L('/', '1 Intake')}{L('/review', '2 Review', pendRev)}{L('/disposition', '3 Disposition', pendApp)}{L('/alerts', '4 Alerts and cost', unread)}
      <span className="mode">{snap ? `mode: ${snap.mode} | today: ${snap.today}` : 'loading'}</span>
    </nav>);
}
