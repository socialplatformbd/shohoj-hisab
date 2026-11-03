"use client";

import { ChevronLeft, ChevronRight, Download, Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { TransactionDetailSheet, TransactionRow } from "@/components/TransactionParts";
import { EmptyState, IncomeExpenseChart, PageHeader } from "@/components/ui";
import { categoryBreakdown, dailySeries, filterRange, monthlySeries, sumTx } from "@/lib/calc";
import { saveBlob } from "@/lib/backup";
import { transactionsToCsv } from "@/lib/csv";
import { addDays, addMonths, daysBetween, endOfWeek, periodKeyOf, periodRange, startOfMonth, startOfWeek, todayDhaka } from "@/lib/dates";
import { percentOf } from "@/lib/money";

type Mode = "daily" | "weekly" | "monthly" | "custom";

export default function ReportsPage() {
  const { t, data, catName, money, num, date, shortDate, monthLabel, monthShort, settings, toast, dataReady } = useApp();
  const startDay = settings.monthStartDay;
  const today = todayDhaka();
  const [mode, setMode] = useState<Mode>("monthly");
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(periodKeyOf(today, startDay));
  const [week, setWeek] = useState(today);
  const [custom, setCustom] = useState({ from: startOfMonth(today), to: today });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (mode === "daily") return { from: day, to: day };
    if (mode === "weekly") return { from: startOfWeek(week), to: endOfWeek(week) };
    if (mode === "monthly") return periodRange(month, startDay);
    return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
  }, [mode, day, week, month, custom, startDay]);

  const list = useMemo(
    () =>
      filterRange(data.transactions, range.from, range.to).sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
    [data.transactions, range],
  );
  const totals = useMemo(() => sumTx(list), [list]);
  const cats = useMemo(() => categoryBreakdown(list, "expense"), [list]);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const span = daysBetween(range.from, range.to) + 1;
  const series = useMemo(() => {
    if (span <= 31) return dailySeries(list, range.from, range.to);
    const fm = periodKeyOf(range.from, startDay);
    const tm = periodKeyOf(range.to, startDay);
    const capped = addMonths(tm, -35) > fm ? addMonths(tm, -35) : fm;
    return monthlySeries(list, capped, tm, startDay);
  }, [list, range, span, startDay]);

  const savingsRate = percentOf(Math.max(0, totals.savings), totals.income);
  const selected = selectedId ? data.transactions.find((x) => x.id === selectedId) : undefined;

  function shift(dir: -1 | 1) {
    if (mode === "daily") setDay(addDays(day, dir));
    else if (mode === "weekly") setWeek(addDays(week, 7 * dir));
    else if (mode === "monthly") setMonth(addMonths(month, dir));
  }

  async function exportCsv() {
    if (list.length === 0) return toast(t("csvNothing"), "warn");
    try {
      const blob = new Blob([transactionsToCsv(list, data.categories)], { type: "text/csv;charset=utf-8" });
      const r = await saveBlob(blob, `shohoj-hisab-report-${range.from}_${range.to}.csv`, "text/csv", "CSV", ".csv");
      if (r !== "cancelled") toast(t("csvExported"));
    } catch {
      toast(t("unexpectedError"), "error");
    }
  }

  const modes: [Mode, string][] = [
    ["daily", t("repDaily")],
    ["weekly", t("repWeekly")],
    ["monthly", t("repMonthly")],
    ["custom", t("repCustom")],
  ];
  const periodLabel =
    mode === "daily" ? date(day, true) : mode === "monthly" ? monthLabel(month) : `${date(range.from)} – ${date(range.to)}`;

  if (!dataReady) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("reports")}
        right={
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            {t("exportCsv")}
          </button>
        }
      />

      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-soft p-1" role="tablist">
        {modes.map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`min-h-11 rounded-xl text-sm font-semibold ${mode === m ? "bg-card shadow-sm" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {mode !== "custom" ? (
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost px-3" onClick={() => shift(-1)} aria-label={t("prev")}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate font-bold">{periodLabel}</p>
            {mode === "daily" && <input type="date" className="input mt-1" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />}
            {mode === "weekly" && (
              <>
                <p className="text-xs text-muted">{t("weekOf")}</p>
                <input type="date" className="input mt-1" value={week} onChange={(e) => e.target.value && setWeek(e.target.value)} />
              </>
            )}
            {mode === "monthly" && <input type="month" className="input mt-1" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
          </div>
          <button className="btn btn-ghost px-3" onClick={() => shift(1)} aria-label={t("next")}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
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

      <section className="grid grid-cols-2 gap-3">
        <Stat label={t("totalIncome")} value={money(totals.income)} cls="text-emerald-600 dark:text-emerald-400" />
        <Stat label={t("totalExpense")} value={money(totals.expense)} cls="text-rose-600 dark:text-rose-400" />
        <Stat label={t("repBalance")} value={money(totals.balance)} cls={totals.balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"} />
        <Stat label={t("repNetSavings")} value={money(totals.savings)} cls="text-sky-600 dark:text-sky-400" />
      </section>

      <section className="card">
        <h2 className="mb-3 font-bold">{t("incomeVsExpense")}</h2>
        <IncomeExpenseChart
          points={series}
          labelOf={(k) => (k.length === 7 ? monthShort(k) : span <= 7 ? shortDate(k) : num(Number(k.slice(8))))}
        />
      </section>

      <section className="card">
        <h2 className="mb-3 font-bold">{t("repCategory")}</h2>
        {cats.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">{t("noExpenseInPeriod")}</p>
        ) : (
          <ul className="space-y-3">
            {cats.map((c) => (
              <li key={c.categoryId}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{catName(catById.get(c.categoryId))}</span>
                  <span className="shrink-0">
                    {money(c.total)} <span className="text-muted">({num(c.percent)}%)</span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-soft">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(2, c.percent)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 font-bold">{t("repSavings")}</h2>
        <dl className="space-y-2 text-sm">
          <Row k={t("repSaved")} v={money(totals.saving)} />
          <Row k={t("repWithdrawn")} v={money(totals.withdraw)} />
          <Row k={t("repNetSavings")} v={money(totals.savings)} bold />
          <Row k={t("repSavingsRate")} v={totals.income > 0 ? `${num(savingsRate)}%` : "—"} />
        </dl>
      </section>

      <section className="card">
        <h2 className="font-bold">
          {t("repTransactions")} <span className="text-sm font-normal text-muted">({num(list.length)})</span>
        </h2>
        {list.length === 0 ? (
          <EmptyState icon={<Receipt className="h-8 w-8" />} title={t("noResults")} />
        ) : (
          <div className="divide-y divide-line">
            {list.map((x) => (
              <TransactionRow key={x.id} tx={x} onClick={() => setSelectedId(x.id)} />
            ))}
          </div>
        )}
      </section>
      {selected && <TransactionDetailSheet tx={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="card !p-3.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 break-words text-lg font-bold ${cls}`}>{value}</p>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
