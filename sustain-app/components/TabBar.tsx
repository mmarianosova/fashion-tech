'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ico } from './icons';
import { useAppState } from '@/lib/useAppState';

// Floating pill tab bar. A dot marks a tab that has something waiting.
export default function TabBar() {
  const path = usePathname();
  const { snap } = useAppState(3000);
  const rv = snap ? snap.reviews.filter((r: any) => r.state === 'pending').length : 0;
  const ap = snap ? snap.approvals.filter((a: any) => a.state === 'pending').length : 0;
  const un = snap ? snap.alerts.filter((a: any) => !a.is_read).length : 0;
  const tabs = [['/', Ico.home, 'Home', 0], ['/check', Ico.label, 'Labels', rv], ['/pickups', Ico.truck, 'Pickups', ap], ['/messages', Ico.bell, 'Messages', un], ['/history', Ico.clock, 'History', 0]] as const;
  return (<nav className="tabbar" aria-label="Main">{tabs.map(([href, ic, label, n]) => {
    const on = href === '/' ? path === '/' : path.startsWith(href);
    return (<Link key={href} href={href} className={on ? 'on' : ''} aria-label={label} aria-current={on ? 'page' : undefined}>{ic}{on ? label : ''}{n > 0 && !on ? <i className="pip" /> : null}</Link>);
  })}</nav>);
}
