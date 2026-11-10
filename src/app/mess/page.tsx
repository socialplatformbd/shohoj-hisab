"use client";

import { ChevronLeft, ChevronRight, Share2, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EmptyState, Field, PageHeader, ProgressBar, Sheet } from "@/components/ui";
import { addMonths, monthKey, todayDhaka } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatPlainPaisa, parseAmountToPaisa } from "@/lib/money";
import { messBudgetStatus, messCostBreakdown, messSummary } from "@/lib/mess";
import type { MessBudget } from "@/lib/types";

export default function MessHomePage() {
  const { t, data, money, num, monthLabel, toast, confirm, dataReady } = useApp();
  const [month, setMonth] = useState(monthKey(todayDhaka()));
  const [budgetOpen, setBudgetOpen] = useState(false);
  const s = useMemo(() => messSummary(data.messMembers, data.messMeals, data.messEntries, month), [data.messMembers, data.messMeals, data.messEntries, month]);

  if (!dataReady) return null;

  const budgetRow = data.messBudgets.find((b) => b.month === month);
  const prevBudget = data.messBudgets.find((b) => b.month === addMonths(month, -1));
  const st = budgetRow ? messBudgetStatus(s, budgetRow.amount, month, todayDhaka()) : null;
  const costs = messCostBreakdown(data.messEntries, month);

  async function copyPrev() {
    if (!prevBudget) return;
    try {
      const now = Date.now();
      await db.messBudgets.put({ id: month, month, amount: prevBudget.amount, createdAt: now, updatedAt: now });
      toast(t("messBudgetSaved"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  async function share() {
    const lines = [
      t("messShareHeading", { m: monthLabel(month) }),
      ...(st ? [`${t("messBudgetTitle")}: ${money(st.budget)} • ${t("messBudgetSpent")}: ${money(st.spent)} • ${t("messBudgetRemaining")}: ${money(st.remaining)}`] : []),
      `${t("messTotalBazaar")}: ${money(s.totalBazaar)}`,
      `${t("messTotalMeals")}: ${num(s.totalHalves / 2)}`,
      `${t("messMealRate")}: ${money(s.mealRate)}`,
      `${t("messTotalShared")}: ${money(s.totalShared)}`,
      "",
      ...s.rows.map((r) => {
        const state = r.balance > 0 ? `${t("messGets")} ${money(r.balance)}` : r.balance < 0 ? `${t("messOwes")} ${money(-r.balance)}` : t("messSettled");
        return `${r.member.name} — ${t("messMealsLabel")} ${num(r.halves / 2)} — ${state}`;
      }),
    ];
    const text = lines.join("\n");
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast(t("messCopied"));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // ব্যবহারকারী শেয়ার বাতিল করেছেন
      toast(t("dbError"), "error");
    }
  }

  const stats = [
    { label: t("messTotalBazaar"), value: money(s.totalBazaar) },
    { label: t("messTotalMeals"), value: num(s.totalHalves / 2) },
    { label: t("messMealRate"), value: money(s.mealRate) },
    { label: t("messTotalShared"), value: money(s.totalShared) },
    { label: t("messTotalDeposits"), value: money(s.totalDeposits) },
    { label: t("messPool"), value: money(s.pool) },
  ];

  return (
    <div>
      <PageHeader title={t("messTitle")} />

      <div className="mb-4 flex items-center gap-2">
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setMonth(addMonths(month, -1))} aria-label="−1">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="flex-1 text-center text-lg font-bold">{monthLabel(month)}</p>
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setMonth(addMonths(month, 1))} aria-label="+1">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {data.messMembers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={t("messNoMembersTitle")}
            hint={t("messNoMembersHint")}
            action={
              <Link href="/mess/members" className="btn btn-primary">
                {t("messMemberAdd")}
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <section className="card mb-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{t("messBudgetTitle")}</h2>
              {st && (
                <button className="btn btn-ghost" onClick={() => setBudgetOpen(true)}>
                  {t("messBudgetEdit")}
                </button>
              )}
            </div>
            {st ? (
              <>
                <div className="mb-1 flex justify-between text-sm">
                  <span>
                    {t("messBudgetSpent")}: <b>{money(st.spent)}</b> / {money(st.budget)}
                  </span>
                  <b>{num(st.percent)}%</b>
                </div>
                <ProgressBar percent={st.percent} level={st.level} />
                <p className={`mt-1.5 text-sm ${st.remaining < 0 ? "text-rose-600" : "text-muted"}`}>
                  {st.remaining >= 0 ? `${t("messBudgetRemaining")}: ${money(st.remaining)}` : t("messBudgetOver", { a: money(-st.remaining) })}
                </p>
                {st.level === "warn" && <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-400">{t("messBudgetWarn", { p: num(st.percent) })}</p>}
                {st.dailyAllowance > 0 && (
                  <p className="mt-1 text-sm">
                    {t("messBudgetDaily", { a: money(st.dailyAllowance) })} • {t("messBudgetDaysLeft", { d: num(st.daysLeft) })}
                  </p>
                )}
                {st.willExceed && (
                  <p className="mt-2 rounded-xl bg-amber-100 p-2 text-sm font-medium text-amber-900" role="status">
                    {t("messBudgetWillExceed")} ({t("messBudgetProjected", { a: money(st.projected) })})
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {t("messBudgetPerMember")}: {money(st.perMember)}
                </p>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">{t("messBudgetNone")}</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary" onClick={() => setBudgetOpen(true)}>
                    {t("messBudgetSet")}
                  </button>
                  {prevBudget && (
                    <button className="btn btn-ghost" onClick={() => void copyPrev()}>
                      {t("messBudgetCopyPrev")}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          <div className="mb-4 grid grid-cols-2 gap-3">
            {stats.map((x) => (
              <div key={x.label} className="card">
                <p className="text-xs text-muted">{x.label}</p>
                <p className="text-lg font-bold">{x.value}</p>
              </div>
            ))}
          </div>
          <p className="mb-4 text-xs text-muted">{t("messPoolHint")}</p>
          {costs.length > 0 && (
            <section className="card mb-4">
              <h2 className="mb-2 text-lg font-bold">{t("messCostBreakdown")}</h2>
              <ul className="space-y-1">
                {costs.map((c) => (
                  <li key={`${c.kind}:${c.label ?? ""}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{c.kind === "bazaar" ? t("messKindBazaar") : (c.label ?? t("messCostOther"))}</span>
                    <b className="shrink-0">{money(c.amount)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {s.noMeals && (
            <p className="mb-4 rounded-xl bg-amber-100 p-3 text-sm font-medium text-amber-900" role="status">
              {t("messNoMeals")}
            </p>
          )}

          <h2 className="mb-2 text-lg font-bold">{t("messSettlement")}</h2>
          <ul className="space-y-3">
            {s.rows.map((r) => (
              <li key={r.member.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-base font-semibold">
                    {r.member.name}
                    {!r.member.active && <span className="ml-2 text-xs font-normal text-muted">({t("messMemberInactive")})</span>}
                  </p>
                  <div className="shrink-0 text-right">
                    <p className={`text-lg font-bold ${r.balance > 0 ? "text-emerald-700 dark:text-emerald-400" : r.balance < 0 ? "text-rose-600" : ""}`}>{money(Math.abs(r.balance))}</p>
                    <p className="text-xs text-muted">{r.balance > 0 ? t("messGets") : r.balance < 0 ? t("messOwes") : t("messSettled")}</p>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
                  <div className="flex justify-between">
                    <dt>{t("messMealsLabel")}</dt>
                    <dd>{num(r.halves / 2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("messMealCost")}</dt>
                    <dd>{money(r.mealCost)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("messSharedShare")}</dt>
                    <dd>{money(r.shared)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("messDeposited")}</dt>
                    <dd>{money(r.deposits)}</dd>
                  </div>
                  {st && st.perMember > 0 && (
                    <div className="col-span-2 flex justify-between">
                      <dt>{t("messDepositTarget")}</dt>
                      <dd>
                        {money(st.perMember)}
                        {r.deposits < st.perMember ? ` • ${t("messDepositLeft", { a: money(st.perMember - r.deposits) })}` : ""}
                      </dd>
                    </div>
                  )}
                  {r.paid > 0 && (
                    <div className="col-span-2 flex justify-between">
                      <dt>{t("messPaidPocket")}</dt>
                      <dd>{money(r.paid)}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>

          <button className="btn btn-ghost mt-4 w-full" onClick={() => void share()}>
            <Share2 className="h-5 w-5" />
            {t("messShare")}
          </button>
        </>
      )}

      {budgetOpen && <MessBudgetSheet month={month} current={budgetRow} onClose={() => setBudgetOpen(false)} />}
    </div>
  );
}

function MessBudgetSheet({ month, current, onClose }: { month: string; current?: MessBudget; onClose: () => void }) {
  const { t, monthLabel, toast, confirm } = useApp();
  const [amountText, setAmountText] = useState(current ? formatPlainPaisa(current.amount, "en").replace(/,/g, "").replace(/\.00$/, "") : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const amount = amountText.trim() ? parseAmountToPaisa(amountText) : null;
    if (!amountText.trim()) return setError(t("errAmountRequired"));
    if (amount === null) return setError(t("errAmountInvalid"));
    setBusy(true);
    try {
      const now = Date.now();
      await db.messBudgets.put({ id: month, month, amount, createdAt: current?.createdAt ?? now, updatedAt: now });
      toast(t("messBudgetSaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirm({ message: t("messBudgetDeleteConfirm"), danger: true, confirmText: t("delete") }))) return;
    try {
      await db.messBudgets.delete(month);
      toast(t("messBudgetDeleted"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <Sheet title={`${t("messBudgetTitle")} — ${monthLabel(month)}`} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-muted">{t("messBudgetHint")}</p>
        <Field label={t("messBudgetAmount")} error={error}>
          <input className="input text-xl font-bold" inputMode="decimal" placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value)} autoFocus />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
        {current && (
          <button type="button" className="btn btn-ghost w-full text-rose-600" onClick={() => void remove()}>
            {t("delete")}
          </button>
        )}
      </form>
    </Sheet>
  );
}
