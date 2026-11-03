"use client";

import { HandCoins, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EmptyState, Field, PageHeader, ProgressBar, Sheet } from "@/components/ui";
import { debtTotals, type DebtSummary } from "@/lib/calc";
import { isValidIsoDate, todayDhaka } from "@/lib/dates";
import { db, newId } from "@/lib/db";
import { formatPlainPaisa, parseAmountToPaisa } from "@/lib/money";
import type { Debt, DebtKind } from "@/lib/types";

type Tab = "all" | DebtKind;

export default function DebtsPage() {
  const { t, data, money, shortDate, date, dataReady } = useApp();
  const today = todayDhaka();
  const [tab, setTab] = useState<Tab>("all");
  const [formFor, setFormFor] = useState<{ debt?: Debt } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const totals = useMemo(() => debtTotals(data.debts, data.repayments, today), [data.debts, data.repayments, today]);
  const list = useMemo(
    () =>
      totals.summaries
        .filter((s) => tab === "all" || s.debt.kind === tab)
        .sort((a, b) => {
          // বাকি থাকা আগে, তারপর মেয়াদ অনুযায়ী
          if ((a.status === "paid") !== (b.status === "paid")) return a.status === "paid" ? 1 : -1;
          const dueA = a.debt.dueDate ?? "9999-12-31";
          const dueB = b.debt.dueDate ?? "9999-12-31";
          if (dueA !== dueB) return dueA < dueB ? -1 : 1;
          return b.debt.createdAt - a.debt.createdAt; // একই মেয়াদ হলে নতুনটি আগে — তুলনা সব সময় সঙ্গতিপূর্ণ
        }),
    [totals.summaries, tab],
  );
  const detail = detailId ? totals.summaries.find((s) => s.debt.id === detailId) : undefined;

  if (!dataReady) return null;

  const tabs: [Tab, string][] = [
    ["all", t("all")],
    ["lent", t("debtLent")],
    ["borrowed", t("debtBorrowed")],
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("debts")}
        right={
          <button className="btn btn-primary btn-sm" onClick={() => setFormFor({})}>
            <Plus className="h-4 w-4" />
            {t("add")}
          </button>
        }
      />

      <section className="grid grid-cols-2 gap-3">
        <div className="card !p-3.5">
          <p className="text-xs text-muted">{t("receivables")}</p>
          <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{money(totals.receivable)}</p>
        </div>
        <div className="card !p-3.5">
          <p className="text-xs text-muted">{t("payables")}</p>
          <p className="mt-1 text-lg font-bold text-rose-600 dark:text-rose-400">{money(totals.payable)}</p>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-soft p-1" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-11 rounded-xl text-sm font-semibold ${tab === k ? "bg-card shadow-sm" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<HandCoins className="h-8 w-8" />} title={t("noDebtsTitle")} hint={t("noDebtsHint")} action={<button className="btn btn-primary" onClick={() => setFormFor({})}>{t("addDebt")}</button>} />
      ) : (
        <ul className="space-y-3">
          {list.map((s) => (
            <li key={s.debt.id}>
              <button className="card w-full text-left" onClick={() => setDetailId(s.debt.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{s.debt.person}</p>
                    <p className="text-xs text-muted">
                      {s.debt.kind === "lent" ? t("debtLent") : t("debtBorrowed")} • {shortDate(s.debt.date)}
                      {s.debt.dueDate ? ` • ${t("dueOn", { d: shortDate(s.debt.dueDate) })}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-bold ${s.debt.kind === "lent" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{money(s.remaining)}</p>
                    <p className="text-xs text-muted">/ {money(s.debt.amount, false)}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <ProgressBar percent={s.percent} level="ok" />
                </div>
                <div className="mt-2 flex gap-2 text-xs font-semibold">
                  <StatusBadge s={s} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {formFor && <DebtForm debt={formFor.debt} onClose={() => setFormFor(null)} />}
      {detail && (
        <DebtDetail
          s={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            setFormFor({ debt: detail.debt });
          }}
          dateFmt={date}
        />
      )}
    </div>
  );
}

function StatusBadge({ s }: { s: DebtSummary }) {
  const { t } = useApp();
  const cls = s.status === "paid" ? "bg-emerald-100 text-emerald-800" : s.status === "partial" ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-800";
  return (
    <>
      <span className={`rounded-full px-2.5 py-1 ${cls}`}>{s.status === "paid" ? t("statusPaid") : s.status === "partial" ? t("statusPartial") : t("statusUnpaid")}</span>
      {s.overdue && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-800">{t("overdue")}</span>}
    </>
  );
}

function DebtForm({ debt, onClose }: { debt?: Debt; onClose: () => void }) {
  const { t, data, toast } = useApp();
  const [kind, setKind] = useState<DebtKind>(debt?.kind ?? "lent");
  const [person, setPerson] = useState(debt?.person ?? "");
  const [amountText, setAmountText] = useState(debt ? formatPlainPaisa(debt.amount, "en").replace(/,/g, "").replace(/\.00$/, "") : "");
  const [date, setDate] = useState(debt?.date ?? todayDhaka());
  const [dueDate, setDueDate] = useState(debt?.dueDate ?? "");
  const [description, setDescription] = useState(debt?.description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const err: Record<string, string> = {};
    const amount = amountText.trim() ? parseAmountToPaisa(amountText) : null;
    if (!person.trim()) err.person = t("errNameRequired");
    else if (person.length > 100) err.person = t("errTooLong");
    if (!amountText.trim()) err.amount = t("errAmountRequired");
    else if (amount === null) err.amount = t("errAmountInvalid");
    else if (debt) {
      const paid = data.repayments.filter((r) => r.debtId === debt.id).reduce((s, r) => s + r.amount, 0);
      if (amount < paid) err.amount = t("errRepayTooMuch");
    }
    if (!isValidIsoDate(date)) err.date = t("errDateInvalid");
    if (dueDate && !isValidIsoDate(dueDate)) err.dueDate = t("errDateInvalid");
    else if (dueDate && isValidIsoDate(date) && dueDate < date) err.dueDate = t("errDueBeforeDate");
    setErrors(err);
    if (Object.keys(err).length || amount === null) return;

    setBusy(true);
    try {
      const now = Date.now();
      const rec: Debt = {
        id: debt?.id ?? newId(),
        person: person.trim(),
        amount,
        kind,
        date,
        dueDate: dueDate || undefined,
        description: description.trim() || undefined,
        createdAt: debt?.createdAt ?? now,
        updatedAt: now,
      };
      await db.debts.put(rec);
      toast(t("debtSaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={debt ? t("editDebt") : t("addDebt")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(["lent", "borrowed"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-14 rounded-xl border px-2 text-sm font-semibold leading-tight ${kind === k ? (k === "lent" ? "border-emerald-600 bg-emerald-600 text-white" : "border-rose-600 bg-rose-600 text-white") : "border-line bg-card"}`}
            >
              {k === "lent" ? t("debtLentLong") : t("debtBorrowedLong")}
            </button>
          ))}
        </div>
        <Field label={t("person")} error={errors.person}>
          <input className="input" value={person} maxLength={100} onChange={(e) => setPerson(e.target.value)} autoFocus />
        </Field>
        <Field label={t("amount") + " (৳)"} error={errors.amount}>
          <input className="input text-xl font-bold" inputMode="decimal" placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("date")} error={errors.date}>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("dueDate")} optional error={errors.dueDate}>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t("description")} optional>
          <input className="input" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}

