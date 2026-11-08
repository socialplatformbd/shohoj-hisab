"use client";

import { Pencil, Plus, Send, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { SHOP_KIND_LABEL, ShopEntrySheet } from "@/components/ShopEntrySheet";
import { EmptyState, Field, PageHeader, Sheet } from "@/components/ui";
import { db, newId } from "@/lib/db";
import { creditOf, partyBalances } from "@/lib/shop";
import type { ShopEntryKind, ShopParty, ShopPartyKind } from "@/lib/types";

export default function ShopPartiesPage() {
  const { t, data, money, date, toast, confirm, dataReady } = useApp();
  const [tab, setTab] = useState<ShopPartyKind>("customer");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<{ party?: ShopParty } | null>(null);
  const [entrySheet, setEntrySheet] = useState<{ kind: ShopEntryKind; partyId: string } | null>(null);

  const balances = useMemo(() => partyBalances(data.shopParties, data.shopEntries), [data.shopParties, data.shopEntries]);
  const rows = useMemo(() => balances.filter((b) => b.party.kind === tab).sort((a, b) => b.balance - a.balance || a.party.name.localeCompare(b.party.name)), [balances, tab]);

  if (!dataReady) return null;

  const labelFor = (kind: ShopPartyKind, balance: number) => (balance === 0 ? t("shopClear") : balance < 0 ? t("shopAdvance") : kind === "customer" ? t("shopYouGet") : t("shopYouOwe"));
  const detail = detailId ? balances.find((b) => b.party.id === detailId) : undefined;

  async function removeParty(p: ShopParty) {
    if (data.shopEntries.some((e) => e.partyId === p.id)) {
      toast(t("shopPartyInUse"), "error");
      return;
    }
    if (!(await confirm({ message: t("shopPartyDeleteConfirm"), danger: true, confirmText: t("delete") }))) return;
    try {
      await db.shopParties.delete(p.id);
      setDetailId(null);
      toast(t("shopPartyDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  async function remind(p: ShopParty, balance: number) {
    const text = t("shopRemindText", { name: p.name, amount: money(balance) });
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast(t("shopCopied"));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast(t("dbError"), "error");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("shopParties")}
        right={
          <button className="btn btn-primary" onClick={() => setForm({})}>
            <Plus className="h-5 w-5" />
            {t("add")}
          </button>
        }
      />

      <div className="mb-4 flex gap-2">
        {(["customer", "supplier"] as ShopPartyKind[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={`min-h-11 flex-1 rounded-full px-4 text-sm font-semibold ${tab === k ? "bg-emerald-700 text-white" : "bg-soft"}`}>
            {k === "customer" ? t("shopTabCustomers") : t("shopTabSuppliers")}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={tab === "customer" ? t("shopNoCustomers") : t("shopNoSuppliers")}
            hint={t("shopPartyEmptyHint")}
            action={
              <button className="btn btn-primary" onClick={() => setForm({})}>
                <Plus className="h-5 w-5" />
                {t("shopPartyAdd")}
              </button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ party, balance }) => (
            <li key={party.id}>
              <button className="card flex w-full items-center justify-between gap-3 text-left" onClick={() => setDetailId(party.id)}>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{party.name}</p>
                  {party.phone && <p className="text-xs text-muted">{party.phone}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-lg font-bold ${balance > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>{money(Math.abs(balance))}</p>
                  <p className="text-xs text-muted">{labelFor(party.kind, balance)}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <Sheet title={detail.party.name} onClose={() => setDetailId(null)}>
          <div className="space-y-4">
            <div className="card">
              <p className="text-sm text-muted">{labelFor(detail.party.kind, detail.balance)}</p>
              <p className="text-2xl font-bold">{money(Math.abs(detail.balance))}</p>
              {detail.party.phone && <p className="mt-1 text-sm text-muted">{detail.party.phone}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn btn-primary"
                onClick={() => {
                  const p = detail.party;
                  setDetailId(null);
                  setEntrySheet({ kind: p.kind === "customer" ? "receive" : "pay", partyId: p.id });
                }}
              >
                {detail.party.kind === "customer" ? t("shopCollect") : t("shopPayNow")}
              </button>
              {detail.party.kind === "customer" && detail.balance > 0 ? (
                <button className="btn btn-ghost" onClick={() => void remind(detail.party, detail.balance)}>
                  <Send className="h-5 w-5" />
                  {t("shopRemind")}
                </button>
              ) : (
                <span />
              )}
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const p = detail.party;
                  setDetailId(null);
                  setForm({ party: p });
                }}
              >
                <Pencil className="h-5 w-5" />
                {t("edit")}
              </button>
              <button className="btn btn-ghost text-rose-600" onClick={() => void removeParty(detail.party)}>
                <Trash2 className="h-5 w-5" />
                {t("delete")}
              </button>
            </div>

            <section>
              <h3 className="mb-2 font-bold">{t("shopHistory")}</h3>
              <ul className="space-y-2">
                {data.shopEntries
                  .filter((e) => e.partyId === detail.party.id)
                  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
                  .slice(0, 30)
                  .map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {date(e.date)} • {t(SHOP_KIND_LABEL[e.kind])}
                        {creditOf(e) > 0 ? ` (${t("shopDueLeft", { a: money(creditOf(e)) })})` : ""}
                      </span>
                      <span className="shrink-0 font-semibold">{money(e.amount)}</span>
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        </Sheet>
      )}

      {form && <PartyFormSheet party={form.party} kind={form.party?.kind ?? tab} onClose={() => setForm(null)} />}
      {entrySheet && <ShopEntrySheet defaultKind={entrySheet.kind} presetPartyId={entrySheet.partyId} onClose={() => setEntrySheet(null)} />}
    </div>
  );
}

function PartyFormSheet({ party, kind, onClose }: { party?: ShopParty; kind: ShopPartyKind; onClose: () => void }) {
  const { t, data, toast } = useApp();
  const [name, setName] = useState(party?.name ?? "");
  const [phone, setPhone] = useState(party?.phone ?? "");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const err: typeof errors = {};
    const n = name.trim();
    const p = phone.trim();
    if (!n) err.name = t("errNameRequired");
    else if (n.length > 60) err.name = t("errTooLong");
    else if (data.shopParties.some((x) => x.id !== party?.id && x.kind === kind && x.name.toLowerCase() === n.toLowerCase())) err.name = t("errDuplicate");
    if (p.length > 20) err.phone = t("errTooLong");
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      const now = Date.now();
      if (party) await db.shopParties.put({ ...party, name: n, phone: p || undefined, updatedAt: now });
      else await db.shopParties.add({ id: newId(), name: n, kind, phone: p || undefined, createdAt: now, updatedAt: now });
      toast(t("shopPartySaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={party ? t("shopPartyEdit") : t("shopPartyAdd")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("shopPartyName")} error={errors.name}>
          <input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t("shopPartyPhone")} optional error={errors.phone}>
          <input className="input" type="tel" inputMode="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
