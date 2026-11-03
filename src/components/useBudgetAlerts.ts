"use client";

import { useCallback } from "react";
import { budgetStatuses, categoryMap } from "@/lib/calc";
import type { Transaction } from "@/lib/types";
import { useApp } from "./AppProvider";

const RANK = { ok: 0, warn: 1, over: 2 } as const;

/** লেনদেন যোগ/বদলের পর কোনো বাজেট ৮০% বা ১০০% পার করলে সতর্কবার্তা দেখায় */
export function useBudgetAlerts() {
  const { data, t, toast, catName, settings } = useApp();
  return useCallback(
    (before: Transaction[], after: Transaction[], months: string[]) => {
      const cats = categoryMap(data.categories);
      const seen = new Set<string>();
      for (const month of new Set(months)) {
        const b = new Map(budgetStatuses(data.budgets, before, month, settings.monthStartDay).map((s) => [s.budget.id, s]));
        for (const s of budgetStatuses(data.budgets, after, month, settings.monthStartDay)) {
          const prev = b.get(s.budget.id);
          if (s.level === "ok" || (prev && RANK[prev.level] >= RANK[s.level])) continue;
          const name = s.budget.categoryId === null ? t("overall") : catName(cats.get(s.budget.categoryId));
          const text = s.level === "over" ? t("budgetOver", { name }) : t("budgetWarn", { name, p: s.percent });
          if (seen.has(text)) continue;
          seen.add(text);
          toast(text, s.level === "over" ? "error" : "warn");
          if (settings.budgetNotifications && typeof Notification !== "undefined" && Notification.permission === "granted") {
            const opts = { body: text, icon: "/icon-192.png", tag: `budget-${s.budget.id}` };
            if ("serviceWorker" in navigator) {
              navigator.serviceWorker.ready.then((r) => r.showNotification(t("appName"), opts)).catch(() => new Notification(t("appName"), opts));
            } else {
              new Notification(t("appName"), opts);
            }
          }
        }
      }
    },
    [data.budgets, data.categories, t, toast, catName, settings.budgetNotifications, settings.monthStartDay],
  );
}
