"use client";

import { Flag, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EmptyState, Field, PageHeader, ProgressBar, Sheet } from "@/components/ui";
import { isValidIsoDate, todayDhaka } from "@/lib/dates";
import { FALLBACK_CATEGORY, db, newId } from "@/lib/db";
import { goalProgress } from "@/lib/goals";
import { formatPlainPaisa, parseAmountToPaisa } from "@/lib/money";
import type { Goal } from "@/lib/types";

type SheetState = { kind: "form"; goal?: Goal } | { kind: "money"; goal: Goal; type: "saving" | "withdraw" } | null;

export default function GoalsPage() {
  const { t, data, money, num, date, toast, confirm, dataReady } = useApp();
  const [sheet, setSheet] = useState<SheetState>(null);
  const today = todayDhaka();
  const rows = useMemo(
    () =>
      data.goals
        .map((g) => ({ goal: g, p: goalProgress(g, data.transactions, today) }))
        .sort((a, b) => Number(a.p.done) - Number(b.p.done) || (a.goal.deadline ?? "9999") .localeCompare(b.goal.deadline ?? "9999") || a.goal.createdAt - b.goal.createdAt),
    [data.goals, data.transactions, today],
  );

  if (!dataReady) return null;

  async function remove(g: Goal) {
    if (!(await confirm({ message: t("goalDeleteConfirm"), danger: true, confirmText: t("delete") }))) return;
    try {
      // জমার লেনদেন থেকে যায়, শুধু লক্ষ্যের সাথে সম্পর্ক ছিন্ন হয় (নইলে ব্যাকআপ অবৈধ হতো)
      await db.transaction("rw", [db.goals, db.transactions], async () => {
        const linked = await db.transactions.filter((x) => x.goalId === g.id).toArray();
        for (const x of linked) {
          const next = { ...x, updatedAt: Date.now() };
          delete next.goalId;
          await db.transactions.put(next);
        }
        await db.goals.delete(g.id);
      });
      toast(t("goalDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("navGoals")}
        right={
          <button className="btn btn-primary" onClick={() => setSheet({ kind: "form" })}>
            <Plus className="h-5 w-5" />
            {t("add")}
          </button>
        }
      />
      <p className="mb-4 text-sm text-muted">{t("goalsHint")}</p>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Flag className="h-8 w-8" />}
            title={t("goalEmptyTitle")}
            hint={t("goalEmptyHint")}
            action={
              <button className="btn btn-primary" onClick={() => setSheet({ kind: "form" })}>
                <Plus className="h-5 w-5" />
                {t("goalAdd")}
              </button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ goal: g, p }) => (
            <li key={g.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-base font-semibold">{g.name}</p>
                <b className="shrink-0">{num(p.percent)}%</b>
              </div>
              <div className="my-2">
                <ProgressBar percent={p.percent} level={p.done ? "ok" : p.overdue ? "over" : "ok"} />
              </div>
              <div className="flex justify-between text-sm">
                <span>
                  {t("goalSaved")}: <b>{money(p.saved)}</b>
                </span>
                <span className="text-muted">
                  {t("goalRemaining")}: {money(p.remaining)} / {money(g.target)}
                </span>
              </div>
              {p.done && <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t("goalDone")}</p>}
              {p.overdue && <p className="mt-1 text-sm font-medium text-rose-600">{t("goalOverdue")}</p>}
              {!p.done && p.monthsLeft !== null && p.neededPerMonth !== null && (
                <p className="mt-1 text-sm">
                  {t("goalNeeded", { a: money(p.neededPerMonth) })} • {t("goalMonthsLeft", { m: num(p.monthsLeft) })}
                </p>
              )}
              {g.deadline && <p className="text-xs text-muted">{t("goalDeadline")}: {date(g.deadline)}</p>}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={() => setSheet({ kind: "money", goal: g, type: "saving" })}>
                  <Plus className="h-5 w-5" />
                  {t("goalDeposit")}
                </button>
                <button className="btn btn-ghost" onClick={() => setSheet({ kind: "money", goal: g, type: "withdraw" })} disabled={p.saved === 0}>
                  <Minus className="h-5 w-5" />
                  {t("goalWithdraw")}
                </button>
              </div>
              <div className="mt-1 flex justify-end gap-1">
                <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setSheet({ kind: "form", goal: g })} aria-label={t("edit")}>
                  <Pencil className="h-5 w-5" />
                </button>
                <button className="flex h-11 w-11 items-center justify-center rounded-full text-rose-600 hover:bg-soft" onClick={() => void remove(g)} aria-label={t("delete")}>
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {sheet?.kind === "form" && <GoalFormSheet goal={sheet.goal} onClose={() => setSheet(null)} />}
      {sheet?.kind === "money" && <GoalMoneySheet goal={sheet.goal} type={sheet.type} saved={goalProgress(sheet.goal, data.transactions, today).saved} onClose={() => setSheet(null)} />}
    </div>
  );
}

function GoalFormSheet({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { t, data, toast } = useApp();
  const [name, setName] = useState(goal?.name ?? "");
  const [targetText, setTargetText] = useState(goal ? formatPlainPaisa(goal.target, "en").replace(/,/g, "").replace(/\.00$/, "") : "");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [errors, setErrors] = useState<{ name?: string; target?: string; deadline?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const err: typeof errors = {};
    const n = name.trim();
    const target = targetText.trim() ? parseAmountToPaisa(targetText) : null;
    if (!n) err.name = t("errNameRequired");
    else if (n.length > 60) err.name = t("errTooLong");
    else if (data.goals.some((g) => g.id !== goal?.id && g.name.toLowerCase() === n.toLowerCase())) err.name = t("errDuplicate");
    if (!targetText.trim()) err.target = t("errAmountRequired");
    else if (target === null) err.target = t("errAmountInvalid");
    if (deadline && (!isValidIsoDate(deadline) || deadline < "2000-01-01" || deadline > "2100-12-31")) err.deadline = t("errDateInvalid");
    setErrors(err);
    if (Object.keys(err).length || target === null) return;
    setBusy(true);
    try {
      const now = Date.now();
      await db.goals.put({ id: goal?.id ?? newId(), name: n, target, deadline: deadline || undefined, createdAt: goal?.createdAt ?? now, updatedAt: now });
      toast(t("goalSavedMsg"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={goal ? t("goalEdit") : t("goalAdd")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("goalName")} error={errors.name}>
          <input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t("goalTarget")} error={errors.target}>
          <input className="input text-xl font-bold" inputMode="decimal" placeholder="0.00" value={targetText} onChange={(e) => setTargetText(e.target.value)} />
        </Field>
        <Field label={t("goalDeadline")} optional error={errors.deadline}>
          <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}

function GoalMoneySheet({ goal, type, saved, onClose }: { goal: Goal; type: "saving" | "withdraw"; saved: number; onClose: () => void }) {
  const { t, data, money, toast } = useApp();
  const [amountText, setAmountText] = useState("");
  const [dateText, setDateText] = useState(todayDhaka());
  const [accountId, setAccountId] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const err: typeof errors = {};
    const amount = amountText.trim() ? parseAmountToPaisa(amountText) : null;
    if (!amountText.trim()) err.amount = t("errAmountRequired");
    else if (amount === null || (type === "withdraw" && amount > saved)) err.amount = t("errAmountInvalid");
    if (!isValidIsoDate(dateText) || dateText < "2000-01-01" || dateText > "2100-12-31") err.date = t("errDateInvalid");
    setErrors(err);
    if (Object.keys(err).length || amount === null) return;
    setBusy(true);
    try {
      const now = Date.now();
      // সঞ্চয়/উত্তোলন সাধারণ লেনদেনেরই মতো — ব্যালেন্স ও অ্যাকাউন্টে ঠিকমতো ধরা পড়ে; goalId দিয়ে লক্ষ্যের সাথে বাঁধা
      await db.transactions.add({
        id: newId(),
        type,
        amount,
        categoryId: FALLBACK_CATEGORY[type],
        date: dateText,
        description: goal.name,
        accountId: data.accounts.some((a) => a.id === accountId) ? accountId : undefined,
        goalId: goal.id,
        createdAt: now,
        updatedAt: now,
      });
      toast(t("goalSavedMsg"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={`${type === "saving" ? t("goalDeposit") : t("goalWithdraw")} — ${goal.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {type === "withdraw" && (
          <p className="text-sm text-muted">
            {t("goalWithdrawNote")} ({t("goalSaved")}: {money(saved)})
          </p>
        )}
        <Field label={t("amount") + " (৳)"} error={errors.amount}>
          <input className="input text-xl font-bold" inputMode="decimal" placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value)} autoFocus />
        </Field>
        <Field label={t("date")} error={errors.date}>
          <input className="input" type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} />
        </Field>
        {data.accounts.length > 0 && (
          <Field label={t("accountField")} optional>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">—</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
