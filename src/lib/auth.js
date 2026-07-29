import crypto from "crypto";

// No auth library dependency — just Node's built-in crypto.
// Passwords: scrypt with a random salt, stored as "salt:hash".
// Session cookie: "restaurantId.expiry.signature", HMAC-signed so it can't be forged.

const SECRET = process.env.ADMIN_SESSION_SECRET || "tabletap-dev-secret-change-me";
const COOKIE_NAME = "admin_token";
const SESSION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

export function createSessionToken(restaurantId) {
  const expiry = Date.now() + SESSION_MS;
  const payload = `${restaurantId}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token, restaurantId) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [tokRestaurantId, expiryStr, signature] = parts;
  const payload = `${tokRestaurantId}.${expiryStr}`;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  if (tokRestaurantId !== restaurantId) return false;
  if (Date.now() > Number(expiryStr)) return false;
  return true;
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_COOKIE_MAX_AGE = Math.floor(SESSION_MS / 1000);