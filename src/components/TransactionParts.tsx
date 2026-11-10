"use client";

import { ArrowDownLeft, ArrowUpRight, Coins, Wallet } from "lucide-react";
import { useState } from "react";
import { dhakaDateOf } from "@/lib/dates";
import { db } from "@/lib/db";
import { isPending, isReceived } from "@/lib/reimburse";
import { PAYMENT_METHODS, type Transaction } from "@/lib/types";
import { useApp } from "./AppProvider";
import { useTxForm } from "./TransactionForm";
import { Sheet, TYPE_STYLE } from "./ui";

const ICONS = { income: ArrowDownLeft, expense: ArrowUpRight, saving: Coins, withdraw: Wallet } as const;
const TYPE_LABEL = { income: "typeIncome", expense: "typeExpense", saving: "typeSaving", withdraw: "typeWithdraw" } as const;
const isMethod = (m: string): m is (typeof PAYMENT_METHODS)[number] => (PAYMENT_METHODS as readonly string[]).includes(m);

export function TransactionRow({ tx, onClick }: { tx: Transaction; onClick: () => void }) {
  const { data, catName, money, shortDate, t } = useApp();
  const cat = data.categories.find((c) => c.id === tx.categoryId);
  const st = TYPE_STYLE[tx.type];
  const Icon = ICONS[tx.type];
  return (
    <button onClick={onClick} className="flex min-h-16 w-full items-center gap-3 py-2 text-left">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft ${st.text}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{tx.description || catName(cat)}</span>
        <span className="block truncate text-xs text-muted">
          {catName(cat)} • {shortDate(tx.date)}
          {tx.paymentMethod ? ` • ${isMethod(tx.paymentMethod) ? t(`pm_${tx.paymentMethod}` as const) : tx.paymentMethod}` : ""}
          {isPending(tx) ? ` • ${t("reimbPendingTag")}` : isReceived(tx) ? ` • ${t("reimbReceivedTag")}` : ""}
        </span>
      </span>
      <span className={`shrink-0 font-bold ${st.text}`}>
        {st.sign}
        {money(tx.amount)}
      </span>
    </button>
  );
}

export function TransactionDetailSheet({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { data, catName, money, date, t, confirm, toast, lang, digits } = useApp();
  const form = useTxForm();
  const [busy, setBusy] = useState(false);
  const cat = data.categories.find((c) => c.id === tx.categoryId);
  const st = TYPE_STYLE[tx.type];

  const fmtTs = (ms: number) => {
    const d = dhakaDateOf(ms);
    const time = new Intl.DateTimeFormat(lang === "bn" ? `bn-BD-u-nu-${digits === "bn" ? "beng" : "latn"}` : "en-GB", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
    return `${date(d)}, ${time}`;
  };

  async function remove() {
    if (busy) return;
    const ok = await confirm({ message: t("confirmDeleteTx"), confirmText: t("delete") });
    if (!ok) return;
    setBusy(true);
    try {
      await db.transactions.delete(tx.id);
      toast(t("txDeleted"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  const rows: [string, string | undefined][] = [
    [t("type"), t(TYPE_LABEL[tx.type])],
    [t("category"), catName(cat)],
    [t("date"), date(tx.date, true)],
    [t("description"), tx.description],
    [t("paymentMethod"), tx.paymentMethod ? (isMethod(tx.paymentMethod) ? t(`pm_${tx.paymentMethod}` as const) : tx.paymentMethod) : undefined],
    [t("note"), tx.note],
    [t("createdAt"), fmtTs(tx.createdAt)],
    [t("updatedAt"), fmtTs(tx.updatedAt)],
  ];

  return (
    <Sheet title={t("transactionDetails")} onClose={onClose}>
      <p className={`mb-4 text-center text-3xl font-extrabold ${st.text}`}>
        {st.sign}
        {money(tx.amount)}
      </p>
      <dl className="divide-y divide-line">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="max-w-[65%] whitespace-pre-line break-words text-right font-medium">{v}</dd>
            </div>
          ))}
      </dl>
      <div className="mt-5 flex gap-3">
        <button
          className="btn btn-ghost flex-1"
          onClick={() => {
            onClose();
            form.open({ tx });
          }}
        >
          {t("edit")}
        </button>
        <button className="btn btn-danger flex-1" onClick={remove} disabled={busy}>
          {t("delete")}
        </button>
      </div>
    </Sheet>
  );
}
