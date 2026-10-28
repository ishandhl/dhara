// Edge-safe session helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'dairy_session';
const key = () => {
  const secret = process.env.AUTH_SECRET;
  // A missing or short secret would let anyone forge a login on the live site.
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build' && (!secret || secret.length < 32 || secret === 'change-me')) {
    throw new Error('AUTH_SECRET must be set to a random string of at least 32 characters');
  }
  return new TextEncoder().encode(secret || 'dev-secret');
};

export async function signSession(payload) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(key());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload;
  } catch {
    return null;
  }
}