function DebtDetail({ s, onClose, onEdit, dateFmt }: { s: DebtSummary; onClose: () => void; onEdit: () => void; dateFmt: (iso: string, wd?: boolean) => string }) {
  const { t, money, toast, confirm } = useApp();
  const [amountText, setAmountText] = useState("");
  const [rDate, setRDate] = useState(todayDhaka());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const d = s.debt;

  async function addRepayment() {
    if (busy) return;
    const amount = amountText.trim() ? parseAmountToPaisa(amountText) : null;
    if (!amountText.trim()) return setError(t("errAmountRequired"));
    if (amount === null) return setError(t("errAmountInvalid"));
    if (!isValidIsoDate(rDate)) return setError(t("errDateInvalid"));
    setBusy(true);
    try {
      // বাকি অঙ্ক ডেটাবেস থেকে এই ট্রানজ্যাকশনের ভেতরেই নতুন করে হিসাব — দুইবার চাপলেও বাড়তি পরিশোধ হবে না
      await db.transaction("rw", db.debts, db.repayments, async () => {
        const debt = await db.debts.get(d.id);
        if (!debt) throw new Error("missing");
        const paid = (await db.repayments.where("debtId").equals(d.id).toArray()).reduce((x, r) => x + r.amount, 0);
        if (amount > debt.amount - paid) throw new Error("too_much");
        await db.repayments.add({ id: newId(), debtId: d.id, amount, date: rDate, note: note.trim() || undefined, createdAt: Date.now() });
      });
      toast(t("repaymentSaved"));
      setAmountText("");
      setNote("");
      setError("");
    } catch (e) {
      if (e instanceof Error && e.message === "too_much") setError(t("errRepayTooMuch"));
      else toast(t("dbError"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeRepayment(id: string) {
    if (!(await confirm({ message: t("repaymentDeleteConfirm") }))) return;
    try {
      await db.repayments.delete(id);
      toast(t("repaymentDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  async function removeDebt() {
    if (!(await confirm({ message: t("debtDeleteConfirm") }))) return;
    try {
      await db.transaction("rw", db.debts, db.repayments, async () => {
        await db.repayments.where("debtId").equals(d.id).delete();
        await db.debts.delete(d.id);
      });
      toast(t("debtDeleted"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <Sheet title={d.person} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-muted">{d.kind === "lent" ? t("debtLentLong") : t("debtBorrowedLong")}</p>
          <p className={`text-3xl font-extrabold ${d.kind === "lent" ? "text-emerald-600" : "text-rose-600"}`}>{money(s.remaining)}</p>
          <p className="text-xs text-muted">
            {t("remainingBalance")} • {t("total")} {money(d.amount)} • {t("paid")} {money(s.paid)}
          </p>
          <div className="mt-2">
            <ProgressBar percent={s.percent} level="ok" />
          </div>
          <div className="mt-2 flex justify-center gap-2 text-xs font-semibold">
            <StatusBadge s={s} />
          </div>
        </div>

        <dl className="divide-y divide-line text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-muted">{t("date")}</dt>
            <dd>{dateFmt(d.date)}</dd>
          </div>
          {d.dueDate && (
            <div className="flex justify-between py-2">
              <dt className="text-muted">{t("dueDate")}</dt>
              <dd>{dateFmt(d.dueDate)}</dd>
            </div>
          )}
          {d.description && (
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-muted">{t("description")}</dt>
              <dd className="text-right">{d.description}</dd>
            </div>
          )}
        </dl>

        {s.remaining > 0 ? (
          <form
            className="rounded-2xl bg-soft p-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void addRepayment();
            }}
          >
            <p className="mb-2 font-bold">{t("addRepayment")}</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" inputMode="decimal" placeholder={t("repayAmount")} aria-label={t("repayAmount")} value={amountText} onChange={(e) => setAmountText(e.target.value)} />
              <input type="date" className="input" value={rDate} onChange={(e) => setRDate(e.target.value)} aria-label={t("date")} />
              <input className="input col-span-2" placeholder={`${t("note")} (${t("optional")})`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            </div>
            {error && <p className="field-error">{error}</p>}
            <button type="submit" className="btn btn-primary mt-2 w-full" disabled={busy}>
              {t("add")}
            </button>
          </form>
        ) : (
          <p className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-800">{t("fullyPaidNote")} ✓</p>
        )}

        <div>
          <h3 className="mb-1 font-bold">{t("repaymentHistory")}</h3>
          {s.repayments.length === 0 ? (
            <p className="text-sm text-muted">{t("noRepayments")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {s.repayments.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-semibold">{money(r.amount)}</p>
                    <p className="text-xs text-muted">
                      {dateFmt(r.date)}
                      {r.note ? ` • ${r.note}` : ""}
                    </p>
                  </div>
                  <button className="flex h-11 w-11 items-center justify-center rounded-full text-rose-600 hover:bg-soft" onClick={() => removeRepayment(r.id)} aria-label={t("delete")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted">{t("debtNote")}</p>

        <div className="flex gap-3">
          <button className="btn btn-ghost flex-1" onClick={onEdit}>
            {t("edit")}
          </button>
          <button className="btn btn-danger flex-1" onClick={removeDebt}>
            {t("delete")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
