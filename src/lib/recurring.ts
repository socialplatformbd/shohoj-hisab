import { addMonths, endOfMonth, monthKey } from "./dates";
import { FALLBACK_CATEGORY, db } from "./db";
import type { Recurring, Transaction } from "./types";

/** অ্যাপ অনেকদিন না খুললে সর্বোচ্চ এত মাসের লেনদেন একসাথে তৈরি হবে */
export const MAX_CATCHUP_MONTHS = 24;

/** মাসের নির্দিষ্ট দিন; ছোট মাসে (যেমন ফেব্রুয়ারিতে ৩১) মাসের শেষ দিনে নামে */
export function scheduledDate(month: string, day: number): string {
  const last = Number(endOfMonth(month + "-01").slice(8));
  const d = Math.min(Math.max(Math.trunc(day), 1), last);
  return `${month}-${String(d).padStart(2, "0")}`;
}

/** একই নিয়ম-মাসের জন্য সব সময় একই আইডি — তাই দুইবার তৈরি হলেও ডুপ্লিকেট হয় না */
export function occurrenceId(ruleId: string, month: string): string {
  return `rec_${ruleId}_${month}`;
}

/** আজ পর্যন্ত যেসব মাসের লেনদেন এখনো তৈরি হয়নি */
export function dueOccurrences(rule: Recurring, today: string): { month: string; date: string }[] {
  if (!rule.active) return [];
  const thisMonth = monthKey(today);
  let m = rule.lastMonth ? addMonths(rule.lastMonth, 1) : rule.startMonth;
  if (m < rule.startMonth) m = rule.startMonth;
  const earliest = addMonths(thisMonth, -(MAX_CATCHUP_MONTHS - 1));
  if (m < earliest) m = earliest;
  const out: { month: string; date: string }[] = [];
  while (m <= thisMonth) {
    const date = scheduledDate(m, rule.dayOfMonth);
    if (date > today) break;
    out.push({ month: m, date });
    m = addMonths(m, 1);
  }
  return out;
}

/** নতুন নিয়ম তৈরির সময় শুরুর মাস: এই মাসের তারিখ পার হয়ে গেলে পরের মাস থেকে (পুরনো দিনের লেনদেন হঠাৎ যোগ হবে না) */
export function defaultStartMonth(day: number, today: string): string {
  const thisMonth = monthKey(today);
  return scheduledDate(thisMonth, day) >= today ? thisMonth : addMonths(thisMonth, 1);
}

/**
 * বাকি থাকা নিয়মিত লেনদেন তৈরি করে (একটি ট্রানজ্যাকশনে)। কতগুলো তৈরি হলো তা ফেরত দেয়।
 * ব্যবহারকারী আগে তৈরি হওয়া লেনদেন সম্পাদনা বা মুছলে সেটি আর ফিরে আসে না।
 */
export async function generateRecurring(today: string): Promise<number> {
  return db.transaction("rw", [db.recurring, db.transactions, db.categories, db.accounts], async () => {
    const rules = await db.recurring.toArray();
    if (rules.length === 0) return 0;
    const catIds = new Set((await db.categories.toArray()).map((c) => c.id));
    const accountIds = new Set((await db.accounts.toArray()).map((a) => a.id));
    let created = 0;
    for (const rule of rules) {
      const due = dueOccurrences(rule, today);
      if (due.length === 0) continue;
      const now = Date.now();
      const ids = due.map((o) => occurrenceId(rule.id, o.month));
      const existing = await db.transactions.bulkGet(ids);
      const fresh: Transaction[] = [];
      due.forEach((o, i) => {
        if (existing[i]) return;
        fresh.push({
          id: ids[i],
          type: rule.type,
          amount: rule.amount,
          categoryId: catIds.has(rule.categoryId) ? rule.categoryId : FALLBACK_CATEGORY[rule.type],
          date: o.date,
          description: rule.description,
          paymentMethod: rule.paymentMethod,
          accountId: rule.accountId && accountIds.has(rule.accountId) ? rule.accountId : undefined,
          createdAt: now,
          updatedAt: now,
        });
      });
      if (fresh.length) await db.transactions.bulkAdd(fresh);
      await db.recurring.put({ ...rule, lastMonth: due[due.length - 1].month, updatedAt: now });
      created += fresh.length;
    }
    return created;
  });
}
