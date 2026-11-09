"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { Field, Sheet } from "./ui";
import { isValidIsoDate, todayDhaka } from "@/lib/dates";
import { db, newId } from "@/lib/db";
import { formatPlainPaisa, parseAmountOrZero } from "@/lib/money";
import { formatQty, parseQty, parseQtyOrZero } from "@/lib/products";
import { PRODUCT_UNITS, type ProductUnit, type ShopProduct } from "@/lib/types";

export const UNIT_KEY = {
  pcs: "unit_pcs",
  kg: "unit_kg",
  litre: "unit_litre",
  dozen: "unit_dozen",
  packet: "unit_packet",
  box: "unit_box",
  bag: "unit_bag",
  meter: "unit_meter",
} as const satisfies Record<ProductUnit, string>;

const plainPaisa = (paisa: number) => (paisa > 0 ? formatPlainPaisa(paisa, "en").replace(/,/g, "").replace(/\.00$/, "") : "");

export function ProductFormSheet({ product, onClose }: { product?: ShopProduct; onClose: () => void }) {
  const { t, data, toast } = useApp();
  const [name, setName] = useState(product?.name ?? "");
  const [unit, setUnit] = useState<ProductUnit>((PRODUCT_UNITS as readonly string[]).includes(product?.unit ?? "") ? (product?.unit as ProductUnit) : "pcs");
  const [buyText, setBuyText] = useState(plainPaisa(product?.buyPrice ?? 0));
  const [sellText, setSellText] = useState(plainPaisa(product?.sellPrice ?? 0));
  const [openText, setOpenText] = useState(product && product.openingStock > 0 ? formatQty(product.openingStock) : "");
  const [minText, setMinText] = useState(product && product.minStock > 0 ? formatQty(product.minStock) : "");
  const [errors, setErrors] = useState<{ name?: string; buy?: string; sell?: string; open?: string; min?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const err: typeof errors = {};
    const n = name.trim();
    if (!n) err.name = t("errNameRequired");
    else if (n.length > 60) err.name = t("errTooLong");
    else if (data.shopProducts.some((p) => p.id !== product?.id && p.name.toLowerCase() === n.toLowerCase())) err.name = t("errDuplicate");
    const buy = parseAmountOrZero(buyText);
    const sell = parseAmountOrZero(sellText);
    const opening = parseQtyOrZero(openText);
    const min = parseQtyOrZero(minText);
    if (buy === null) err.buy = t("errAmountInvalid");
    if (sell === null) err.sell = t("errAmountInvalid");
    if (opening === null) err.open = t("errQtyInvalid");
    if (min === null) err.min = t("errQtyInvalid");
    setErrors(err);
    if (Object.keys(err).length || buy === null || sell === null || opening === null || min === null) return;
    setBusy(true);
    try {
      const now = Date.now();
      const row: ShopProduct = { id: product?.id ?? newId(), name: n, unit, buyPrice: buy, sellPrice: sell, openingStock: opening, minStock: min, createdAt: product?.createdAt ?? now, updatedAt: now };
      await db.shopProducts.put(row);
      toast(t("prodSaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={product ? t("prodEdit") : t("prodAdd")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("prodName")} error={errors.name}>
          <input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t("prodUnit")}>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)}>
            {PRODUCT_UNITS.map((u) => (
              <option key={u} value={u}>
                {t(UNIT_KEY[u])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("prodBuy")} optional error={errors.buy}>
          <input className="input" inputMode="decimal" placeholder="0" value={buyText} onChange={(e) => setBuyText(e.target.value)} />
        </Field>
        <Field label={t("prodSell")} optional error={errors.sell}>
          <input className="input" inputMode="decimal" placeholder="0" value={sellText} onChange={(e) => setSellText(e.target.value)} />
        </Field>
        <Field label={t("prodOpening")} optional error={errors.open}>
          <input className="input" inputMode="decimal" placeholder="0" value={openText} onChange={(e) => setOpenText(e.target.value)} />
        </Field>
        <Field label={t("prodMin")} optional error={errors.min}>
          <input className="input" inputMode="decimal" placeholder="0" value={minText} onChange={(e) => setMinText(e.target.value)} />
        </Field>
        <p className="-mt-2 text-xs text-muted">{t("prodMinHint")}</p>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}

export function AdjustSheet({ product, onClose }: { product: ShopProduct; onClose: () => void }) {
  const { t, toast } = useApp();
  const [dir, setDir] = useState<"add" | "sub">("sub");
  const [qtyText, setQtyText] = useState("");
  const [dateText, setDateText] = useState(todayDhaka());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ qty?: string; date?: string; note?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const err: typeof errors = {};
    const qty = parseQty(qtyText);
    if (qty === null) err.qty = t("errQtyInvalid");
    if (!isValidIsoDate(dateText) || dateText < "2000-01-01" || dateText > "2100-12-31") err.date = t("errDateInvalid");
    if (note.length > 200) err.note = t("errTooLong");
    setErrors(err);
    if (Object.keys(err).length || qty === null) return;
    setBusy(true);
    try {
      await db.shopAdjustments.add({ id: newId(), productId: product.id, delta: dir === "add" ? qty : -qty, date: dateText, note: note.trim() || undefined, createdAt: Date.now() });
      toast(t("prodAdjustSaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={`${t("prodAdjust")} — ${product.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-muted">{t("prodAdjustHint")}</p>
        <Field label={t("prodAdjustDir")}>
          <select className="input" value={dir} onChange={(e) => setDir(e.target.value as "add" | "sub")}>
            <option value="sub">{t("prodAdjustSub")}</option>
            <option value="add">{t("prodAdjustAdd")}</option>
          </select>
        </Field>
        <Field label={`${t("prodAdjustQty")} (${t(UNIT_KEY[(PRODUCT_UNITS as readonly string[]).includes(product.unit) ? (product.unit as ProductUnit) : "pcs"])})`} error={errors.qty}>
          <input className="input text-xl font-bold" inputMode="decimal" placeholder="0" value={qtyText} onChange={(e) => setQtyText(e.target.value)} autoFocus />
        </Field>
        <Field label={t("date")} error={errors.date}>
          <input className="input" type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} />
        </Field>
        <Field label={t("prodAdjustNote")} optional error={errors.note}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
