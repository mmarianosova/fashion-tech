import type { ReactNode } from 'react';

// One icon and one plain sentence per category. Shared by the pickup card, label card and Pile guide.
export const MAT: Record<string, { name: string; desc: string; eg: string; ic: ReactNode }> = {
  shred: { name: 'Shred pile', desc: 'Mostly natural fibres such as cotton or wool. Shredded back into loose fibre for stuffing, insulation and new yarn.', eg: 'T-shirts, sweaters, towels', ic: <><path d="M4 7c3-2 5 2 8 0s5-1 8 0" /><path d="M4 12c3-2 5 2 8 0s5-1 8 0" /><path d="M4 17c3-2 5 2 8 0s5-1 8 0" /></> },
  denim: { name: 'Denim pile', desc: 'Jeans and other denim. The cotton is strong, so denim is recycled on its own and spun into new fibre.', eg: 'Jeans, denim jackets, denim shorts', ic: <><path d="M7 3h10l1 18h-5l-1-9-1 9H6z" /><path d="M7 7h10" /></> },
  mixed: { name: 'Mixed pile', desc: 'Blends and man-made fabric such as polyester or nylon. Sent to recyclers that can separate mixed fibres.', eg: 'Leggings, fleece, polyester dresses', ic: <><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></> },
  trash: { name: 'Throw away', desc: 'Too damaged or dirty to reuse or recycle. Disposed of safely.', eg: 'Mouldy, soaked or badly torn items', ic: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /> },
  donate: { name: 'Donation', desc: 'Clean items in good, wearable condition. Passed to a charity partner to be worn again.', eg: 'Wearable tops, coats, accessories', ic: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.6-7 10-7 10z" /> },
};
export const ROUTE_MAT: Record<string, string> = { donate: 'donate', recycle_shred: 'shred', recycle_denim: 'denim', recycle_mixed: 'mixed', dispose: 'trash' };
const key = (k?: string) => (k && MAT[k] ? k : 'mixed');

// Material icon tile. If an item has a photo in the dataset, pass it as `src` and the photo is shown instead.
export function MatIcon({ k, small, src }: { k?: string; small?: boolean; src?: string | null }) {
  const m = MAT[key(k)];
  return (<span className={`mat m-${key(k)} ${small ? 's' : ''}`}>{src ? <img src={src} alt="" /> :
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{m.ic}</svg>}</span>);
}
