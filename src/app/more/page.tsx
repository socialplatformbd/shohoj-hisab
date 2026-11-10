"use client";

import { ChevronRight, HandCoins, Receipt, Repeat, Settings, Store, Target, Utensils, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { PageHeader } from "@/components/ui";
import type { AppMode } from "@/lib/types";

export default function MorePage() {
  const { t, settings, updateSetting, toast } = useApp();
  const router = useRouter();

  async function switchMode(m: AppMode) {
    if (m === settings.mode) return;
    try {
      await updateSetting("mode", m);
      toast(t("modeSwitched", { m: m === "mess" ? t("modeMess") : m === "shop" ? t("modeShop") : t("modePersonal") }));
      router.push(m === "mess" ? "/mess" : m === "shop" ? "/shop" : "/");
    } catch {
      toast(t("dbError"), "error");
    }
  }

  const modes = [
    { id: "personal" as const, label: t("modePersonal"), desc: t("modePersonalDesc"), icon: Wallet },
    { id: "mess" as const, label: t("modeMess"), desc: t("modeMessDesc"), icon: Utensils },
    { id: "shop" as const, label: t("modeShop"), desc: t("modeShopDesc"), icon: Store },
  ];
  const personalItems = [
    { href: "/budgets", label: t("navBudgets"), icon: Target, color: "bg-amber-500" },
    { href: "/debts", label: t("navDebts"), icon: HandCoins, color: "bg-sky-600" },
    { href: "/accounts", label: t("navAccounts"), icon: Wallet, color: "bg-teal-600" },
    { href: "/recurring", label: t("navRecurring"), icon: Repeat, color: "bg-violet-600" },
    { href: "/reimbursements", label: t("navReimbursements"), icon: Receipt, color: "bg-rose-500" },
  ];
  const settingsItem = { href: "/settings", label: t("navSettings"), icon: Settings, color: "bg-slate-600" };
  const items = settings.mode === "personal" ? [...personalItems, settingsItem] : [settingsItem];
  return (
    <div>
      <PageHeader title={t("more")} />
      <section className="mb-5">
        <h2 className="mb-1 text-lg font-bold">{t("modeTitle")}</h2>
        <p className="mb-3 text-sm text-muted">{t("modeHint")}</p>
        <div className="grid grid-cols-1 gap-3">
          {modes.map((m) => {
            const on = settings.mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => void switchMode(m.id)}
                aria-pressed={on}
                className={`card flex min-h-20 flex-col items-start gap-1 text-left ${on ? "border-emerald-600 ring-2 ring-emerald-600" : ""}`}
              >
                <m.icon className="h-6 w-6 text-emerald-700 dark:text-emerald-400" />
                <span className="text-base font-bold">{m.label}</span>
                <span className="text-xs text-muted">{m.desc}</span>
              </button>
            );
          })}
        </div>
      </section>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="card flex min-h-16 items-center gap-4">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-white ${i.color}`}>
                <i.icon className="h-6 w-6" />
              </span>
              <span className="flex-1 text-lg font-semibold">{i.label}</span>
              <ChevronRight className="h-5 w-5 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
