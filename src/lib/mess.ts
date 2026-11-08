import type { MessEntry, MessMeal, MessMember } from "./types";

/**
 * total পয়সাকে weights অনুপাতে ভাগ করে; ভাগফলগুলোর যোগফল সব সময় ঠিক total হয়
 * (সবচেয়ে বড় ভগ্নাংশ-অবশিষ্টওয়ালারা বাড়তি ১ পয়সা পায়)। BigInt — বড় অঙ্কেও নির্ভুল।
 */
export function allocate(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (!(total > 0) || !(sumW > 0)) return weights.map(() => 0);
  const T = BigInt(total);
  const W = BigInt(sumW);
  const shares: number[] = [];
  const rem: { i: number; r: bigint }[] = [];
  let used = 0;
  weights.forEach((w, i) => {
    const prod = T * BigInt(w);
    const q = Number(prod / W);
    shares.push(q);
    used += q;
    rem.push({ i, r: prod % W });
  });
  let left = total - used;
  rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (let k = 0; k < rem.length && left > 0; k++, left--) shares[rem[k].i] += 1;
  return shares;
}

export interface MessRow {
  member: MessMember;
  halves: number; // মোট আধা-মিল
  mealCost: number; // মিলের খরচ (বাজারের ভাগ)
  shared: number; // সাধারণ খরচের ভাগ
  deposits: number; // জমা দিয়েছেন
  paid: number; // নিজের পকেট থেকে বাজার/সাধারণ খরচ করেছেন
  balance: number; // জমা + পকেট থেকে দেওয়া − মিলের খরচ − সাধারণ ভাগ। (+) ফেরত পাবেন, (−) দিতে হবে
}

export interface MessSummary {
  month: string;
  rows: MessRow[];
  totalBazaar: number;
  totalShared: number;
  totalDeposits: number;
  totalHalves: number;
  mealRate: number; // প্রতি পূর্ণ মিলের খরচ (পয়সা)
  pool: number; // সবার ব্যালেন্সের যোগফল = হাতে/পুলে থাকার কথা যত টাকা
  noMeals: boolean; // বাজার আছে কিন্তু কোনো মিল নেই — মিল-রেট হিসাব করা যায় না
}

const inMonth = (date: string, month: string) => date.slice(0, 7) === month;

/**
 * মাসের মেস-হিসাব (month = "YYYY-MM", ক্যালেন্ডার মাস)।
 * অংশগ্রহণকারী = সক্রিয় সদস্য + ওই মাসে মিল/লেনদেন আছে এমন সদস্য (নিষ্ক্রিয় হলেও)।
 * মিল-রেট = মোট বাজার ÷ মোট মিল; সাধারণ খরচ সব অংশগ্রহণকারীর মধ্যে সমান।
 */
export function messSummary(members: MessMember[], meals: MessMeal[], entries: MessEntry[], month: string): MessSummary {
  const es = entries.filter((e) => inMonth(e.date, month));
  const halvesBy = new Map<string, number>();
  for (const m of meals) if (inMonth(m.date, month)) halvesBy.set(m.memberId, (halvesBy.get(m.memberId) ?? 0) + m.halves);
  const involved = new Set<string>(halvesBy.keys());
  for (const e of es) {
    if (e.memberId) involved.add(e.memberId);
    if (e.kind === "shared") e.splitWith?.forEach((id) => involved.add(id));
  }
  const people = members.filter((m) => m.active || involved.has(m.id));

  const totalBazaar = es.filter((e) => e.kind === "bazaar").reduce((s, e) => s + e.amount, 0);
  const totalShared = es.filter((e) => e.kind === "shared").reduce((s, e) => s + e.amount, 0);
  const totalDeposits = es.filter((e) => e.kind === "deposit").reduce((s, e) => s + e.amount, 0);

  const halves = people.map((p) => halvesBy.get(p.id) ?? 0);
  const totalHalves = halves.reduce((s, h) => s + h, 0);
  const mealCosts = allocate(totalBazaar, halves);
  // প্রতিটি সাধারণ খরচ আলাদাভাবে ভাগ হয় — নির্দিষ্ট সদস্য বাছা থাকলে শুধু তাদের মধ্যে, নইলে সবার মধ্যে সমান
  const sharedShares = people.map(() => 0);
  for (const e of es) {
    if (e.kind !== "shared") continue;
    const chosen = e.splitWith && people.some((p) => e.splitWith!.includes(p.id)) ? new Set(e.splitWith) : null;
    allocate(e.amount, people.map((p) => (chosen ? (chosen.has(p.id) ? 1 : 0) : 1))).forEach((v, i) => (sharedShares[i] += v));
  }

  const rows: MessRow[] = people.map((member, i) => {
    const deposits = es.filter((e) => e.kind === "deposit" && e.memberId === member.id).reduce((s, e) => s + e.amount, 0);
    const paid = es.filter((e) => e.kind !== "deposit" && e.memberId === member.id).reduce((s, e) => s + e.amount, 0);
    const mealCost = mealCosts[i];
    const shared = sharedShares[i];
    return { member, halves: halves[i], mealCost, shared, deposits, paid, balance: deposits + paid - mealCost - shared };
  });

  return {
    month,
    rows,
    totalBazaar,
    totalShared,
    totalDeposits,
    totalHalves,
    mealRate: totalHalves > 0 ? Math.round((totalBazaar * 2) / totalHalves) : 0,
    pool: rows.reduce((s, r) => s + r.balance, 0),
    noMeals: totalBazaar > 0 && totalHalves === 0,
  };
}

/** একদিনের মিল-সারি আইডি (প্রতিদিন প্রতি সদস্যের একটিই) */
export function mealId(date: string, memberId: string): string {
  return `${date}_${memberId}`;
}
