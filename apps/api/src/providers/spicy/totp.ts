import { createHmac } from 'node:crypto';

/** HOTP (RFC 4226) — brique de base du TOTP. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const truncated =
    ((hmac[offset]! & 0x7f) << 24) | ((hmac[offset + 1]! & 0xff) << 16) | ((hmac[offset + 2]! & 0xff) << 8) | (hmac[offset + 3]! & 0xff);

  return String(truncated % 10 ** digits).padStart(digits, '0');
}

/** TOTP (RFC 6238), SHA-1, période par défaut 30s. */
export function totp(secret: Buffer, timeMs: number = Date.now(), periodSec = 30, digits = 6): string {
  const counter = Math.floor(timeMs / 1000 / periodSec);
  return hotp(secret, counter, digits);
}
