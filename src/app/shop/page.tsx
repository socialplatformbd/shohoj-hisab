"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { SHOP_KIND_LABEL, ShopEntrySheet } from "@/components/ShopEntrySheet";
import { PageHeader } from "@/components/ui";
import { endOfMonth, startOfMonth, todayDhaka } from "@/lib/dates";
import { shopSummary } from "@/lib/shop";
import type { ShopEntryKind } from "@/lib/types";

type Period = "today" | "month" | "all";
const QUICK: ShopEntryKind[] = ["sale", "purchase", "expense", "receive"];

export default function ShopHomePage() {
  const { t, data, money, dataReady } = useApp();
  const [period, setPeriod] = useState<Period>("today");
  const [adding, setAdding] = useState<ShopEntryKind | null>(null);
  const today = todayDhaka();

  const s = useMemo(() => {
    const [from, to] = period === "today" ? [today, today] : period === "month" ? [startOfMonth(today), endOfMonth(today)] : [null, null];
    return shopSummary(data.shopEntries, data.shopParties, from, to);
  }, [data.shopEntries, data.shopParties, period, today]);

  if (!dataReady) return null;

  const periodStats = [
    { label: t("shopSales"), value: money(s.sales), tone: "text-emerald-700 dark:text-emerald-400" },
    { label: t("shopPurchases"), value: money(s.purchases), tone: "" },
    { label: t("shopExpenses"), value: money(s.expenses), tone: "" },
    { label: t("shopProfit"), value: money(s.profit), tone: s.profit < 0 ? "text-rose-600" : "text-emerald-700 dark:text-emerald-400" },
  ];
  const balanceStats = [
    { label: t("shopCash"), value: money(s.cash), tone: s.cash < 0 ? "text-rose-600" : "" },
    { label: t("shopCustomerDue"), value: money(s.customerDue), tone: "" },
    { label: t("shopSupplierDue"), value: money(s.supplierDue), tone: "" },
  ];

  return (
    <div>
      <PageHeader title={t("shopTitle")} />

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
      <div className="mb-3 grid grid-cols-1 gap-3">
        {balanceStats.map((x) => (
          <div key={x.label} className="card flex items-center justify-between">
            <p className="text-sm text-muted">{x.label}</p>
            <p className={`text-lg font-bold ${x.tone}`}>{x.value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">{t("shopProfitHint")}</p>

      {adding && <ShopEntrySheet defaultKind={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}
