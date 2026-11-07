// Plain-language wording for the screens. Keep jargon out: people using this have little tech experience.
export const PILE: Record<string, { name: string; help: string }> = {
  shred: { name: 'Shred pile', help: 'mostly natural fibres, like cotton' },
  denim: { name: 'Denim pile', help: 'jeans and denim' },
  mixed: { name: 'Mixed pile', help: 'mixed or man-made fabric' },
  trash: { name: 'Throw away', help: 'cannot be reused' },
};
export const pileName = (s?: string) => PILE[s ?? '']?.name ?? 'Not sure';

export const ROUTE: Record<string, string> = {
  donate: 'Donation', recycle_shred: 'Fabric shredding', recycle_denim: 'Denim recycling', recycle_mixed: 'Mixed fabric recycling', dispose: 'Disposal',
};
export const routeName = (r?: string) => ROUTE[r ?? ''] ?? String(r ?? '').replace('_', ' ');

export const fmtDate = (d?: string) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// What the user can do with a held item, from the "fix it" screen.
export function fixTags(base: any, stream: string) {
  const b = base ?? { fibre_type: 'blend', color_group: 'mixed', condition: 'damaged' };
  return { stream, fibre_type: !b.fibre_type || b.fibre_type === 'unknown' ? 'blend' : b.fibre_type, color_group: b.color_group ?? 'mixed',
    condition: stream === 'trash' ? 'unusable' : b.condition === 'unusable' ? 'damaged' : b.condition ?? 'damaged' };
}
