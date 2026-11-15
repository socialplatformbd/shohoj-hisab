import { summarizeDebt } from "./calc";
import { addMonths, daysBetween, monthKey } from "./dates";
import { scheduledDate } from "./recurring";
import type { Debt, Recurring, Repayment } from "./types";

export interface Reminder {
  id: string;
  kind: "recurring" | "debt";
  /** recurring: খরচ/সঞ্চয়ের নিয়ম; debt: lent = কারো কাছে পাওনা, borrowed = কাউকে দেনা */
  sub: "expense" | "saving" | "lent" | "borrowed";
  title: string;
  amount: number;
  date: string;
  /** আজ থেকে কত দিন পরে; ঋণাত্মক হলে মেয়াদ পার হয়ে গেছে */
  daysLeft: number;
}

/** একটি নিয়মের পরের তারিখ: এই মাসের তারিখ আজ বা পরে এবং এই মাসের লেনদেন এখনো তৈরি হয়নি — নইলে পরের মাসের */
export function nextRecurringDate(rule: Recurring, today: string): string | null {
  if (!rule.active) return null;
  const thisMonth = monthKey(today);
  let m = thisMonth < rule.startMonth ? rule.startMonth : thisMonth;
  if (rule.lastMonth && rule.lastMonth >= m) m = addMonths(rule.lastMonth, 1);
  let date = scheduledDate(m, rule.dayOfMonth);
  if (date < today) date = scheduledDate(addMonths(m, 1), rule.dayOfMonth);
  return date;
}

/**
 * আগামী withinDays দিনের মধ্যে আসা নিয়মিত খরচ/সঞ্চয় (বিল, কিস্তি) এবং মেয়াদ কাছে আসা বা পার হওয়া ঋণ।
 * আয়ের নিয়ম (বেতন) রিমাইন্ডারে আসে না। মেয়াদ পার হওয়া ঋণ সব সময় দেখানো হয়।
 */
export function upcomingReminders(recurring: Recurring[], debts: Debt[], repayments: Repayment[], today: string, withinDays = 3): Reminder[] {
  const out: Reminder[] = [];
  for (const r of recurring) {
    if (r.type !== "expense" && r.type !== "saving") continue;
    const date = nextRecurringDate(r, today);
    if (!date) continue;
    const daysLeft = daysBetween(today, date);
    if (daysLeft < 0 || daysLeft > withinDays) continue;
    out.push({ id: `rec:${r.id}`, kind: "recurring", sub: r.type, title: r.description?.trim() || "", amount: r.amount, date, daysLeft });
  }
  for (const d of debts) {
    const s = summarizeDebt(d, repayments, today);
    if (s.status === "paid" || !d.dueDate) continue;
    const daysLeft = daysBetween(today, d.dueDate);
    if (daysLeft > withinDays) continue;
    out.push({ id: `debt:${d.id}`, kind: "debt", sub: d.kind, title: d.person, amount: s.remaining, date: d.dueDate, daysLeft });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title));
}
