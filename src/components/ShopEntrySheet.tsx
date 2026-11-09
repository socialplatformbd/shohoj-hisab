"use client";

import { useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { LabelChips, savedLabels } from "./LabelChips";
import { UNIT_KEY } from "./ProductSheets";
import { Field, Sheet } from "./ui";
import { isValidIsoDate, todayDhaka } from "@/lib/dates";
import { db, newId } from "@/lib/db";
import { formatPlainPaisa, parseAmountOrZero, parseAmountToPaisa } from "@/lib/money";
import { formatQty, lineTotal, parseQty, stockSummary } from "@/lib/products";
import { PARTY_KIND_OF, creditOf, paidOf } from "@/lib/shop";
import { PRODUCT_UNITS, SHOP_ENTRY_KINDS, type ProductUnit, type ShopEntry, type ShopEntryKind, type ShopParty } from "@/lib/types";

export const SHOP_KIND_LABEL = {
  sale: "shopKindSale",
  purchase: "shopKindPurchase",
  expense: "shopKindExpense",
  receive: "shopKindReceive",
  pay: "shopKindPay",
} as const;

const NEW_PARTY = "__new";
const plain = (paisa: number) => formatPlainPaisa(paisa, "en").replace(/,/g, "").replace(/\.00$/, "");

export function ShopEntrySheet({ entry, defaultKind, presetPartyId, presetProductId, onClose }: { entry?: ShopEntry; defaultKind: ShopEntryKind; presetPartyId?: string; presetProductId?: string; onClose: () => void }) {
  const { t, data, num, toast } = useApp();
  const [kind, setKind] = useState<ShopEntryKind>(entry?.kind ?? defaultKind);
  const [amountText, setAmountText] = useState(entry ? plain(entry.amount) : "");
  const [amountTouched, setAmountTouched] = useState(!!entry); // নিজে অঙ্ক লিখলে আর নিজে নিজে হিসাব বসবে না
  const [productId, setProductId] = useState(entry?.productId ?? presetProductId ?? "");
  const [qtyText, setQtyText] = useState(entry?.qty ? formatQty(entry.qty) : "");
  const [credit, setCredit] = useState(entry ? creditOf(entry) > 0 : false);
  const [paidText, setPaidText] = useState(entry && creditOf(entry) > 0 ? plain(paidOf(entry)) : "");
  const [partyId, setPartyId] = useState(entry?.partyId ?? presetPartyId ?? "");
  const [newName, setNewName] = useState("");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [dateText, setDateText] = useState(entry?.date ?? todayDhaka());
  const [errors, setErrors] = useState<{ amount?: string; paid?: string; party?: string; date?: string; text?: string; qty?: string }>({});
  const [busy, setBusy] = useState(false);

  const partyKind = kind === "expense" ? null : PARTY_KIND_OF[kind];
  const mustHaveParty = kind === "receive" || kind === "pay";
  const showParty = partyKind !== null && (mustHaveParty || ((kind === "sale" || kind === "purchase") && credit));
  const parties = partyKind ? data.shopParties.filter((p) => p.kind === partyKind) : [];

  const presets = [t("labelShopRent"), t("labelSalary"), t("labelElectricity"), t("labelTransport"), t("labelSnacks")];
  const saved = savedLabels(
    data.shopEntries.filter((e) => e.kind === "expense").map((e) => ({ label: e.category, at: e.createdAt })),
    presets,
  );

  const withProduct = (kind === "sale" || kind === "purchase") && data.shopProducts.length > 0;
  const stockOf = useMemo(() => new Map(stockSummary(data.shopProducts, data.shopEntries, data.shopAdjustments).rows.map((r) => [r.product.id, r.stock])), [data.shopProducts, data.shopEntries, data.shopAdjustments]);
  const product = data.shopProducts.find((p) => p.id === productId);
  const unitLabel = (u: string) => ((PRODUCT_UNITS as readonly string[]).includes(u) ? t(UNIT_KEY[u as ProductUnit]) : u);

  /** পণ্য ও পরিমাণ থেকে মোট অঙ্ক নিজে বসায় (নিজে অঙ্ক লিখে থাকলে নয়) */
  function autoAmount(k: ShopEntryKind, pid: string, qText: string) {
    if (amountTouched || (k !== "sale" && k !== "purchase")) return;
    const p = data.shopProducts.find((x) => x.id === pid);
    const q = parseQty(qText);
    const price = p ? (k === "sale" ? p.sellPrice : p.buyPrice) : 0;
    if (!p || q === null || price <= 0) return;
    const total = lineTotal(q, price);
    if (total !== null && total > 0) setAmountText(plain(total));
  }

  function changeKind(k: ShopEntryKind) {
    setKind(k);
    if (k === "expense" || PARTY_KIND_OF[k] !== partyKind) setPartyId("");
    setNewName("");
    if (k !== "sale" && k !== "purchase") {
      setProductId("");
      setQtyText("");
    } else autoAmount(k, productId, qtyText);
  }

  async function submit() {
    if (busy) return;
    const err: typeof errors = {};
    const amount = amountText.trim() ? parseAmountToPaisa(amountText) : null;
    if (!amountText.trim()) err.amount = t("errAmountRequired");
    else if (amount === null) err.amount = t("errAmountInvalid");
    const usingProduct = withProduct && productId !== "" && data.shopProducts.some((p) => p.id === productId);
    const qty = usingProduct ? parseQty(qtyText) : null;
    if (usingProduct && qty === null) err.qty = t("errQtyInvalid");
    const paid = credit && (kind === "sale" || kind === "purchase") ? parseAmountOrZero(paidText) : null;
    if (credit && (kind === "sale" || kind === "purchase")) {
      if (paid === null) err.paid = t("errAmountInvalid");
      else if (amount !== null && paid > amount) err.paid = t("errPaidTooMuch");
    }
    const creating = showParty && partyId === NEW_PARTY;
    const newTrim = newName.trim();
    if (showParty) {
      if (creating ? !newTrim : !data.shopParties.some((p) => p.id === partyId && p.kind === partyKind)) err.party = t("errPartyRequired");
      else if (creating && newTrim.length > 60) err.party = t("errTooLong");
    }
    if (!isValidIsoDate(dateText) || dateText < "2000-01-01" || dateText > "2100-12-31") err.date = t("errDateInvalid");
    if (category.length > 60 || note.length > 200) err.text = t("errTooLong");
    setErrors(err);
    if (Object.keys(err).length || amount === null) return;

    setBusy(true);
    try {
      const now = Date.now();
      let usePartyId: string | undefined;
      let newParty: ShopParty | undefined;
      if (showParty) {
        if (creating && partyKind) {
          // একই নামের পক্ষ আগে থাকলে সেটিই ব্যবহার হয়
          const same = data.shopParties.find((p) => p.kind === partyKind && p.name.toLowerCase() === newTrim.toLowerCase());
          if (same) usePartyId = same.id;
          else {
            newParty = { id: newId(), name: newTrim, kind: partyKind, createdAt: now, updatedAt: now };
            usePartyId = newParty.id;
          }
        } else usePartyId = partyId;
      }
      const row: ShopEntry = {
        id: entry?.id ?? newId(),
        kind,
        amount,
        paidAmount: credit && (kind === "sale" || kind === "purchase") ? (paid ?? 0) : undefined,
        partyId: usePartyId,
        productId: usingProduct ? productId : undefined,
        qty: usingProduct && qty !== null ? qty : undefined,
        category: kind === "expense" ? category.trim() || undefined : undefined,
        note: note.trim() || undefined,
        date: dateText,
        createdAt: entry?.createdAt ?? now,
      };
      await db.transaction("rw", [db.shopParties, db.shopEntries], async () => {
        if (newParty) await db.shopParties.add(newParty);
        await db.shopEntries.put(row);
      });
      toast(t("shopEntrySaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={entry ? t("shopEntryEdit") : t("shopEntryAdd")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("shopEntryKind")}>
          <select className="input" value={kind} onChange={(e) => changeKind(e.target.value as ShopEntryKind)}>
            {SHOP_ENTRY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(SHOP_KIND_LABEL[k])}
              </option>
            ))}
          </select>
        </Field>
        {withProduct && (
          <>
            <Field label={t("prodPick")}>
              <select
                className="input"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  autoAmount(kind, e.target.value, qtyText);
                }}
              >
                <option value="">{t("prodNone")}</option>
                {data.shopProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            {product && (
              <>
                <Field label={`${t("prodQty")} (${unitLabel(product.unit)})`} error={errors.qty}>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="0"
                    value={qtyText}
                    onChange={(e) => {
                      setQtyText(e.target.value);
                      autoAmount(kind, productId, e.target.value);
                    }}
                  />
                </Field>
                {(() => {
                  // এই এন্ট্রি সম্পাদনার সময় এর নিজের প্রভাব বাদ দিয়ে "আগের" স্টক ধরা হয়
                  const own = entry && entry.productId === product.id && entry.qty ? (entry.kind === "sale" ? entry.qty : entry.kind === "purchase" ? -entry.qty : 0) : 0;
                  const avail = (stockOf.get(product.id) ?? 0) + own;
                  const q = parseQty(qtyText);
                  const short = kind === "sale" && q !== null && q > avail;
                  return (
                    <p className={`-mt-2 text-xs ${short ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted"}`}>
                      {t(short ? "prodStockShort" : "prodStockLeft", { q: num(formatQty(avail)), u: unitLabel(product.unit) })}
                    </p>
                  );
                })()}
              </>
            )}
          </>
        )}
        <Field label={t("shopAmountTotal")} error={errors.amount}>
          <input
            className="input text-xl font-bold"
            inputMode="decimal"
            placeholder="0.00"
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value);
              setAmountTouched(true);
            }}
          />
        </Field>

        {(kind === "sale" || kind === "purchase") && (
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="h-5 w-5" checked={credit} onChange={(e) => setCredit(e.target.checked)} />
            <span className="font-medium">{t("shopCredit")}</span>
          </label>
        )}
        {credit && (kind === "sale" || kind === "purchase") && (
          <Field label={kind === "sale" ? t("shopPaidNowSale") : t("shopPaidNowPurchase")} optional error={errors.paid}>
            <input className="input" inputMode="decimal" placeholder="0" value={paidText} onChange={(e) => setPaidText(e.target.value)} />
          </Field>
        )}

        {showParty && (
          <>
            <Field label={partyKind === "customer" ? t("shopPartyCustomer") : t("shopPartySupplier")} error={errors.party}>
              <select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">{t("shopPartyPick")}</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value={NEW_PARTY}>{t("shopPartyNew")}</option>
              </select>
            </Field>
            {partyId === NEW_PARTY && (
              <Field label={t("shopPartyNewName")}>
                <input className="input" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              </Field>
            )}
          </>
        )}

        {kind === "expense" && (
          <>
            <Field label={t("shopExpenseCategory")} optional error={errors.text}>
              <input className="input" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} />
            </Field>
            <div className="-mt-2">
              <LabelChips presets={presets} saved={saved} onPick={setCategory} />
            </div>
          </>
        )}

        <Field label={t("date")} error={errors.date}>
          <input className="input" type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} />
        </Field>
        <Field label={t("shopNote")} optional error={kind === "expense" ? undefined : errors.text}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
