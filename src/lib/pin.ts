import { toAsciiDigits } from "./money";

/** পিন ৪–৬টি সংখ্যা */
export const PIN_RE = /^\d{4,6}$/;
const ITERATIONS = 100_000;
const enc = new TextEncoder();

export function normalizePin(input: string): string {
  return toAsciiDigits(input).replace(/\s/g, "");
}

function hex(buf: ArrayBufferLike): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function makeSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return hex(a.buffer);
}

/** পিন সরাসরি রাখা হয় না — লবণসহ PBKDF2-SHA256 হ্যাশ রাখা হয় */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: ITERATIONS }, key, 256);
  return hex(bits);
}

export async function verifyPin(pin: string, salt: string, expected: string): Promise<boolean> {
  const got = await hashPin(pin, salt);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
