// Standard Webhooks verification (HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`), +/-300 s tolerance.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhook(secret: string, headers: { id?: string | null; timestamp?: string | null; signature?: string | null },
  rawBody: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((part) => {
    const [ver, sig] = part.split(',');
    if (ver !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
