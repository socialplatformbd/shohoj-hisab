"use client";

import { ChevronLeft, ChevronRight, Copy, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EmptyState, Field, PageHeader, ProgressBar, Sheet } from "@/components/ui";
import { budgetStatuses, type BudgetStatus } from "@/lib/calc";
import { addMonths, periodKeyOf, periodRange, todayDhaka } from "@/lib/dates";
import { db, newId } from "@/lib/db";
import { formatPlainPaisa, parseAmountToPaisa } from "@/lib/money";
import type { Budget } from "@/lib/types";

export default function BudgetsPage() {
  const { t, data, catName, money, num, monthLabel, date, settings, toast, confirm, dataReady } = useApp();
  const startDay = settings.monthStartDay;
  const [month, setMonth] = useState(periodKeyOf(todayDhaka(), startDay));
  const [editing, setEditing] = useState<{ budget?: Budget } | null>(null);

  const statuses = useMemo(() => budgetStatuses(data.budgets, data.transactions, month, startDay), [data.budgets, data.transactions, month, startDay]);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const overall = statuses.find((s) => s.budget.categoryId === null);
  const catStatuses = statuses.filter((s) => s.budget.categoryId !== null);

  async function remove(b: Budget) {
    if (!(await confirm({ message: t("budgetDeleteConfirm") }))) return;
    try {
      await db.budgets.delete(b.id);
      toast(t("budgetDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  async function copyPrev() {
    const prevKey = addMonths(month, -1);
    const prev = data.budgets.filter((b) => b.month === prevKey);
    const existing = new Set(data.budgets.filter((b) => b.month === month).map((b) => b.categoryId));
    const now = Date.now();
    const add: Budget[] = prev
      .filter((b) => !existing.has(b.categoryId))
      .map((b) => ({ ...b, id: newId(), month, createdAt: now, updatedAt: now }));
    if (!add.length) return toast(t("nothingToCopy"), "info");
    try {
      await db.budgets.bulkAdd(add);
      toast(t("copiedBudgets", { n: add.length }));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  const card = (s: BudgetStatus) => {
    const name = s.budget.categoryId === null ? t("overallBudget") : catName(catById.get(s.budget.categoryId));
    return (
      <div key={s.budget.id} className="card">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold">{name}</p>
            <p className="text-sm text-muted">{money(s.budget.amount)}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setEditing({ budget: s.budget })} aria-label={t("edit")}>
              <Pencil className="h-4 w-4" />
            </button>
            <button className="flex h-11 w-11 items-center justify-center rounded-full text-rose-600 hover:bg-soft" onClick={() => remove(s.budget)} aria-label={t("delete")}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <ProgressBar percent={s.percent} level={s.level} />
        <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-sm">
          <span>
            {t("spent")}: <b>{money(s.spent)}</b>
          </span>
          <span className={s.remaining < 0 ? "font-semibold text-rose-600" : ""}>
            {s.remaining >= 0 ? `${t("remaining")}: ${money(s.remaining)}` : `${t("overBy")}: ${money(-s.remaining)}`}
          </span>
          <span className={s.level === "over" ? "font-bold text-rose-600" : s.level === "warn" ? "font-bold text-amber-600" : "text-muted"}>
            {t("percentUsed")} {num(s.percent)}%
          </span>
        </div>
        {s.level !== "ok" && (
          <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${s.level === "over" ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
            {s.level === "over" ? t("budgetOver", { name }) : t("budgetWarn", { name, p: s.percent })}
          </p>
        )}
      </div>
    );
  };

  if (!dataReady) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("budgets")}
        right={
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>
            <Plus className="h-4 w-4" />
            {t("add")}
          </button>
        }
      />
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost px-3" onClick={() => setMonth(addMonths(month, -1))} aria-label={t("prev")}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-lg font-bold">{monthLabel(month)}</p>
          {startDay > 1 && (
            <p className="text-xs text-muted">
              {date(periodRange(month, startDay).from)} – {date(periodRange(month, startDay).to)}
            </p>
          )}
        </div>
        <button className="btn btn-ghost px-3" onClick={() => setMonth(addMonths(month, 1))} aria-label={t("next")}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {statuses.length === 0 ? (
        <EmptyState
          icon={<PiggyBank className="h-8 w-8" />}
          title={t("noBudgetsTitle")}
          hint={t("noBudgetsHint")}
          action={
            <div className="flex flex-col gap-2">
              <button className="btn btn-primary" onClick={() => setEditing({})}>
                {t("addBudget")}
              </button>
              {data.budgets.some((b) => b.month === addMonths(month, -1)) && (
                <button className="btn btn-ghost" onClick={copyPrev}>
                  <Copy className="h-4 w-4" />
                  {t("copyPrevBudgets")}
                </button>
              )}
            </div>
          }
        />
      ) : (
        <>
          {overall && card(overall)}
          {catStatuses.length > 0 && <h2 className="pt-1 font-bold">{t("categoryBudgets")}</h2>}
          {catStatuses.map(card)}
          {data.budgets.some((b) => b.month === addMonths(month, -1)) && (
            <button className="btn btn-ghost w-full" onClick={copyPrev}>
              <Copy className="h-4 w-4" />
              {t("copyPrevBudgets")}
            </button>
          )}
        </>
      )}

      {editing && <BudgetSheet month={month} budget={editing.budget} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BudgetSheet({ month, budget, onClose }: { month: string; budget?: Budget; onClose: () => void }) {
  const { t, data, catName, toast } = useApp();
  const [categoryId, setCategoryId] = useState<string>(budget ? (budget.categoryId ?? "") : "");
  const [amountText, setAmountText] = useState(budget ? formatPlainPaisa(budget.amount, "en").replace(/,/g, "").replace(/\.00$/, "") : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const expenseCats = data.categories.filter((c) => c.type === "expense");

  async function submit() {
    if (busy) return;
    const amount = amountText.trim() ? parseAmountToPaisa(amountText) : null;
    if (!amountText.trim()) return setError(t("errAmountRequired"));
    if (amount === null) return setError(t("errAmountInvalid"));
    setError("");
    setBusy(true);
    try {
      const now = Date.now();
      const catId = categoryId === "" ? null : categoryId;
      const existing = data.budgets.find((b) => b.month === month && b.categoryId === catId);
      if (budget) {
        await db.budgets.put({ ...budget, amount, updatedAt: now });
        toast(t("budgetSaved"));
      } else if (existing) {
        await db.budgets.put({ ...existing, amount, updatedAt: now });
        toast(t("budgetExists"), "info");
      } else {
        await db.budgets.add({ id: newId(), month, categoryId: catId, amount, createdAt: now, updatedAt: now });
        toast(t("budgetSaved"));
      }
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={budget ? t("editBudget") : t("addBudget")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("budgetFor")}>
          <select className="input" value={categoryId} disabled={!!budget} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t("overallBudget")}</option>
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>
                {catName(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("budgetAmount") + " (৳)"} error={error}>
          <input className="input text-xl font-bold" inputMode="decimal" placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value)} autoFocus />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
