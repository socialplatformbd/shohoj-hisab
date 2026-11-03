/** তারিখ সব সময় Asia/Dhaka অনুযায়ী "YYYY-MM-DD" স্ট্রিং হিসাবে রাখা হয়। */
export const TIMEZONE = "Asia/Dhaka";

const dhakaFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dhakaDateOf(ms: number): string {
  return dhakaFmt.format(new Date(ms));
}

export function todayDhaka(): string {
  return dhakaDateOf(Date.now());
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtc(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(s: string, n: number): string {
  const dt = toUtc(s);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function monthKey(s: string): string {
  return s.slice(0, 7);
}

export function startOfMonth(s: string): string {
  return s.slice(0, 7) + "-01";
}

export function endOfMonth(s: string): string {
  const [y, m] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m, 0));
  return fromUtc(dt);
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return fromUtc(dt).slice(0, 7);
}

/** বেতনের তারিখ-ভিত্তিক "মাস": শুরুর দিন ১–২৮ (১ মানে সাধারণ ক্যালেন্ডার মাস) */
export function normalizeStartDay(n: unknown): number {
  const v = Number(n);
  return Number.isInteger(v) && v >= 1 && v <= 28 ? v : 1;
}

/**
 * তারিখটি কোন "মাসে" পড়ে। শুরুর দিন ২৫ হলে ২৫ অক্টোবর–২৪ নভেম্বর = "নভেম্বর" (যে মাসে শেষ হয় সেই নামে)।
 */
export function periodKeyOf(date: string, startDay: number): string {
  const k = monthKey(date);
  return startDay > 1 && Number(date.slice(8)) >= startDay ? addMonths(k, 1) : k;
}

/** "YYYY-MM" মাসের শুরু ও শেষ তারিখ (শুরুর দিন অনুযায়ী) */
export function periodRange(key: string, startDay: number): { from: string; to: string } {
  if (startDay <= 1) return { from: startOfMonth(key + "-01"), to: endOfMonth(key + "-01") };
  const pad = String(startDay).padStart(2, "0");
  return { from: `${addMonths(key, -1)}-${pad}`, to: addDays(`${key}-${pad}`, -1) };
}

export function monthsBetween(aKey: string, bKey: string): number {
  const [ay, am] = aKey.split("-").map(Number);
  const [by, bm] = bKey.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** বাংলাদেশে সপ্তাহ শনিবার থেকে শুরু */
export function startOfWeek(s: string): string {
  const day = toUtc(s).getUTCDay(); // 0=রবি ... 6=শনি
  const back = (day + 1) % 7;
  return addDays(s, -back);
}

export function endOfWeek(s: string): string {
  return addDays(startOfWeek(s), 6);
}

export function startOfYear(s: string): string {
  return s.slice(0, 4) + "-01-01";
}

export function endOfYear(s: string): string {
  return s.slice(0, 4) + "-12-31";
}

export function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export const BN_MONTHS = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];
export const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/** ছোট মাসের নাম — অক্ষর কেটে নয়, সঠিক সংক্ষিপ্ত রূপ (বাংলা যুক্তাক্ষর কাটলে ভেঙে যায়) */
export const BN_MONTHS_SHORT = ["জানু", "ফেব", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"];
export const EN_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const BN_WEEKDAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
export const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayIndex(s: string): number {
  return toUtc(s).getUTCDay();
}
