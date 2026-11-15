import { monthKey, monthsBetween } from "./dates";
import type { Goal, Transaction } from "./types";

export interface GoalProgress {
  saved: number; // goalId দেওয়া সঞ্চয় − উত্তোলন (০-এর নিচে নামে না)
  remaining: number;
  percent: number; // ০–১০০
  done: boolean;
  /** সময়সীমা ধরে বাকি মাস (চলতি মাসসহ, কমপক্ষে ১); সময়সীমা না থাকলে বা পার হয়ে গেলে null */
  monthsLeft: number | null;
  /** লক্ষ্যে পৌঁছাতে প্রতি মাসে কত জমাতে হবে (উপরের দিকে গোল); প্রযোজ্য না হলে null */
  neededPerMonth: number | null;
  overdue: boolean;
}

export function goalProgress(goal: Goal, txs: Transaction[], today: string): GoalProgress {
  let saved = 0;
  for (const t of txs) {
    if (t.goalId !== goal.id) continue;
    if (t.type === "saving") saved += t.amount;
    else if (t.type === "withdraw") saved -= t.amount;
  }
  saved = Math.max(0, saved);
  const remaining = Math.max(0, goal.target - saved);
  const done = remaining === 0;
  const percent = goal.target > 0 ? Math.min(100, Math.floor((saved * 100) / goal.target)) : 0;
  const overdue = !done && !!goal.deadline && goal.deadline < today;
  let monthsLeft: number | null = null;
  if (goal.deadline && goal.deadline >= today) monthsLeft = Math.max(1, monthsBetween(monthKey(today), monthKey(goal.deadline)) + 1);
  return { saved, remaining, percent, done, monthsLeft, neededPerMonth: !done && monthsLeft ? Math.ceil(remaining / monthsLeft) : null, overdue };
}
