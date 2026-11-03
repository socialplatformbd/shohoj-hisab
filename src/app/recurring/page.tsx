"use client";

import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EmptyState, Field, PageHeader, Sheet, TYPE_STYLE } from "@/components/ui";
import { todayDhaka } from "@/lib/dates";
import { FALLBACK_CATEGORY, db, newId } from "@/lib/db";
import { formatPlainPaisa, parseAmountToPaisa, toAsciiDigits } from "@/lib/money";
import { defaultStartMonth, generateRecurring } from "@/lib/recurring";
import { PAYMENT_METHODS, type Recurring, type TxType } from "@/lib/types";

const TYPES: TxType[] = ["income", "expense", "saving"];
const TYPE_LABEL = { income: "typeIncome", expense: "typeExpense", saving: "typeSaving", withdraw: "typeWithdraw" } as const;

export default function RecurringPage() {
  const { t, data, catName, money, num, toast, confirm, dataReady } = useApp();
  const rules = useLiveQuery(() => db.recurring.toArray(), []);
  const [editing, setEditing] = useState<{ rule?: Recurring } | null>(null);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  if (!dataReady || rules === undefined) return null;
  const sorted = [...rules].sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.createdAt - b.createdAt);

  async function toggle(r: Recurring) {
    try {
      const now = Date.now();
      if (r.active) {
        await db.recurring.put({ ...r, active: false, updatedAt: now });
      } else {
        // বিরতির সময়ের পুরনো মাসগুলো যেন একসাথে যোগ না হয়
        await db.recurring.put({ ...r, active: true, startMonth: defaultStartMonth(r.dayOfMonth, todayDhaka()), lastMonth: undefined, updatedAt: now });
        await generateRecurring(todayDhaka());
      }
    } catch {
      toast(t("dbError"), "error");
    }
  }

  async function remove(r: Recurring) {
    if (!(await confirm({ message: t("recurringDeleteConfirm"), danger: true, confirmText: t("delete") }))) return;
    try {
      await db.recurring.delete(r.id);
      toast(t("recurringDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("navRecurring")}
        right={
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus className="h-5 w-5" />
            {t("add")}
          </button>
        }
      />
      <p className="mb-4 text-sm text-muted">{t("recurringHint")}</p>

      {sorted.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Repeat className="h-8 w-8" />}
            title={t("recurringEmptyTitle")}
            hint={t("recurringEmptyHint")}
            action={
              <button className="btn btn-primary" onClick={() => setEditing({})}>
                <Plus className="h-5 w-5" />
                {t("recurringAdd")}
              </button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((r) => {
            const cat = catById.get(r.categoryId);
            return (
              <li key={r.id} className={`card ${r.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{r.description || catName(cat)}</p>
                    <p className="text-sm text-muted">
                      {t("recurringEveryMonth", { d: num(r.dayOfMonth) })} • {catName(cat)}
                      {!r.active && ` • ${t("recurringPaused")}`}
                    </p>
                  </div>
                  <p className={`shrink-0 text-lg font-bold ${TYPE_STYLE[r.type].text}`}>{money(r.amount)}</p>
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => void toggle(r)} aria-label={r.active ? t("recurringPause") : t("recurringResume")}>
                    {r.active ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </button>
                  <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setEditing({ rule: r })} aria-label={t("edit")}>
                    <Pencil className="h-5 w-5" />
                  </button>
                  <button className="flex h-11 w-11 items-center justify-center rounded-full text-rose-600 hover:bg-soft" onClick={() => void remove(r)} aria-label={t("delete")}>
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <RecurringSheet rule={editing.rule} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RecurringSheet({ rule, onClose }: { rule?: Recurring; onClose: () => void }) {
  const { t, data, catName, monthLabel, toast } = useApp();
  const [type, setType] = useState<TxType>(rule?.type ?? "expense");
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? FALLBACK_CATEGORY.expense);
  const [amountText, setAmountText] = useState(rule ? formatPlainPaisa(rule.amount, "en").replace(/,/g, "").replace(/\.00$/, "") : "");
  const [dayText, setDayText] = useState(rule ? String(rule.dayOfMonth) : "1");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [method, setMethod] = useState(rule?.paymentMethod ?? "");
  const [errors, setErrors] = useState<{ amount?: string; day?: string; description?: string }>({});
  const [busy, setBusy] = useState(false);

  const cats = data.categories.filter((c) => c.type === type);
  const dayNum = Number(toAsciiDigits(dayText.trim()));
  const dayOk = dayText.trim() !== "" && Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31;
  const startMonth = rule?.startMonth ?? defaultStartMonth(dayOk ? dayNum : 1, todayDhaka());

  async function submit() {
    if (busy) return;
    const err: typeof errors = {};
    const amount = amountText.trim() ? parseAmountToPaisa(amountText) : null;
    if (!amountText.trim()) err.amount = t("errAmountRequired");
    else if (amount === null) err.amount = t("errAmountInvalid");
    if (!dayOk) err.day = t("errDayInvalid");
    if (description.length > 200) err.description = t("errTooLong");
    setErrors(err);
    if (Object.keys(err).length || amount === null) return;
    setBusy(true);
    try {
      const now = Date.now();
      const base = {
        type,
        amount,
        categoryId: cats.some((c) => c.id === categoryId) ? categoryId : FALLBACK_CATEGORY[type],
        description: description.trim() || undefined,
        paymentMethod: method || undefined,
        dayOfMonth: dayNum,
      };
      if (rule) {
        await db.recurring.put({ ...rule, ...base, updatedAt: now });
      } else {
        await db.recurring.add({ id: newId(), ...base, startMonth, active: true, createdAt: now, updatedAt: now });
      }
      await generateRecurring(todayDhaka());
      toast(t("recurringSaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={rule ? t("recurringEdit") : t("recurringAdd")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("type")}>
          <select
            className="input"
            value={type}
            onChange={(e) => {
              const v = e.target.value as TxType;
              setType(v);
              setCategoryId(FALLBACK_CATEGORY[v]);
            }}
          >
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t(TYPE_LABEL[x])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("category")}>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {catName(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("amount") + " (৳)"} error={errors.amount}>
          <input className="input text-xl font-bold" inputMode="decimal" placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </Field>
        <Field label={t("recurringDay")} error={errors.day}>
          <input className="input" inputMode="numeric" value={dayText} onChange={(e) => setDayText(e.target.value)} />
        </Field>
        <p className="-mt-2 text-xs text-muted">{t("recurringDayHint", { m: monthLabel(startMonth) })}</p>
        <Field label={t("description")} optional error={errors.description}>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t("paymentMethod")} optional>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">—</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`pm_${m}` as const)}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
