'use client';
import { useCallback, useEffect, useState } from 'react';

export type Snap = any;
export function useAppState(intervalMs = 1200) {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const r = await fetch('/api/state', { cache: 'no-store' }); setSnap(await r.json()); setError(null); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => {
    load(); const t = setInterval(load, intervalMs);
    const pump = setInterval(() => fetch('/api/pump', { method: 'POST' }).catch(() => null), 3000); // real-mode fallback poller
    return () => { clearInterval(t); clearInterval(pump); };
  }, [load, intervalMs]);
  return { snap, error, reload: load };
}

export async function post(url: string, body?: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
