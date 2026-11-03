"use client";

import { Receipt, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { useTxForm } from "@/components/TransactionForm";
import { TransactionDetailSheet, TransactionRow } from "@/components/TransactionParts";
import { EmptyState, PageHeader } from "@/components/ui";
import { sumTx } from "@/lib/calc";
import { PAYMENT_METHODS, TX_TYPES, type Transaction, type TxType } from "@/lib/types";

const TYPE_LABEL = { income: "typeIncome", expense: "typeExpense", saving: "typeSaving", withdraw: "typeWithdraw" } as const;

export default function TransactionsPage() {
  const { t, data, catName, date, money, num, dataReady } = useApp();
  const form = useTxForm();
  const [q, setQ] = useState("");
  const [type, setType] = useState<TxType | "all">("all");
  const [categoryId, setCategoryId] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // শর্টকাট: /transactions?add=expense
  useEffect(() => {
    const add = new URLSearchParams(window.location.search).get("add");
    if (add && (TX_TYPES as string[]).includes(add)) {
      form.open({ type: add as TxType });
      window.history.replaceState(null, "", "/transactions");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.transactions
      .filter((x) => {
        if (type !== "all" && x.type !== type) return false;
        if (categoryId && x.categoryId !== categoryId) return false;
        if (method && x.paymentMethod !== method) return false;
        if (from && x.date < from) return false;
        if (to && x.date > to) return false;
        if (needle) {
          const hay = `${x.description ?? ""} ${x.note ?? ""} ${catName(catMap.get(x.categoryId))} ${catMap.get(x.categoryId)?.name ?? ""}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  }, [data.transactions, q, type, categoryId, method, from, to, catName, catMap]);

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const x of filtered) {
      const list = m.get(x.date);
      if (list) list.push(x);
      else m.set(x.date, [x]);
    }
    return [...m.entries()];
  }, [filtered]);

  const activeFilters = [type !== "all", !!categoryId, !!method, !!from, !!to].filter(Boolean).length;
  const selected = selectedId ? data.transactions.find((x) => x.id === selectedId) : undefined;
  const catOptions = data.categories.filter((c) => type === "all" || c.type === type);

  function clear() {
    setType("all");
    setCategoryId("");
    setMethod("");
    setFrom("");
    setTo("");
    setQ("");
  }

  if (!dataReady) return null;

  return (
    <div>
      <PageHeader title={t("navTransactions")} sub={t("matchCount", { n: filtered.length })} />

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder={t("searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("search")} />
        </div>
        <button className={`btn btn-ghost relative px-3 ${showFilters ? "border-emerald-600" : ""}`} onClick={() => setShowFilters((s) => !s)} aria-label={t("filters")}>
          <SlidersHorizontal className="h-5 w-5" />
          {activeFilters > 0 && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-xs text-white">{num(activeFilters)}</span>}
        </button>
      </div>

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {(["all", ...TX_TYPES] as const).map((x) => (
          <button
            key={x}
            className={`chip ${type === x ? "chip-active" : ""}`}
            onClick={() => {
              setType(x);
              setCategoryId("");
            }}
          >
            {x === "all" ? t("all") : t(TYPE_LABEL[x])}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="card mb-3 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">{t("category")}</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t("allCategories")}</option>
              {catOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {catName(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">{t("paymentMethod")}</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">{t("allMethods")}</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`pm_${m}` as const)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("from")}</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("to")}</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn btn-ghost btn-sm col-span-2" onClick={clear}>
            <X className="h-4 w-4" />
            {t("clearFilters")}
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        data.transactions.length === 0 ? (
          <EmptyState icon={<Receipt className="h-8 w-8" />} title={t("noTransactionsTitle")} hint={t("noTransactionsHint")} />
        ) : (
          <EmptyState icon={<Search className="h-8 w-8" />} title={t("noResults")} hint={t("noResultsHint")} />
        )
      ) : (
        <div className="space-y-3">
          {groups.map(([d, list]) => {
            const s = sumTx(list);
            return (
              <section key={d} className="card !p-3">
                <div className="mb-1 flex items-center justify-between border-b border-line pb-2 text-sm">
                  <span className="font-semibold">{date(d, true)}</span>
                  <span className="text-xs text-muted">
                    {s.income > 0 && <span className="text-emerald-600">+{money(s.income, false)} </span>}
                    {s.expense > 0 && <span className="text-rose-600">-{money(s.expense, false)}</span>}
                  </span>
                </div>
                <div className="divide-y divide-line">
                  {list.map((x) => (
                    <TransactionRow key={x.id} tx={x} onClick={() => setSelectedId(x.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selected && <TransactionDetailSheet tx={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
