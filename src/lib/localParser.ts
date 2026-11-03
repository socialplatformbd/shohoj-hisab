import { addDays } from "./dates";
import { FALLBACK_CATEGORY } from "./db";
import { numberToPaisa, parseAmountToPaisa, toAsciiDigits } from "./money";
import type { Category } from "./types";

/**
 * AI ছাড়া চলা সরল, নির্ধারিত (deterministic) নিয়মের বিশ্লেষক।
 * AI পাওয়া না গেলে এটি ফলব্যাক হিসাবে কাজ করে; ফলাফল সব সময় প্রিভিউতে দেখিয়ে নিশ্চিত করা হয়।
 */

export interface ExtractedRow {
  type: "income" | "expense";
  title: string;
  amount: number; // paisa
  categoryId: string;
  date: string;
}

const EXPENSE_RULES: [string, RegExp][] = [
  ["cat_housing", /(বাসা|বাড়ি|বাড়ী|রুম|ফ্ল্যাট)\s*ভাড়া|house rent|rent/i],
  ["cat_utilities", /বিদ্যুৎ|কারেন্ট|গ্যাস|পানির|ইন্টারনেট|ওয়াইফাই|রিচার্জ|মোবাইল|বিল|electric|internet|wifi|recharge|bill/i],
  ["cat_food", /বাজার|খাবার|খাওয়া|নাস্তা|নাশতা|চা(?![\u0980-\u09FF])|ভাত|রেস্টুরেন্ট|হোটেল|মুদি|সবজি|মাছ|মাংস|ফল|চাল|ডাল|তেল|দুধ|ডিম|বিরিয়ানি|food|lunch|dinner|grocer|market|tea/i],
  ["cat_transport", /রিকশা|বাস|সিএনজি|উবার|পাঠাও|ট্রেন|লঞ্চ|ভাড়া|পেট্রোল|অকটেন|যাতায়াত|টিকিট|বাইক|rickshaw|bus|uber|fare|petrol|taxi|ticket/i],
  ["cat_medical", /ঔষধ|ওষুধ|ডাক্তার|হাসপাতাল|চিকিৎসা|টেস্ট|ক্লিনিক|medicine|doctor|hospital|medical/i],
  ["cat_education", /স্কুল|কলেজ|বই|খাতা|টিউশন|কোচিং|পরীক্ষা|ফি(?![\u0980-\u09FF])|শিক্ষা|ভর্তি|school|tuition|book|exam/i],
  ["cat_entertainment", /সিনেমা|মুভি|ঘুরতে|বিনোদন|গেম|নাটক|পার্ক|বেড়াতে|ঘোরাঘুরি|movie|game|entertain|picnic/i],
  ["cat_shopping", /কেনাকাটা|জামা|কাপড়|জুতা|শপিং|মার্কেট|শার্ট|প্যান্ট|শাড়ি|গিফট|উপহার|shopping|cloth|shoe|gift/i],
];

const INCOME_RULES: [string, RegExp][] = [
  ["cat_salary", /বেতন|স্যালারি|salary|বোনাস|bonus/i],
  ["cat_freelancing", /ফ্রিল্যান্স|ফ্রিলান্স|freelanc|ক্লায়েন্ট|client/i],
  ["cat_business", /ব্যবসা|ব্যবসার|দোকান|বিক্রি|বিক্রয়|business|sale/i],
];

export function suggestCategoryId(text: string, type: "income" | "expense", categories: Category[]): string {
  const rules = type === "income" ? INCOME_RULES : EXPENSE_RULES;
  // ব্যবহারকারীর নিজস্ব খাতের নাম লেখায় থাকলে সেটিকে অগ্রাধিকার
  const custom = categories.find((c) => !c.builtin && c.type === type && c.name.length > 1 && text.includes(c.name));
  if (custom) return custom.id;
  for (const [id, re] of rules) {
    if (re.test(text) && categories.some((c) => c.id === id)) return id;
  }
  return FALLBACK_CATEGORY[type];
}

const FILLERS = new Set([
  "আজ", "আজকে", "গতকাল", "কাল", "আমি", "আমার", "আমাকে", "মোট", "প্রায়", "খরচ", "করেছি", "করলাম", "হয়েছে", "হয়েছিল",
  "দিয়েছি", "দিলাম", "বাবদ", "জন্য", "টাকা", "টাকার", "ও", "আর", "এবং", "তারপর", "পেয়েছি", "পেলাম", "ইনকাম", "আয়", "হলো", "হল",
  "তারিখ", "তারিখে", "টি", "টা", "পিস", "থেকে", "হতে", "ছিল", "গেছে", "গেল", "লেগেছে", "লাগলো", "মাত্র", "শুধু", "এই", "ওই", "সব", "সবমিলিয়ে", "today", "yesterday", "spent", "on", "and", "tk", "taka", "for",
]);

const TIME_WORD_FIX: Record<string, string> = { দুপুরে: "দুপুরের", সকালে: "সকালের", রাতে: "রাতের", বিকেলে: "বিকেলের", সন্ধ্যায়: "সন্ধ্যার" };

