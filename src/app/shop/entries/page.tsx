"use client";

import { ChevronLeft, ChevronRight, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { SHOP_KIND_LABEL, ShopEntrySheet } from "@/components/ShopEntrySheet";
import { EmptyState, PageHeader } from "@/components/ui";
import { addMonths, monthKey, todayDhaka } from "@/lib/dates";
import { db } from "@/lib/db";
import { creditOf } from "@/lib/shop";
import { SHOP_ENTRY_KINDS, type ShopEntry, type ShopEntryKind } from "@/lib/types";

type Filter = "all" | ShopEntryKind;
const IN_KINDS: ShopEntryKind[] = ["sale", "receive"];

export default function ShopEntriesPage() {
  const { t, data, money, date, monthLabel, toast, confirm, dataReady } = useApp();
  const [month, setMonth] = useState(monthKey(todayDhaka()));
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ entry?: ShopEntry } | null>(null);

  const nameOf = useMemo(() => new Map(data.shopParties.map((p) => [p.id, p.name])), [data.shopParties]);
  const list = useMemo(
    () =>
      data.shopEntries
        .filter((e) => e.date.slice(0, 7) === month && (filter === "all" || e.kind === filter))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)),
    [data.shopEntries, month, filter],
  );
  const total = list.reduce((s, e) => s + e.amount, 0);

  if (!dataReady) return null;

  async function remove(e: ShopEntry) {
    if (!(await confirm({ message: t("shopEntryDeleteConfirm"), danger: true, confirmText: t("delete") }))) return;
    try {
      await db.shopEntries.delete(e.id);
      toast(t("shopEntryDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("shopBook")}
        right={
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus className="h-5 w-5" />
            {t("add")}
          </button>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setMonth(addMonths(month, -1))} aria-label="−1">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="flex-1 text-center text-lg font-bold">{monthLabel(month)}</p>
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setMonth(addMonths(month, 1))} aria-label="+1">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(["all", ...SHOP_ENTRY_KINDS] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${filter === f ? "bg-emerald-700 text-white" : "bg-soft"}`}>
            {f === "all" ? t("shopKindAll") : t(SHOP_KIND_LABEL[f])}
          </button>
        ))}
      </div>

      {list.length > 0 && filter !== "all" && <p className="mb-3 text-sm font-medium">{money(total)}</p>}

      {list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title={t("shopEmpty")}
            action={
              <button className="btn btn-primary" onClick={() => setEditing({})}>
                <Plus className="h-5 w-5" />
                {t("shopEntryAdd")}
              </button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((e) => {
            const who = e.partyId ? (nameOf.get(e.partyId) ?? "—") : (e.category ?? "");
            const due = creditOf(e);
            return (
              <li key={e.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold">
                      {t(SHOP_KIND_LABEL[e.kind])}
                      {who ? ` • ${who}` : ""}
                    </p>
                    <p className="text-sm text-muted">
                      {date(e.date)}
                      {e.note ? ` • ${e.note}` : ""}
                    </p>
                    {due > 0 && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("shopDueLeft", { a: money(due) })}</p>}
                  </div>
                  <p className={`shrink-0 text-lg font-bold ${IN_KINDS.includes(e.kind) ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{money(e.amount)}</p>
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setEditing({ entry: e })} aria-label={t("edit")}>
                    <Pencil className="h-5 w-5" />
                  </button>
                  <button className="flex h-11 w-11 items-center justify-center rounded-full text-rose-600 hover:bg-soft" onClick={() => void remove(e)} aria-label={t("delete")}>
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <ShopEntrySheet entry={editing.entry} defaultKind={filter === "all" ? "sale" : filter} onClose={() => setEditing(null)} />}
    </div>
  );
}
