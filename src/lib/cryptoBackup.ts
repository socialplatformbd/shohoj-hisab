/**
 * পাসওয়ার্ড-সুরক্ষিত ব্যাকআপ: AES-256-GCM, কী = PBKDF2-SHA256(পাসওয়ার্ড, এলোমেলো লবণ)।
 * ফাইলে শুধু লবণ, IV ও সাইফারটেক্সট থাকে — পাসওয়ার্ড কোথাও রাখা হয় না।
 */
export const ENC_ITERATIONS = 600_000;
export const MIN_PASSWORD_LENGTH = 8;
const MIN_ITER = 100_000;
const MAX_ITER = 5_000_000; // ক্ষতিকর ফাইল যেন ফোন আটকে না দেয়

export interface EncryptedEnvelope {
  app: "shohoj-hisab";
  encrypted: true;
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

export type DecryptErrorCode = "invalid" | "unsupported" | "wrong";
export class DecryptError extends Error {
  constructor(public code: DecryptErrorCode) {
    super(code);
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** আসল টেক্সট (ব্যাকআপ JSON) → এনক্রিপ্টেড খামের JSON টেক্সট */
export async function encryptText(plain: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ENC_ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  const env: EncryptedEnvelope = { app: "shohoj-hisab", encrypted: true, version: 1, kdf: "PBKDF2-SHA256", iterations: ENC_ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(ct) };
  return JSON.stringify(env);
}

/** ফাইলের টেক্সট এনক্রিপ্টেড ব্যাকআপ কিনা (দ্রুত পরীক্ষা) */
export function isEncryptedBackupText(text: string): boolean {
  try {
    const o = JSON.parse(text) as Partial<EncryptedEnvelope> | null;
    return !!o && typeof o === "object" && o.encrypted === true && o.app === "shohoj-hisab";
  } catch {
    return false;
  }
}

export async function decryptText(envelopeText: string, password: string): Promise<string> {
  let env: Partial<EncryptedEnvelope>;
  try {
    env = JSON.parse(envelopeText) as Partial<EncryptedEnvelope>;
  } catch {
    throw new DecryptError("invalid");
  }
  if (!env || env.encrypted !== true || env.app !== "shohoj-hisab" || typeof env.salt !== "string" || typeof env.iv !== "string" || typeof env.data !== "string") throw new DecryptError("invalid");
  if (env.version !== 1 || env.kdf !== "PBKDF2-SHA256") throw new DecryptError("unsupported");
  const iterations = env.iterations;
  if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < MIN_ITER || iterations > MAX_ITER) throw new DecryptError("invalid");
  let salt: Uint8Array<ArrayBuffer>, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>;
  try {
    salt = fromB64(env.salt);
    iv = fromB64(env.iv);
    data = fromB64(env.data);
  } catch {
    throw new DecryptError("invalid");
  }
  if (iv.length !== 12 || salt.length < 8) throw new DecryptError("invalid");
  const key = await deriveKey(password, salt, iterations);
  try {
    return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data));
  } catch {
    // ভুল পাসওয়ার্ড বা ফাইল বদলে/নষ্ট হয়ে গেছে — GCM-এর যাচাই ব্যর্থ
    throw new DecryptError("wrong");
  }
}
