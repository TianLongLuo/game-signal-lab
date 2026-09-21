import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_N = 131_072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_BYTES = 1024;

export function validatePassword(password) {
  if (typeof password !== "string") throw new TypeError("password must be a string");
  const byteLength = Buffer.byteLength(password, "utf8");
  if (password.length < PASSWORD_MIN_LENGTH || byteLength > PASSWORD_MAX_BYTES) {
    throw new RangeError(
      `password must be at least ${PASSWORD_MIN_LENGTH} characters and at most ${PASSWORD_MAX_BYTES} UTF-8 bytes`
    );
  }
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    Buffer.from(derived).toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const [algorithm, nRaw, rRaw, pRaw, saltRaw, hashRaw, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || extra !== undefined) return false;

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    N < 2 ||
    N > 1_048_576 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16
  ) {
    return false;
  }

  let salt;
  let expected;
  try {
    salt = Buffer.from(saltRaw, "base64url");
    expected = Buffer.from(hashRaw, "base64url");
  } catch {
    return false;
  }
  if (salt.length < 16 || expected.length < 32 || expected.length > 128) return false;

  try {
    const actual = Buffer.from(
      await scrypt(password, salt, expected.length, {
        N,
        r,
        p,
        maxmem: Math.max(SCRYPT_MAX_MEMORY, 128 * N * r + 1024 * 1024),
      })
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("base64url");
}

export function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function parseMasterKey(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("CONFIG_MASTER_KEY must be a 32-byte base64/base64url value or 64 hex characters");
  }
  const source = value.trim();
  let key;
  if (/^[a-fA-F0-9]{64}$/.test(source)) {
    key = Buffer.from(source, "hex");
  } else {
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(source)) {
      throw new Error("CONFIG_MASTER_KEY contains invalid base64 characters");
    }
    const unpadded = source.replace(/=+$/, "");
    const standard = unpadded.replaceAll("-", "+").replaceAll("_", "/");
    const padded = `${standard}${"=".repeat((4 - (standard.length % 4)) % 4)}`;
    key = Buffer.from(padded, "base64");
    if (key.toString("base64").replace(/=+$/, "") !== standard) {
      throw new Error("CONFIG_MASTER_KEY is not canonical base64/base64url");
    }
  }
  if (key.length !== 32) {
    throw new Error("CONFIG_MASTER_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function encryptSecret(plaintext, masterKey, associatedData = "game-signal-lab:deepseek:v1") {
  if (typeof plaintext !== "string" || !plaintext.trim()) {
    throw new TypeError("secret must be a non-empty string");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  cipher.setAAD(Buffer.from(associatedData));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptSecret(record, masterKey, associatedData = "game-signal-lab:deepseek:v1") {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    masterKey,
    Buffer.from(record.iv, "base64url")
  );
  decipher.setAAD(Buffer.from(associatedData));
  decipher.setAuthTag(Buffer.from(record.auth_tag ?? record.authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function pseudonymousAuditHash(value, masterKey, domain) {
  if (!value) return null;
  return createHmac("sha256", masterKey)
    .update(`${domain}:${String(value)}`)
    .digest("base64url")
    .slice(0, 22);
}

export function createSignedToken(masterKey, purpose) {
  const issuedAt = Date.now().toString(36);
  const nonce = randomToken(24);
  const payload = `${issuedAt}.${nonce}`;
  const signature = createHmac("sha256", masterKey)
    .update(`${purpose}:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySignedToken(token, masterKey, purpose, maxAgeMs) {
  if (typeof token !== "string" || token.length > 256) return false;
  const [issuedAtRaw, nonce, signature, extra] = token.split(".");
  if (
    extra !== undefined ||
    !/^[a-z0-9]+$/.test(issuedAtRaw ?? "") ||
    !/^[A-Za-z0-9_-]{20,}$/.test(nonce ?? "") ||
    !/^[A-Za-z0-9_-]{32,}$/.test(signature ?? "")
  ) {
    return false;
  }
  const issuedAt = Number.parseInt(issuedAtRaw, 36);
  const age = Date.now() - issuedAt;
  if (!Number.isFinite(issuedAt) || age < -60_000 || age > maxAgeMs) return false;
  const payload = `${issuedAtRaw}.${nonce}`;
  const expected = createHmac("sha256", masterKey)
    .update(`${purpose}:${payload}`)
    .digest("base64url");
  return constantTimeEqual(signature, expected);
}
