"use client";

import { Plus, Receipt, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { useTxForm } from "@/components/TransactionForm";
import { EmptyState, Field, PageHeader, Sheet } from "@/components/ui";
import { isValidIsoDate, todayDhaka } from "@/lib/dates";
import { db } from "@/lib/db";
import { isPending, isReceived, markReceived, pendingTotal, undoReceived } from "@/lib/reimburse";
import type { Transaction } from "@/lib/types";

const byDateDesc = (a: Transaction, b: Transaction) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt);

export default function ReimbursementsPage() {
  const { t, data, catName, money, date, toast, confirm, dataReady } = useApp();
  const form = useTxForm();
  const [receiving, setReceiving] = useState<Transaction | null>(null);

  const pending = useMemo(() => data.transactions.filter(isPending).sort(byDateDesc), [data.transactions]);
  const received = useMemo(() => data.transactions.filter(isReceived).sort((a, b) => ((b.reimbursedAt ?? "") < (a.reimbursedAt ?? "") ? -1 : 1)).slice(0, 15), [data.transactions]);
  const total = useMemo(() => pendingTotal(data.transactions), [data.transactions]);

  if (!dataReady) return null;

  const titleOf = (tx: Transaction) => tx.description || catName(data.categories.find((c) => c.id === tx.categoryId));

  async function undo(tx: Transaction) {
    if (!(await confirm({ message: t("reimbUndoConfirm"), danger: true, confirmText: t("reimbUndo") }))) return;
    try {
      await undoReceived(tx.id);
      toast(t("reimbUndone"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  async function removeFlag(tx: Transaction) {
    if (!(await confirm({ message: t("reimbRemoveConfirm"), confirmText: t("reimbRemoveFlag") }))) return;
    try {
      await db.transactions.put({ ...tx, reimbursable: undefined, updatedAt: Date.now() });
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("navReimbursements")}
        right={
          <button className="btn btn-primary" onClick={() => form.open({ type: "expense", reimbursable: true })}>
            <Plus className="h-5 w-5" />
            {t("add")}
          </button>
        }
      />
      <p className="mb-4 text-sm text-muted">{t("reimbHint")}</p>

      <div className="card mb-4">
        <p className="text-sm text-muted">{t("reimbPendingTotal")}</p>
        <p className="text-2xl font-bold">{money(total)}</p>
        <p className="text-xs text-muted">{t("reimbPendingCount", { n: pending.length })}</p>
      </div>

      {pending.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title={t("reimbNone")}
            hint={t("reimbNoneHint")}
            action={
              <button className="btn btn-primary" onClick={() => form.open({ type: "expense", reimbursable: true })}>
                <Plus className="h-5 w-5" />
                {t("reimbAddExpense")}
              </button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((tx) => (
            <li key={tx.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{titleOf(tx)}</p>
                  <p className="text-sm text-muted">{date(tx.date)}</p>
                </div>
                <p className="shrink-0 text-lg font-bold">{money(tx.amount)}</p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button className="btn btn-primary flex-1" onClick={() => setReceiving(tx)}>
                  {t("reimbReceive")}
                </button>
                <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-soft" onClick={() => void removeFlag(tx)} aria-label={t("reimbRemoveFlag")}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {received.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">{t("reimbRecent")}</h2>
          <ul className="space-y-2">
            {received.map((tx) => (
              <li key={tx.id} className="card flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{titleOf(tx)}</p>
                  <p className="text-xs text-muted">
                    {t("reimbReceivedOn")}: {date(tx.reimbursedAt ?? tx.date)}
                  </p>
                </div>
                <p className="shrink-0 font-bold text-emerald-700 dark:text-emerald-400">{money(tx.amount)}</p>
                <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-soft" onClick={() => void undo(tx)} aria-label={t("reimbUndo")}>
                  <Undo2 className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {receiving && <ReceiveSheet tx={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}

function ReceiveSheet({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { t, data, money, toast } = useApp();
  const [dateText, setDateText] = useState(todayDhaka());
  const [accountId, setAccountId] = useState(tx.accountId && data.accounts.some((a) => a.id === tx.accountId) ? tx.accountId : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (!isValidIsoDate(dateText) || dateText < "2000-01-01" || dateText > "2100-12-31") return setError(t("errDateInvalid"));
    setBusy(true);
    try {
      await markReceived(tx.id, dateText, accountId || undefined, t("reimbOf"));
      toast(t("reimbDone"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("reimbReceiveTitle")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="card">
          <p className="text-sm text-muted">{tx.description || t("reimbReceiveTitle")}</p>
          <p className="text-2xl font-bold">{money(tx.amount)}</p>
        </div>
        <Field label={t("reimbReceivedOn")} error={error}>
          <input className="input" type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} />
        </Field>
        {data.accounts.length > 0 && (
          <Field label={t("reimbIntoAccount")} optional>
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
          {t("reimbReceive")}
        </button>
      </form>
    </Sheet>
  );
}
