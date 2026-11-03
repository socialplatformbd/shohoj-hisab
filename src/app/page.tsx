"use client";

import { ArrowDownLeft, ArrowUpRight, BarChart3, Bot, HandCoins, Landmark, PiggyBank, Receipt } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { useTxForm } from "@/components/TransactionForm";
import { TransactionDetailSheet, TransactionRow } from "@/components/TransactionParts";
import { EmptyState, IncomeExpenseChart, ProgressBar } from "@/components/ui";
import { budgetStatuses, debtTotals, filterRange, monthlySeries, sumTx } from "@/lib/calc";
import { addMonths, endOfWeek, endOfYear, monthsBetween, periodKeyOf, periodRange, startOfMonth, startOfWeek, startOfYear, todayDhaka } from "@/lib/dates";
import type { Transaction } from "@/lib/types";

type Preset = "month" | "lastMonth" | "week" | "year" | "all" | "custom";

export default function Dashboard() {
  const { t, data, money, num, monthShort, catName, settings, dataReady } = useApp();
  const form = useTxForm();
  const today = todayDhaka();
  const startDay = settings.monthStartDay;
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: startOfMonth(today), to: today });
  const [selected, setSelected] = useState<Transaction | null>(null);

  const range = useMemo(() => {
    switch (preset) {
      case "month":
        return periodRange(periodKeyOf(today, startDay), startDay);
      case "lastMonth":
        return periodRange(addMonths(periodKeyOf(today, startDay), -1), startDay);
      case "week":
        return { from: startOfWeek(today), to: endOfWeek(today) };
      case "year":
        return { from: startOfYear(today), to: endOfYear(today) };
      case "all": {
        const first = data.transactions.reduce((m, x) => (x.date < m ? x.date : m), today);
        return { from: first, to: today > first ? today : first };
      }
      default:
        return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
    }
  }, [preset, today, custom, data.transactions, startDay]);

  const all = useMemo(() => sumTx(data.transactions), [data.transactions]);
  const inRangeTx = useMemo(() => filterRange(data.transactions, range.from, range.to), [data.transactions, range]);
  const period = useMemo(() => sumTx(inRangeTx), [inRangeTx]);
  const debts = useMemo(() => debtTotals(data.debts, data.repayments, today), [data.debts, data.repayments, today]);
  const budgets = useMemo(() => budgetStatuses(data.budgets, data.transactions, periodKeyOf(today, startDay), startDay), [data.budgets, data.transactions, today, startDay]);
  const overall = budgets.find((b) => b.budget.categoryId === null) ?? budgets[0];
  const warnCount = budgets.filter((b) => b.level !== "ok").length;

  const series = useMemo(() => {
    const toM = periodKeyOf(range.to, startDay);
    const startM = periodKeyOf(range.from, startDay);
    const n = monthsBetween(startM, toM) + 1;
    const fromM = n < 6 ? addMonths(toM, -5) : n > 12 ? addMonths(toM, -11) : startM;
    return monthlySeries(data.transactions, fromM, toM, startDay);
  }, [data.transactions, range, startDay]);

  const recent = useMemo(
    () => [...data.transactions].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)).slice(0, 6),
    [data.transactions],
  );

  const presets: [Preset, string][] = [
    ["month", t("rangeThisMonth")],
    ["lastMonth", t("rangeLastMonth")],
    ["week", t("rangeThisWeek")],
    ["year", t("rangeThisYear")],
    ["all", t("rangeAll")],
    ["custom", t("rangeCustom")],
  ];

  const quick = [
    { label: t("quickAddIncome"), icon: ArrowDownLeft, color: "bg-emerald-600", onClick: () => form.open({ type: "income" }) },
    { label: t("quickAddExpense"), icon: ArrowUpRight, color: "bg-rose-600", onClick: () => form.open({ type: "expense" }) },
  ];

  if (!dataReady) return null;

  return (
    <div className="space-y-4">
      {/* বর্তমান ব্যালেন্স */}
      <section className="rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-5 text-white shadow-md">
        <p className="text-sm opacity-90">{t("currentBalance")}</p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight" data-testid="balance">
          {money(all.balance)}
        </p>
        <p className="mt-1 text-xs opacity-80">{t("allTime")}</p>
      </section>

      {/* দ্রুত কাজ */}
      <section className="grid grid-cols-2 gap-3">
        {quick.map((q) => (
          <button key={q.label} onClick={q.onClick} className={`btn ${q.color} text-white`}>
            <q.icon className="h-5 w-5" />
            {q.label}
          </button>
        ))}
        <Link href="/ai" className="btn btn-ghost">
          <Bot className="h-5 w-5 text-emerald-700" />
          {t("quickAi")}
        </Link>
        <Link href="/reports" className="btn btn-ghost">
          <BarChart3 className="h-5 w-5 text-emerald-700" />
          {t("quickReports")}
        </Link>
      </section>

      {/* সময়সীমা */}
      <section>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {presets.map(([k, label]) => (
            <button key={k} className={`chip ${preset === k ? "chip-active" : ""}`} onClick={() => setPreset(k)}>
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("from")}</label>
              <input type="date" className="input" value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
            </div>
            <div>
              <label className="label">{t("to")}</label>
              <input type="date" className="input" value={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
            </div>
          </div>
        )}
      </section>

      {/* সারাংশ কার্ড */}
      <section className="grid grid-cols-2 gap-3">
        <StatCard label={t("totalIncome")} value={money(period.income)} cls="text-emerald-600 dark:text-emerald-400" icon={<ArrowDownLeft className="h-4 w-4" />} />
        <StatCard label={t("totalExpense")} value={money(period.expense)} cls="text-rose-600 dark:text-rose-400" icon={<ArrowUpRight className="h-4 w-4" />} />
        <StatCard label={t("totalSavings")} value={money(all.savings)} cls="text-sky-600 dark:text-sky-400" icon={<PiggyBank className="h-4 w-4" />} />
        <StatCard
          label={t("periodNet")}
          value={money(period.income - period.expense)}
          cls={period.income - period.expense >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
          icon={<Receipt className="h-4 w-4" />}
        />
        <Link href="/debts">
          <StatCard label={t("receivables")} value={money(debts.receivable)} cls="" icon={<HandCoins className="h-4 w-4" />} />
        </Link>
        <Link href="/debts">
          <StatCard label={t("payables")} value={money(debts.payable)} cls="" icon={<Landmark className="h-4 w-4" />} />
        </Link>
      </section>

      {/* বাজেট */}
      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">{t("monthlyBudget")}</h2>
          <Link href="/budgets" className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {t("navBudgets")} →
          </Link>
        </div>
        {overall ? (
          <div>
            {overall.budget.categoryId !== null && (
              <p className="mb-1 text-xs font-semibold text-muted">{catName(data.categories.find((c) => c.id === overall.budget.categoryId))}</p>
            )}
            <div className="mb-1 flex justify-between text-sm">
              <span>
                {t("spent")}: <b>{money(overall.spent)}</b> / {money(overall.budget.amount)}
              </span>
              <b>{num(overall.percent)}%</b>
            </div>
            <ProgressBar percent={overall.percent} level={overall.level} />
            <p className={`mt-1.5 text-sm ${overall.remaining < 0 ? "text-rose-600" : "text-muted"}`}>
              {overall.remaining >= 0 ? `${t("remaining")}: ${money(overall.remaining)}` : `${t("overBy")}: ${money(-overall.remaining)}`}
            </p>
            {warnCount > 0 && budgets.length > 1 && <p className="mt-1 text-xs text-amber-600">⚠ {num(warnCount)}</p>}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">{t("noBudgetSet")}</p>
            <Link href="/budgets" className="btn btn-ghost btn-sm shrink-0">
              {t("setBudget")}
            </Link>
          </div>
        )}
      </section>

      {/* চার্ট */}
      <section className="card">
        <h2 className="mb-3 font-bold">{t("monthlyChart")}</h2>
        <IncomeExpenseChart points={series} labelOf={monthShort} />
      </section>

      {/* সাম্প্রতিক লেনদেন */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{t("recentTransactions")}</h2>
          {recent.length > 0 && (
            <Link href="/transactions" className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              {t("viewAll")} →
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <EmptyState icon={<Receipt className="h-8 w-8" />} title={t("noTransactionsTitle")} hint={t("noTransactionsHint")} />
        ) : (
          <div className="divide-y divide-line">
            {recent.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} onClick={() => setSelected(tx)} />
            ))}
          </div>
        )}
      </section>

      {selected && <TransactionDetailSheet tx={data.transactions.find((x) => x.id === selected.id) ?? selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatCard({ label, value, cls, icon }: { label: string; value: string; cls: string; icon: React.ReactNode }) {
  return (
    <div className="card h-full !p-3.5">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </p>
      <p className={`mt-1 break-words text-lg font-bold ${cls}`}>{value}</p>
    </div>
  );
}
