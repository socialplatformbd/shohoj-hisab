"use client";

import { ArrowLeftRight, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EmptyState, Field, PageHeader, Sheet } from "@/components/ui";
import { accountSummary } from "@/lib/accounts";
import { isValidIsoDate, todayDhaka } from "@/lib/dates";
import { db, newId } from "@/lib/db";
import { formatPlainPaisa, parseAmountToPaisa, toAsciiDigits } from "@/lib/money";
import { PAYMENT_METHODS, type Account } from "@/lib/types";

type SheetState = { kind: "account"; account?: Account } | { kind: "transfer" } | null;

/** শুরুর ব্যালেন্স: খালি বা ০ হলে ০; অবৈধ হলে null */
function parseOpening(text: string): number | null {
  const s = toAsciiDigits(text).replace(/[৳,\s]/g, "");
  if (s === "") return 0;
  if (/^0+(\.0{1,2})?$/.test(s)) return 0;
  return parseAmountToPaisa(s);
}

export default function AccountsPage() {
  const { t, data, money, date, toast, confirm, dataReady } = useApp();
  const [sheet, setSheet] = useState<SheetState>(null);
  const summary = useMemo(() => accountSummary(data.accounts, data.transactions, data.transfers), [data.accounts, data.transactions, data.transfers]);
  const accById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const recent = useMemo(() => [...data.transfers].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)).slice(0, 10), [data.transfers]);

  if (!dataReady) return null;

  async function removeAccount(a: Account) {
    const used =
      data.transactions.some((x) => x.accountId === a.id) ||
      data.transfers.some((x) => x.fromAccountId === a.id || x.toAccountId === a.id) ||
      (await db.recurring.filter((r) => r.accountId === a.id).count()) > 0;
    if (used) {
      toast(t("accountInUse"), "error");
      return;
    }
    if (!(await confirm({ message: t("accountDeleteConfirm"), danger: true, confirmText: t("delete") }))) return;
    try {
      await db.accounts.delete(a.id);
      toast(t("accountDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  async function removeTransfer(id: string) {
    if (!(await confirm({ message: t("transferDeleteConfirm"), danger: true, confirmText: t("delete") }))) return;
    try {
      await db.transfers.delete(id);
      toast(t("transferDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("navAccounts")}
        right={
          <button className="btn btn-primary" onClick={() => setSheet({ kind: "account" })}>
            <Plus className="h-5 w-5" />
            {t("add")}
          </button>
        }
      />
      <p className="mb-4 text-sm text-muted">{t("accountsHint")}</p>

      {data.accounts.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Wallet className="h-8 w-8" />}
            title={t("accountsEmptyTitle")}
            hint={t("accountsEmptyHint")}
            action={
              <button className="btn btn-primary" onClick={() => setSheet({ kind: "account" })}>
                <Plus className="h-5 w-5" />
                {t("accountAdd")}
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="card mb-4">
            <p className="text-sm text-muted">{t("accountTotal")}</p>
            <p className={`text-2xl font-bold ${summary.total < 0 ? "text-rose-600" : ""}`}>{money(summary.total)}</p>
            {summary.unassigned !== 0 && (
              <p className="mt-1 text-xs text-muted">
                {t("accountUnassigned")}: {money(summary.unassigned)}
              </p>
            )}
          </div>

          <ul className="space-y-3">
            {summary.rows.map(({ account: a, balance }) => (
              <li key={a.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{a.name}</p>
                    <p className="text-sm text-muted">{t(`pm_${a.kind}` as "pm_cash")}</p>
                  </div>
                  <p className={`shrink-0 text-lg font-bold ${balance < 0 ? "text-rose-600" : ""}`}>{money(balance)}</p>
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setSheet({ kind: "account", account: a })} aria-label={t("edit")}>
                    <Pencil className="h-5 w-5" />
                  </button>
                  <button className="flex h-11 w-11 items-center justify-center rounded-full text-rose-600 hover:bg-soft" onClick={() => void removeAccount(a)} aria-label={t("delete")}>
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <button
            className="btn btn-ghost mt-4 w-full"
            onClick={() => (data.accounts.length >= 2 ? setSheet({ kind: "transfer" }) : toast(t("transferNeedTwo"), "error"))}
          >
            <ArrowLeftRight className="h-5 w-5" />
            {t("transferAdd")}
          </button>

          {recent.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-lg font-bold">{t("recentTransfers")}</h2>
              <ul className="space-y-2">
                {recent.map((x) => (
                  <li key={x.id} className="card flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {accById.get(x.fromAccountId)?.name ?? "—"} → {accById.get(x.toAccountId)?.name ?? "—"}
                      </p>
                      <p className="text-xs text-muted">
                        {date(x.date)}
                        {x.note ? ` • ${x.note}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-bold">{money(x.amount)}</p>
                    <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-rose-600 hover:bg-soft" onClick={() => void removeTransfer(x.id)} aria-label={t("delete")}>
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {sheet?.kind === "account" && <AccountSheet account={sheet.account} onClose={() => setSheet(null)} />}
      {sheet?.kind === "transfer" && <TransferSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

function AccountSheet({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { t, data, toast } = useApp();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState(account?.kind ?? "cash");
  const [openingText, setOpeningText] = useState(account && account.openingBalance > 0 ? formatPlainPaisa(account.openingBalance, "en").replace(/,/g, "").replace(/\.00$/, "") : "");
  const [errors, setErrors] = useState<{ name?: string; opening?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const err: typeof errors = {};
    const n = name.trim();
    const opening = parseOpening(openingText);
    if (!n) err.name = t("errNameRequired");
    else if (n.length > 40) err.name = t("errTooLong");
    else if (data.accounts.some((a) => a.id !== account?.id && a.name.toLowerCase() === n.toLowerCase())) err.name = t("errDuplicate");
    if (opening === null) err.opening = t("errAmountInvalid");
    setErrors(err);
    if (Object.keys(err).length || opening === null) return;
    setBusy(true);
    try {
      const now = Date.now();
      if (account) await db.accounts.put({ ...account, name: n, kind, openingBalance: opening, updatedAt: now });
      else await db.accounts.add({ id: newId(), name: n, kind, openingBalance: opening, createdAt: now, updatedAt: now });
      toast(t("accountSaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={account ? t("accountEdit") : t("accountAdd")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("accountName")} error={errors.name}>
          <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("accountKind")}>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`pm_${m}` as const)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("accountOpening")} error={errors.opening}>
          <input className="input text-xl font-bold" inputMode="decimal" placeholder="0.00" value={openingText} onChange={(e) => setOpeningText(e.target.value)} />
        </Field>
        <p className="-mt-2 text-xs text-muted">{t("accountOpeningHint")}</p>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}

function TransferSheet({ onClose }: { onClose: () => void }) {
  const { t, data, toast } = useApp();
  const [from, setFrom] = useState(data.accounts[0]?.id ?? "");
  const [to, setTo] = useState(data.accounts[1]?.id ?? "");
  const [amountText, setAmountText] = useState("");
  const [dateText, setDateText] = useState(todayDhaka());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ to?: string; amount?: string; date?: string; note?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const err: typeof errors = {};
    const amount = amountText.trim() ? parseAmountToPaisa(amountText) : null;
    if (!from || !to || from === to) err.to = t("errSameAccount");
    if (!amountText.trim()) err.amount = t("errAmountRequired");
    else if (amount === null) err.amount = t("errAmountInvalid");
    if (!isValidIsoDate(dateText) || dateText < "2000-01-01" || dateText > "2100-12-31") err.date = t("errDateInvalid");
    if (note.length > 200) err.note = t("errTooLong");
    setErrors(err);
    if (Object.keys(err).length || amount === null) return;
    setBusy(true);
    try {
      await db.transfers.add({ id: newId(), fromAccountId: from, toAccountId: to, amount, date: dateText, note: note.trim() || undefined, createdAt: Date.now() });
      toast(t("transferSaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("transferAdd")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("transferFrom")}>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("transferTo")} error={errors.to}>
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("amount") + " (৳)"} error={errors.amount}>
          <input className="input text-xl font-bold" inputMode="decimal" placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </Field>
        <Field label={t("date")} error={errors.date}>
          <input className="input" type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} />
        </Field>
        <Field label={t("note")} optional error={errors.note}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
