"use client";

import { Package, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { AdjustSheet, ProductFormSheet, UNIT_KEY } from "@/components/ProductSheets";
import { SHOP_KIND_LABEL, ShopEntrySheet } from "@/components/ShopEntrySheet";
import { EmptyState, PageHeader, Sheet } from "@/components/ui";
import { db } from "@/lib/db";
import { formatQty, stockSummary, type StockRow } from "@/lib/products";
import { PRODUCT_UNITS, type ProductUnit, type ShopEntryKind, type ShopProduct } from "@/lib/types";

export default function ShopProductsPage() {
  const { t, data, money, num, date, toast, confirm, dataReady } = useApp();
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<{ product?: ShopProduct } | null>(null);
  const [adjusting, setAdjusting] = useState<ShopProduct | null>(null);
  const [entrySheet, setEntrySheet] = useState<{ kind: ShopEntryKind; productId: string } | null>(null);

  const summary = useMemo(() => stockSummary(data.shopProducts, data.shopEntries, data.shopAdjustments), [data.shopProducts, data.shopEntries, data.shopAdjustments]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const alert = (r: StockRow) => (r.low || (r.out && r.product.minStock > 0) ? 0 : 1);
    return summary.rows.filter((r) => !needle || r.product.name.toLowerCase().includes(needle)).sort((a, b) => alert(a) - alert(b) || a.product.name.localeCompare(b.product.name));
  }, [summary.rows, q]);

  if (!dataReady) return null;

  const unitLabel = (u: string) => ((PRODUCT_UNITS as readonly string[]).includes(u) ? t(UNIT_KEY[u as ProductUnit]) : u);
  const qtyText = (milli: number, unit: string) => `${num(formatQty(milli))} ${unitLabel(unit)}`;
  const detail = detailId ? summary.rows.find((r) => r.product.id === detailId) : undefined;

  async function removeProduct(p: ShopProduct) {
    const used = data.shopEntries.some((e) => e.productId === p.id) || data.shopAdjustments.some((a) => a.productId === p.id);
    if (used) {
      toast(t("prodInUse"), "error");
      return;
    }
    if (!(await confirm({ message: t("prodDeleteConfirm"), danger: true, confirmText: t("delete") }))) return;
    try {
      await db.shopProducts.delete(p.id);
      setDetailId(null);
      toast(t("prodDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  const history = detail
    ? [
        ...data.shopEntries
          .filter((e) => e.productId === detail.product.id && e.qty)
          .map((e) => ({ id: e.id, date: e.date, at: e.createdAt, label: t(SHOP_KIND_LABEL[e.kind]), delta: e.kind === "purchase" ? (e.qty ?? 0) : -(e.qty ?? 0) })),
        ...data.shopAdjustments.filter((a) => a.productId === detail.product.id).map((a) => ({ id: a.id, date: a.date, at: a.createdAt, label: a.note ? `${t("prodAdjustLabel")}: ${a.note}` : t("prodAdjustLabel"), delta: a.delta })),
      ]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.at - a.at))
        .slice(0, 25)
    : [];

  return (
    <div>
      <PageHeader
        title={t("prodTitle")}
        right={
          <button className="btn btn-primary" onClick={() => setForm({})}>
            <Plus className="h-5 w-5" />
            {t("add")}
          </button>
        }
      />

      {data.shopProducts.length > 0 && (
        <>
          <div className="card mb-3">
            <p className="text-sm text-muted">{t("prodValue")}</p>
            <p className="text-2xl font-bold">{money(summary.totalValue)}</p>
            {(summary.lowCount > 0 || summary.outCount > 0) && (
              <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-400">{t("prodAlertText", { low: num(summary.lowCount), out: num(summary.outCount) })}</p>
            )}
          </div>
          <input className="input mb-3" type="search" placeholder={t("prodSearch")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("prodSearch")} />
        </>
      )}

      {data.shopProducts.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title={t("prodEmptyTitle")}
            hint={t("prodEmptyHint")}
            action={
              <button className="btn btn-primary" onClick={() => setForm({})}>
                <Plus className="h-5 w-5" />
                {t("prodAdd")}
              </button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.product.id}>
              <button className="card flex w-full items-center justify-between gap-3 text-left" onClick={() => setDetailId(r.product.id)}>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{r.product.name}</p>
                  <p className="text-xs text-muted">{r.product.sellPrice > 0 ? money(r.product.sellPrice) : "—"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-lg font-bold ${r.out ? "text-rose-600" : r.low ? "text-amber-700 dark:text-amber-400" : ""}`}>{qtyText(r.stock, r.product.unit)}</p>
                  {r.out ? <p className="text-xs font-semibold text-rose-600">{t("prodOut")}</p> : r.low ? <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t("prodLow")}</p> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <Sheet title={detail.product.name} onClose={() => setDetailId(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="card">
                <p className="text-xs text-muted">{t("prodStock")}</p>
                <p className={`text-lg font-bold ${detail.out ? "text-rose-600" : ""}`}>{qtyText(detail.stock, detail.product.unit)}</p>
              </div>
              <div className="card">
                <p className="text-xs text-muted">{t("prodValue")}</p>
                <p className="text-lg font-bold">{money(detail.value)}</p>
              </div>
              <div className="card">
                <p className="text-xs text-muted">{t("prodBuy")}</p>
                <p className="text-lg font-bold">{detail.product.buyPrice > 0 ? money(detail.product.buyPrice) : "—"}</p>
              </div>
              <div className="card">
                <p className="text-xs text-muted">{t("prodSell")}</p>
                <p className="text-lg font-bold">{detail.product.sellPrice > 0 ? money(detail.product.sellPrice) : "—"}</p>
              </div>
            </div>
            {detail.product.buyPrice > 0 && detail.product.sellPrice > 0 && (
              <p className="text-sm">
                {t("prodMargin")}: <b>{money(detail.product.sellPrice - detail.product.buyPrice)}</b>
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn btn-primary"
                onClick={() => {
                  const id = detail.product.id;
                  setDetailId(null);
                  setEntrySheet({ kind: "sale", productId: id });
                }}
              >
                {t("prodSellNow")}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const id = detail.product.id;
                  setDetailId(null);
                  setEntrySheet({ kind: "purchase", productId: id });
                }}
              >
                {t("prodBuyMore")}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const p = detail.product;
                  setDetailId(null);
                  setAdjusting(p);
                }}
              >
                <SlidersHorizontal className="h-5 w-5" />
                {t("prodAdjust")}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const p = detail.product;
                  setDetailId(null);
                  setForm({ product: p });
                }}
              >
                <Pencil className="h-5 w-5" />
                {t("edit")}
              </button>
              <button className="btn btn-ghost col-span-2 text-rose-600" onClick={() => void removeProduct(detail.product)}>
                <Trash2 className="h-5 w-5" />
                {t("delete")}
              </button>
            </div>

            {history.length > 0 && (
              <section>
                <h3 className="mb-2 font-bold">{t("prodHistory")}</h3>
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {date(h.date)} • {h.label}
                      </span>
                      <span className={`shrink-0 font-semibold ${h.delta < 0 ? "text-rose-600" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {h.delta > 0 ? "+" : ""}
                        {num(formatQty(h.delta))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </Sheet>
      )}

      {form && <ProductFormSheet product={form.product} onClose={() => setForm(null)} />}
      {adjusting && <AdjustSheet product={adjusting} onClose={() => setAdjusting(null)} />}
      {entrySheet && <ShopEntrySheet defaultKind={entrySheet.kind} presetProductId={entrySheet.productId} onClose={() => setEntrySheet(null)} />}
    </div>
  );
}
