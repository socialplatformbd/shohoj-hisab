import {
  budgetStatuses,
  categoryBreakdown,
  categoryMap,
  debtTotals,
  filterRange,
  sumTx,
} from "./calc";
import { addMonths, endOfMonth, monthKey, startOfMonth } from "./dates";
import { formatMoney } from "./money";
import type { Budget, Category, Debt, Digits, Lang, Repayment, Transaction } from "./types";

export interface DataBundle {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  debts: Debt[];
  repayments: Repayment[];
}

function catLabel(c: Category | undefined, lang: Lang): string {
  if (!c) return lang === "bn" ? "অজানা খাত" : "Unknown";
  return lang === "en" && c.nameEn ? c.nameEn : c.name;
}

/**
 * AI-কে দেওয়া "তথ্যের সারাংশ"। সব অঙ্ক এখানে নির্ধারিত কোডে হিসাব করা;
 * AI শুধু এগুলো থেকে উত্তর সাজাবে, নিজে হিসাব বা তথ্য বানাবে না।
 */
export function buildFacts(data: DataBundle, today: string, lang: Lang, digits: Digits): string {
  const m = (p: number) => formatMoney(p, digits);
  const cats = categoryMap(data.categories);
  const thisMonth = monthKey(today);
  const lastMonth = addMonths(thisMonth, -1);
  const monthTx = (k: string) => filterRange(data.transactions, startOfMonth(k + "-01"), endOfMonth(k + "-01"));
  const cur = monthTx(thisMonth);
  const prev = monthTx(lastMonth);
  const todayTx = data.transactions.filter((t) => t.date === today);
  const t = (list: Transaction[]) => {
    const s = sumTx(list);
    return { income: m(s.income), expense: m(s.expense), saving: m(s.saving), balance: m(s.balance) };
  };
  const breakdown = (list: Transaction[]) =>
    categoryBreakdown(list, "expense")
      .slice(0, 10)
      .map((c) => ({ category: catLabel(cats.get(c.categoryId), lang), amount: m(c.total), percentOfExpense: c.percent, count: c.count }));
  const budgets = budgetStatuses(data.budgets, data.transactions, thisMonth).map((b) => ({
    for: b.budget.categoryId === null ? "overall" : catLabel(cats.get(b.budget.categoryId), lang),
    budget: m(b.budget.amount),
    spent: m(b.spent),
    remaining: m(b.remaining),
    percentUsed: b.percent,
  }));
  const dt = debtTotals(data.debts, data.repayments, today);
  const biggest = [...cur]
    .filter((x) => x.type === "expense")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((x) => ({ title: x.description || catLabel(cats.get(x.categoryId), lang), amount: m(x.amount), date: x.date }));

  return JSON.stringify({
    today,
    currency: "BDT",
    currentMonth: thisMonth,
    allTime: t(data.transactions),
    thisMonth: { ...t(cur), expenseByCategory: breakdown(cur), biggestExpenses: biggest, transactionCount: cur.length },
    lastMonth: { month: lastMonth, ...t(prev), expenseByCategory: breakdown(prev) },
    todayTotals: { ...t(todayTx), transactionCount: todayTx.length },
    budgetsThisMonth: budgets,
    debts: { toReceive: m(dt.receivable), toPay: m(dt.payable), openRecords: dt.summaries.filter((s) => s.status !== "paid").length },
  });
}

// ---------- AI ছাড়া নির্ধারিত সারাংশ ----------

export function periodSummary(
  data: DataBundle,
  from: string,
  to: string,
  title: string,
  lang: Lang,
  digits: Digits,
  prevRange?: [string, string],
): string {
  const bn = lang === "bn";
  const m = (p: number) => formatMoney(p, digits);
  const cats = categoryMap(data.categories);
  const list = filterRange(data.transactions, from, to);
  if (list.length === 0) return bn ? `${title}: এই সময়ে কোনো লেনদেন নেই।` : `${title}: no transactions in this period.`;
  const s = sumTx(list);
  const lines = [
    `${title}`,
    `${bn ? "মোট আয়" : "Income"}: ${m(s.income)}`,
    `${bn ? "মোট খরচ" : "Expenses"}: ${m(s.expense)}`,
    `${bn ? "সঞ্চয় জমা" : "Saved"}: ${m(s.saving - s.withdraw)}`,
    `${bn ? "ব্যালেন্স (এই সময়ে)" : "Net balance (period)"}: ${m(s.balance)}`,
  ];
  const br = categoryBreakdown(list, "expense").slice(0, 3);
  if (br.length) {
    lines.push(bn ? "সবচেয়ে বেশি খরচের খাত:" : "Top expense categories:");
    br.forEach((c, i) => lines.push(`${i + 1}. ${catLabel(cats.get(c.categoryId), lang)} — ${m(c.total)} (${c.percent}%)`));
  }
  if (prevRange) {
    const ps = sumTx(filterRange(data.transactions, prevRange[0], prevRange[1]));
    if (ps.expense > 0) {
      const diff = s.expense - ps.expense;
      lines.push(
        bn
          ? `আগের সময়ের চেয়ে খরচ ${m(Math.abs(diff))} ${diff >= 0 ? "বেশি" : "কম"}`
          : `Spending is ${m(Math.abs(diff))} ${diff >= 0 ? "higher" : "lower"} than the previous period`,
      );
    }
  }
  return lines.join("\n");
}

