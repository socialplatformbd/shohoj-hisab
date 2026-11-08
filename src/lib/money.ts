/**
 * টাকার হিসাব — শুধু পূর্ণসংখ্যা (paisa) ব্যবহার করা হয়, কোথাও floating-point নয়।
 */

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

export function toAsciiDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

export function toBengaliDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function applyDigits(input: string, digits: "bn" | "en"): string {
  return digits === "bn" ? toBengaliDigits(toAsciiDigits(input)) : toAsciiDigits(input);
}

export const MAX_PAISA = 999_999_999_999; // ~ ৯৯৯ কোটি টাকা

/**
 * ব্যবহারকারীর লেখা সংখ্যা (বাংলা/ইংরেজি অঙ্ক, কমা, ৳) থেকে paisa বের করে।
 * অবৈধ হলে null।
 */
export function parseAmountToPaisa(input: string): number | null {
  const cleaned = toAsciiDigits(String(input))
    .replace(/[৳,\s]/g, "")
    .replace(/(?:টাকা|taka|tk|bdt)$/i, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const paisa = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(paisa) || paisa <= 0 || paisa > MAX_PAISA) return null;
  return paisa;
}

/** সংখ্যা (যেমন AI থেকে আসা) থেকে paisa — স্ট্রিং পথে, যাতে float ভুল না হয় */
export function numberToPaisa(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return parseAmountToPaisa(n.toFixed(2));
}

function groupLakh(whole: string): string {
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  let rest = whole.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return parts.join(",") + "," + last3;
}

/** paisa → "১,৫০০.০০" (ASCII অঙ্কে কাঠামো তৈরি করে পরে অঙ্ক বদলানো হয়) */
export function formatPlainPaisa(paisa: number, digits: "bn" | "en" = "en", withFraction = true): string {
  const neg = paisa < 0;
  const abs = Math.abs(Math.round(paisa));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  let s = groupLakh(String(whole));
  if (withFraction) s += "." + String(frac).padStart(2, "0");
  return applyDigits((neg ? "-" : "") + s, digits);
}

export function formatMoney(paisa: number, digits: "bn" | "en" = "bn", withFraction = true): string {
  const neg = paisa < 0;
  const body = formatPlainPaisa(Math.abs(paisa), digits, withFraction);
  return `${neg ? "-" : ""}৳ ${body}`;
}

/** CSV/ডেটা এক্সপোর্টের জন্য সাধারণ দশমিক (যেমন 1500.00) */
export function paisaToDecimalString(paisa: number): string {
  const abs = Math.abs(Math.round(paisa));
  return `${paisa < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** পূর্ণসংখ্যা শতাংশ (নিচের দিকে) — float ছাড়া */
export function percentOf(part: number, total: number): number {
  if (total <= 0) return part > 0 ? 100 : 0;
  return Math.floor((part * 100) / total);
}

/** ০ চলে এমন অঙ্ক: খালি বা ০ হলে ০; সঠিক হলে পয়সা; অবৈধ হলে null */
export function parseAmountOrZero(text: string): number | null {
  const s = toAsciiDigits(text).replace(/[৳,\s]/g, "");
  if (s === "") return 0;
  if (/^0+(\.0{1,2})?$/.test(s)) return 0;
  return parseAmountToPaisa(s);
}
