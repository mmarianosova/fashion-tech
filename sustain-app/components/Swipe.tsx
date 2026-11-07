'use client';
import { useState, type ReactNode } from 'react';

export type Dir = 'left' | 'right';

// A card you can drag. Right = yes, left = not right. `exit` lets the parent fly it away when a button is tapped instead.
export function SwipeCard({ children, exit, onDir, canRight = true, gate = true }:
  { children: ReactNode; exit: Dir | null; onDir: (d: Dir) => void; canRight?: boolean; gate?: boolean }) {
  const [dx, setDx] = useState(0);
  const [x0, setX0] = useState<number | null>(null);
  const dragging = x0 !== null;
  const x = exit === 'right' ? 560 : exit === 'left' ? -560 : dx;
  const yes = Math.min(1, Math.max(0, x / 90)), no = Math.min(1, Math.max(0, -x / 90));
  return (
    <div className={`sc ${gate ? 'gate' : ''}`}
      style={{ transform: `translateX(${x}px) rotate(${x / 24}deg)`, transition: dragging ? 'none' : 'transform .22s ease-out' }}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button')) return; setX0(e.clientX); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (x0 !== null) setDx(e.clientX - x0); }}
      onPointerUp={() => { if (x0 === null) return; const d = dx; setX0(null); setDx(0); if (d > 90 && canRight) onDir('right'); else if (d < -90) onDir('left'); }}
      onPointerCancel={() => { setX0(null); setDx(0); }}>
      <span className="stamp yes" style={{ opacity: yes }}>YES</span>
      <span className="stamp no" style={{ opacity: no }}>NOT RIGHT</span>
      {children}
    </div>);
}