function normalizeWord(w: string, isLast: boolean): string {
  if (!isLast && TIME_WORD_FIX[w]) return TIME_WORD_FIX[w];
  if (isLast) {
    if (TIME_WORD_FIX[w]) return TIME_WORD_FIX[w].slice(0, -1);
    if (w.endsWith("ায়") && w.length > 3) return w.slice(0, -2) + "া";
    if (w.endsWith("ে") && w.length > 3) return w.slice(0, -1);
  }
  return w;
}

function cleanLabel(chunk: string): string {
  const words = chunk
    .replace(/[:\-–—()"'“”।.]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLERS.has(w.toLowerCase()) && !/^\d/.test(w));
  return words
    .map((w, i) => normalizeWord(w, i === words.length - 1))
    .join(" ")
    .trim()
    .slice(0, 60);
}

function lastChunk(s: string): string {
  const parts = s.split(/[,،;।\n]|\sআর\s|\sএবং\s|\sand\s/i);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (cleanLabel(parts[i])) return parts[i];
  }
  return "";
}

/** প্রথম অর্থবহ অংশ ও সেটি যেখানে শেষ হয়েছে (যাতে পরের অঙ্কের সময় একই লেবেল আবার না আসে) */
function firstChunk(s: string): { chunk: string; end: number } {
  const re = /[,،;।\n]|\sআর\s|\sএবং\s|\sand\s/gi;
  let start = 0;
  for (;;) {
    const m = re.exec(s);
    const end = m ? m.index : s.length;
    const part = s.slice(start, end);
    if (cleanLabel(part)) return { chunk: part, end };
    if (!m) return { chunk: "", end: 0 };
    start = m.index + m[0].length;
  }
}

const INCOME_WORDS = /বেতন|আয়|ইনকাম|পেয়েছি|পেলাম|রোজগার|বোনাস|বিক্রি করে|received|salary|income|earned/i;
const EXPENSE_WORDS = /খরচ|কিনেছি|কিনলাম|দিয়েছি|দিলাম|ভাড়া|বিল|spent|paid|bought|expense/i;

export function parseLocalText(input: string, categories: Category[], today: string): ExtractedRow[] {
  let text = toAsciiDigits(input).replace(/৳\s*(\d[\d,]*(?:\.\d+)?)/g, "$1 টাকা");
  text = text.replace(/\b(\d+)\s*(?:k|K)\b/g, (_, n) => `${Number(n) * 1000} টাকা`);
  const date = /গতকাল|yesterday/i.test(text) ? addDays(today, -1) : today;

  const markedRe = /(\d[\d,]*(?:\.\d+)?)\s*(?:টাকা|tk\b|taka\b|bdt\b)/gi;
  const anyRe = /(\d[\d,]*(?:\.\d+)?)/g;
  const collect = (re: RegExp) => [...text.matchAll(re)].map((m) => ({ raw: m[1], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  let matches = collect(markedRe);
  if (matches.length === 0) matches = collect(anyRe);

  const globalIncome = INCOME_WORDS.test(text);
  const globalExpense = EXPENSE_WORDS.test(text);

  const rows: ExtractedRow[] = [];
  let prevEnd = 0;
  matches.forEach((m, i) => {
    const amount = parseAmountToPaisa(m.raw) ?? numberToPaisa(Number(m.raw.replace(/,/g, "")));
    const pre = text.slice(prevEnd, m.start);
    const nextStart = matches[i + 1]?.start ?? text.length;
    const post = text.slice(m.end, nextStart);
    prevEnd = m.end;
    if (amount === null) return;

    let chunk = lastChunk(pre);
    let label = cleanLabel(chunk);
    if (!label) {
      const f = firstChunk(post);
      chunk = f.chunk;
      label = cleanLabel(chunk);
      if (label) prevEnd = m.end + f.end; // এই লেবেল এই অঙ্কের; পরের অঙ্ক এটি আবার নেবে না
    }
    const ctx = chunk + " " + pre;
    const ownIncome = INCOME_WORDS.test(ctx);
    const ownExpense = EXPENSE_WORDS.test(ctx);
    // নিজের আশপাশে স্পষ্ট শব্দ থাকলে সেটিই; না থাকলে পুরো লেখার সাধারণ ধরন।
    // একাধিক অঙ্ক থাকলে (যেমন "বেতন পেয়েছি ... এবং বাজার ...") খরচের খাত-মার্কা লেবেল খরচ ধরা হয়; একক অঙ্কে আগের নিয়মই।
    const looksExpense = matches.length > 1 && EXPENSE_RULES.some(([, re]) => re.test(label));
    const type: "income" | "expense" =
      ownIncome && !ownExpense ? "income" : ownExpense ? "expense" : globalIncome && !globalExpense && !looksExpense ? "income" : "expense";
    const categoryId = suggestCategoryId(label || pre, type, categories);
    const fallbackTitle = categories.find((c) => c.id === categoryId)?.name ?? (type === "income" ? "আয়" : "খরচ");
    rows.push({ type, title: label || fallbackTitle, amount, categoryId, date });
  });
  return rows;
}
