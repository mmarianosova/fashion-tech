'use client';
import { useEffect, useState, type ReactNode } from 'react';

export function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  return (<div className="sheet-bg" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
    <div className="sheet" onClick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>{sub && <p className="s">{sub}</p>}
      {children}
      <button className="cancel" onClick={onClose}>Go back</button>
    </div></div>);
}

export function Opt({ icon, title, help, tone = '', onClick }: { icon: ReactNode; title: string; help?: string; tone?: '' | 'warn' | 'bad'; onClick: () => void }) {
  return (<button className={`opt ${tone}`} onClick={onClick}><span className="ic">{icon}</span><span><b>{title}</b>{help && <span className="d">{help}</span>}</span></button>);
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);
  return { toast: msg ? <div className="toast" role="status">{msg}</div> : null, say: setMsg };
}