export function monthSummary(data: DataBundle, today: string, lang: Lang, digits: Digits): string {
  const k = monthKey(today);
  const pk = addMonths(k, -1);
  return periodSummary(
    data,
    startOfMonth(k + "-01"),
    endOfMonth(k + "-01"),
    lang === "bn" ? "এই মাসের সারাংশ" : "This month's summary",
    lang,
    digits,
    [startOfMonth(pk + "-01"), endOfMonth(pk + "-01")],
  );
}

export function todaySummary(data: DataBundle, today: string, lang: Lang, digits: Digits): string {
  return periodSummary(data, today, today, lang === "bn" ? "আজকের সারাংশ" : "Today's summary", lang, digits);
}

export function topCategoryAnswer(data: DataBundle, from: string, to: string, label: string, lang: Lang, digits: Digits): string {
  const bn = lang === "bn";
  const list = filterRange(data.transactions, from, to);
  const br = categoryBreakdown(list, "expense");
  if (!br.length) return bn ? `${label} কোনো খরচ নেই।` : `No expenses ${label}.`;
  const cats = categoryMap(data.categories);
  const top = br[0];
  const name = catLabel(cats.get(top.categoryId), lang);
  return bn
    ? `${label} সবচেয়ে বেশি খরচ হয়েছে “${name}” খাতে — ${formatMoney(top.total, digits)} (মোট খরচের ${top.percent}%)।`
    : `The highest spending ${label} was “${name}” — ${formatMoney(top.total, digits)} (${top.percent}% of expenses).`;
}

export function budgetAnswer(data: DataBundle, today: string, lang: Lang, digits: Digits): string {
  const bn = lang === "bn";
  const cats = categoryMap(data.categories);
  const sts = budgetStatuses(data.budgets, data.transactions, monthKey(today));
  if (!sts.length) return bn ? "এই মাসের জন্য কোনো বাজেট ঠিক করা নেই।" : "No budget is set for this month.";
  return sts
    .map((s) => {
      const name = s.budget.categoryId === null ? (bn ? "সামগ্রিক" : "Overall") : catLabel(cats.get(s.budget.categoryId), lang);
      return bn
        ? `${name}: বাজেট ${formatMoney(s.budget.amount, digits)}, খরচ ${formatMoney(s.spent, digits)}, ${s.remaining >= 0 ? "বাকি " + formatMoney(s.remaining, digits) : "সীমা ছাড়িয়েছে " + formatMoney(-s.remaining, digits)} (${s.percent}%)`
        : `${name}: budget ${formatMoney(s.budget.amount, digits)}, spent ${formatMoney(s.spent, digits)}, ${s.remaining >= 0 ? "left " + formatMoney(s.remaining, digits) : "over by " + formatMoney(-s.remaining, digits)} (${s.percent}%)`;
    })
    .join("\n");
}

export function debtAnswer(data: DataBundle, today: string, lang: Lang, digits: Digits): string {
  const bn = lang === "bn";
  const dt = debtTotals(data.debts, data.repayments, today);
  return bn
    ? `আপনি পাবেন: ${formatMoney(dt.receivable, digits)}\nআপনি দেবেন: ${formatMoney(dt.payable, digits)}`
    : `You will receive: ${formatMoney(dt.receivable, digits)}\nYou owe: ${formatMoney(dt.payable, digits)}`;
}

export function balanceAnswer(data: DataBundle, lang: Lang, digits: Digits): string {
  const s = sumTx(data.transactions);
  return lang === "bn"
    ? `বর্তমান ব্যালেন্স: ${formatMoney(s.balance, digits)}\nমোট সঞ্চয়: ${formatMoney(s.savings, digits)}`
    : `Current balance: ${formatMoney(s.balance, digits)}\nTotal savings: ${formatMoney(s.savings, digits)}`;
}

/** প্রশ্ন বুঝতে পারলে নির্ধারিত উত্তর দেয়, না পারলে null */
export function localAnswer(question: string, data: DataBundle, today: string, lang: Lang, digits: Digits): string | null {
  const q = question.toLowerCase();
  const bn = lang === "bn";
  const last = /গত\s*মাস|last month/.test(q);
  const isToday = /আজ|today/.test(q);
  const k = monthKey(today);
  const pk = addMonths(k, -1);
  let from = startOfMonth(k + "-01");
  let to = endOfMonth(k + "-01");
  let label = bn ? "এই মাসে" : "this month";
  if (last) {
    from = startOfMonth(pk + "-01");
    to = endOfMonth(pk + "-01");
    label = bn ? "গত মাসে" : "last month";
  } else if (isToday) {
    from = to = today;
    label = bn ? "আজ" : "today";
  }

  if (/সবচেয়ে বেশি|সর্বোচ্চ|বেশি খরচ|highest|most|top|biggest/.test(q) && /খরচ|খাত|expense|category|spend/.test(q)) {
    return topCategoryAnswer(data, from, to, label, lang, digits);
  }
  if (/বাজেট|budget/.test(q)) return budgetAnswer(data, today, lang, digits);
  if (/পাওনা|দেনা|ধার|debt|owe|lend|borrow/.test(q)) return debtAnswer(data, today, lang, digits);
  if (/ব্যালেন্স|balance|কত টাকা আছে|সঞ্চয়|savings/.test(q)) return balanceAnswer(data, lang, digits);
  if (/সারাংশ|মোট|খরচ|আয়|summary|total|expense|income|spend/.test(q)) {
    const title = bn ? (last ? "গত মাসের সারাংশ" : isToday ? "আজকের সারাংশ" : "এই মাসের সারাংশ") : last ? "Last month's summary" : isToday ? "Today's summary" : "This month's summary";
    return periodSummary(data, from, to, title, lang, digits);
  }
  return null;
}
