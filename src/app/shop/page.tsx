"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { UNIT_KEY } from "@/components/ProductSheets";
import { PrintBlock, PrintButton, PrintDoc } from "@/components/PrintDoc";
import { SHOP_KIND_LABEL, ShopEntrySheet } from "@/components/ShopEntrySheet";
import { PageHeader } from "@/components/ui";
import { endOfMonth, monthKey, startOfMonth, todayDhaka } from "@/lib/dates";
import { formatQty, stockSummary } from "@/lib/products";
import { shopSummary } from "@/lib/shop";
import { shopProfitAvg, topProducts } from "@/lib/shopAnalytics";
import { PRODUCT_UNITS, type ProductUnit, type ShopEntryKind } from "@/lib/types";

type Period = "today" | "month" | "all";
const QUICK: ShopEntryKind[] = ["sale", "purchase", "expense", "receive"];

export default function ShopHomePage() {
  const { t, data, money, num, date, monthLabel, settings, updateSetting, toast, dataReady } = useApp();
  const [period, setPeriod] = useState<Period>("today");
  const [adding, setAdding] = useState<ShopEntryKind | null>(null);
  const today = todayDhaka();
  const avgMode = settings.shopProfitMode === "avg";

  const [from, to] = useMemo<[string | null, string | null]>(
    () => (period === "today" ? [today, today] : period === "month" ? [startOfMonth(today), endOfMonth(today)] : [null, null]),
    [period, today],
  );
  const s = useMemo(() => shopSummary(data.shopEntries, data.shopParties, from, to), [data.shopEntries, data.shopParties, from, to]);
  const avg = useMemo(() => shopProfitAvg(data.shopEntries, data.shopProducts, from, to), [data.shopEntries, data.shopProducts, from, to]);
  const top = useMemo(() => topProducts(data.shopEntries, data.shopProducts, from, to, 5), [data.shopEntries, data.shopProducts, from, to]);
  const stock = useMemo(() => stockSummary(data.shopProducts, data.shopEntries, data.shopAdjustments), [data.shopProducts, data.shopEntries, data.shopAdjustments]);

  if (!dataReady) return null;

  const profit = avgMode ? avg.profit : s.profit;
  const unitLabel = (u: string) => ((PRODUCT_UNITS as readonly string[]).includes(u) ? t(UNIT_KEY[u as ProductUnit]) : u);

  async function setMode(mode: "simple" | "avg") {
    if (mode === settings.shopProfitMode) return;
    try {
      await updateSetting("shopProfitMode", mode);
    } catch {
      toast(t("dbError"), "error");
    }
  }

  const periodStats = [
    { label: t("shopSales"), value: money(s.sales), tone: "text-emerald-700 dark:text-emerald-400" },
    { label: t("shopPurchases"), value: money(s.purchases), tone: "" },
    { label: t("shopExpenses"), value: money(s.expenses), tone: "" },
    { label: t("shopProfit"), value: money(profit), tone: profit < 0 ? "text-rose-600" : "text-emerald-700 dark:text-emerald-400" },
  ];
  const balanceStats = [
    { label: t("shopCash"), value: money(s.cash), tone: s.cash < 0 ? "text-rose-600" : "" },
    { label: t("shopCustomerDue"), value: money(s.customerDue), tone: "" },
    { label: t("shopSupplierDue"), value: money(s.supplierDue), tone: "" },
  ];

  // ক্লোজিং রিপোর্ট (PDF/প্রিন্ট): নির্বাচিত সময়ের সারাংশ + সেই সময়ের সব এন্ট্রি
  const printTitle = period === "today" ? t("shopClosingTitle", { d: date(today) }) : period === "month" ? t("shopClosingMonthTitle", { m: monthLabel(monthKey(today)) }) : t("shopClosing");
  const partyName = new Map(data.shopParties.map((p) => [p.id, p.name]));
  const productName = new Map(data.shopProducts.map((p) => [p.id, p.name]));
  const inPeriod = data.shopEntries
    .filter((e) => (from === null || e.date >= from) && (to === null || e.date <= to))
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .slice(0, 300);
  const printBlocks: PrintBlock[] = [
    {
      type: "kv",
      heading: t("printTotals"),
      rows: [
        [t("shopSales"), money(s.sales)],
        [t("shopPurchases"), money(s.purchases)],
        [t("shopExpenses"), money(s.expenses)],
        [t("shopKindReceive"), money(s.received)],
        [t("shopKindPay"), money(s.paidOut)],
        ...(avgMode ? ([[t("shopCogs"), money(avg.cogs)]] as [string, string][]) : []),
        [`${t("shopProfit")} (${avgMode ? t("shopProfitAvg") : t("shopProfitSimple")})`, money(profit)],
        [t("shopCash"), money(s.cash)],
        [t("shopCustomerDue"), money(s.customerDue)],
        [t("shopSupplierDue"), money(s.supplierDue)],
      ],
    },
    ...(inPeriod.length > 0
      ? [
          {
            type: "table" as const,
            heading: t("shopBook"),
            head: [t("date"), t("shopEntryKind"), t("shopNote"), t("amount")],
            rows: inPeriod.map((e) => [
              date(e.date),
              t(SHOP_KIND_LABEL[e.kind]),
              [e.partyId ? partyName.get(e.partyId) : e.category, e.productId && e.qty ? `${productName.get(e.productId) ?? ""} × ${num(formatQty(e.qty))}` : "", e.note].filter(Boolean).join(" • "),
              money(e.amount),
            ]),
            right: [3],
          },
        ]
      : []),
  ];

  return (
    <div>
      <PrintDoc title={printTitle} blocks={printBlocks} />
      <PageHeader title={t("shopTitle")} right={<PrintButton />} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        {QUICK.map((k) => (
          <button key={k} className="btn btn-primary" onClick={() => setAdding(k)}>
            <Plus className="h-5 w-5" />
            {t(SHOP_KIND_LABEL[k])}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(["today", "month", "all"] as Period[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${period === p ? "bg-emerald-700 text-white" : "bg-soft"}`}>
            {p === "today" ? t("shopToday") : p === "month" ? t("shopThisMonth") : t("shopAllTime")}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        {periodStats.map((x) => (
          <div key={x.label} className="card">
            <p className="text-xs text-muted">{x.label}</p>
            <p className={`text-lg font-bold ${x.tone}`}>{x.value}</p>
          </div>
        ))}
      </div>
      {avgMode && (
        <div className="card mb-3 flex items-center justify-between">
          <p className="text-sm text-muted">{t("shopCogs")}</p>
          <p className="text-lg font-bold">{money(avg.cogs)}</p>
        </div>
      )}

      <div className="mb-3 grid grid-cols-1 gap-3">
        {balanceStats.map((x) => (
          <div key={x.label} className="card flex items-center justify-between">
            <p className="text-sm text-muted">{x.label}</p>
            <p className={`text-lg font-bold ${x.tone}`}>{x.value}</p>
          </div>
        ))}
      </div>

      {top.length > 0 && (
        <section className="card mb-3">
          <h2 className="mb-2 text-base font-bold">{t("shopTopProducts")}</h2>
          <ul className="space-y-1">
            {top.map((r) => (
              <li key={r.product.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {r.product.name} <span className="text-muted">({num(formatQty(r.qty))} {unitLabel(r.product.unit)})</span>
                </span>
                <b className="shrink-0">{money(r.revenue)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.shopProducts.length > 0 && (
        <Link href="/shop/products" className="card mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{t("prodValue")}</p>
            <p className="text-lg font-bold">{money(stock.totalValue)}</p>
          </div>
          {stock.lowCount + stock.outCount > 0 && <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{t("prodAlertText", { low: num(stock.lowCount), out: num(stock.outCount) })}</p>}
        </Link>
      )}

      <section className="mb-2">
        <p className="mb-2 text-sm font-semibold">{t("shopProfitMode")}</p>
        <div className="flex gap-2">
          {(["simple", "avg"] as const).map((m) => (
            <button key={m} onClick={() => void setMode(m)} aria-pressed={settings.shopProfitMode === m} className={`min-h-11 flex-1 rounded-full px-4 text-sm font-semibold ${settings.shopProfitMode === m ? "bg-emerald-700 text-white" : "bg-soft"}`}>
              {m === "simple" ? t("shopProfitSimple") : t("shopProfitAvg")}
            </button>
          ))}
        </div>
      </section>
      <p className="text-xs text-muted">{avgMode ? t("shopProfitAvgHint") : t("shopProfitHint")}</p>

      {adding && <ShopEntrySheet defaultKind={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}
