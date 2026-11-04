"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { isValidIsoDate, periodKeyOf, todayDhaka } from "@/lib/dates";
import { db, newId } from "@/lib/db";
import { formatPlainPaisa, parseAmountToPaisa } from "@/lib/money";
import { PAYMENT_METHODS, TX_TYPES, type Category, type Transaction, type TxType } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Field, Sheet } from "./ui";
import { useBudgetAlerts } from "./useBudgetAlerts";

interface OpenOpts {
  type?: TxType;
  tx?: Transaction;
}
const FormCtx = createContext<{ open: (o?: OpenOpts) => void } | null>(null);

export function useTxForm() {
  const c = useContext(FormCtx);
  if (!c) throw new Error("TxFormProvider missing");
  return c;
}

const TYPE_LABEL = { income: "typeIncome", expense: "typeExpense", saving: "typeSaving", withdraw: "typeWithdraw" } as const;
const TYPE_ACTIVE: Record<TxType, string> = {
  income: "bg-emerald-600 border-emerald-600 text-white",
  expense: "bg-rose-600 border-rose-600 text-white",
  saving: "bg-sky-600 border-sky-600 text-white",
  withdraw: "bg-amber-600 border-amber-600 text-white",
};

export function TxFormProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<(OpenOpts & { n: number }) | null>(null);
  const counter = useRef(0);
  const open = useCallback((o: OpenOpts = {}) => setOpts({ ...o, n: ++counter.current }), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <FormCtx.Provider value={value}>
      {children}
      {opts && <TransactionSheet key={opts.n} initial={opts} onClose={() => setOpts(null)} />}
    </FormCtx.Provider>
  );
}

function TransactionSheet({ initial, onClose }: { initial: OpenOpts; onClose: () => void }) {
  const { t, data, catName, settings, toast } = useApp();
  const checkBudgets = useBudgetAlerts();
  const editing = initial.tx;
  const [type, setType] = useState<TxType>(editing?.type ?? initial.type ?? "expense");
  const [amountText, setAmountText] = useState(editing ? formatPlainPaisa(editing.amount, "en").replace(/,/g, "").replace(/\.00$/, "") : "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [date, setDate] = useState(editing?.date ?? todayDhaka());
  const [description, setDescription] = useState(editing?.description ?? "");
  const [paymentMethod, setPaymentMethod] = useState(editing?.paymentMethod ?? "");
  const [accountId, setAccountId] = useState(() => {
    if (editing) return editing.accountId ?? "";
    // নতুন লেনদেনে সর্বশেষ ব্যবহৃত অ্যাকাউন্টটি আগে থেকে বসানো থাকে
    let last: Transaction | undefined;
    for (const x of data.transactions) if (x.accountId && (!last || x.createdAt > last.createdAt)) last = x;
    const id = last?.accountId;
    return id && data.accounts.some((a) => a.id === id) ? id : "";
  });
  const [note, setNote] = useState(editing?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState<string | null>(null);

  const cats = useMemo(() => data.categories.filter((c) => c.type === type), [data.categories, type]);
  const effectiveCat = cats.some((c) => c.id === categoryId) ? categoryId : (cats[0]?.id ?? "");

  async function submit() {
    if (busy) return;
    const err: Record<string, string> = {};
    const amount = amountText.trim() ? parseAmountToPaisa(amountText) : null;
    if (!amountText.trim()) err.amount = t("errAmountRequired");
    else if (amount === null) err.amount = t("errAmountInvalid");
    if (!isValidIsoDate(date) || date < "2000-01-01" || date > "2100-12-31") err.date = t("errDateInvalid");
    let catId = effectiveCat;
    let createdCat: Category | null = null;
    if (newCat !== null) {
      const name = newCat.trim();
      if (!name) err.category = t("errNameRequired");
      else if (name.length > 40) err.category = t("errTooLong");
      else if (cats.some((c) => c.name.toLowerCase() === name.toLowerCase() || c.nameEn?.toLowerCase() === name.toLowerCase())) err.category = t("errDuplicate");
      else {
        createdCat = { id: newId(), type, name, builtin: false, createdAt: Date.now() };
        catId = createdCat.id;
      }
    } else if (!catId) err.category = t("errCategoryRequired");
    if (description.length > 200 || note.length > 1000) err.description = t("errTooLong");
    setErrors(err);
    if (Object.keys(err).length || amount === null) return;

    setBusy(true);
    try {
      const now = Date.now();
      const account = data.accounts.find((a) => a.id === accountId);
      const tx: Transaction = {
        id: editing?.id ?? newId(),
        type,
        amount,
        categoryId: catId,
        date,
        description: description.trim() || undefined,
        paymentMethod: paymentMethod || account?.kind || undefined,
        accountId: account?.id,
        note: note.trim() || undefined,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.transaction("rw", db.transactions, db.categories, async () => {
        if (createdCat) await db.categories.add(createdCat);
        await db.transactions.put(tx);
      });
      toast(editing ? t("txUpdated") : t("txSaved"));
      if (type === "expense") {
        const before = data.transactions;
        const after = [...before.filter((x) => x.id !== tx.id), tx];
        checkBudgets(before, after, [periodKeyOf(tx.date, settings.monthStartDay)]);
      }
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={editing ? t("editTransaction") : t("addTransaction")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("type")}>
          {TX_TYPES.map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={type === x}
              onClick={() => {
                setType(x);
                setNewCat(null);
              }}
              className={`min-h-12 rounded-xl border px-1 text-sm font-semibold leading-tight ${type === x ? TYPE_ACTIVE[x] : "border-line bg-card"}`}
            >
              {t(TYPE_LABEL[x])}
            </button>
          ))}
        </div>

        <Field label={t("amount") + " (৳)"} error={errors.amount}>
          <input className="input text-2xl font-bold" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value)} autoFocus />
        </Field>

        <Field label={t("category")} error={errors.category}>
          {newCat === null ? (
            <div className="flex gap-2">
              <select className="input" value={effectiveCat} onChange={(e) => setCategoryId(e.target.value)}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {catName(c)}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost shrink-0 px-3" onClick={() => setNewCat("")} aria-label={t("newCategory")} title={t("newCategory")}>
                <Plus className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input className="input" placeholder={t("newCategoryName")} value={newCat} maxLength={40} onChange={(e) => setNewCat(e.target.value)} autoFocus />
              <button type="button" className="btn btn-ghost shrink-0 px-3" onClick={() => setNewCat(null)}>
                {t("cancel")}
              </button>
            </div>
          )}
        </Field>

        <Field label={t("date")} error={errors.date}>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label={t("description")} optional error={errors.description}>
          <input className="input" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
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

        <Field label={t("paymentMethod")} optional>
          <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="">—</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`pm_${m}` as const)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("note")} optional>
          <textarea className="input min-h-20" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
