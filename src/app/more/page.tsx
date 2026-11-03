"use client";

import { ChevronRight, HandCoins, PiggyBank, Repeat, Settings } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { PageHeader } from "@/components/ui";

export default function MorePage() {
  const { t } = useApp();
  const items = [
    { href: "/budgets", label: t("navBudgets"), icon: PiggyBank, color: "bg-amber-500" },
    { href: "/debts", label: t("navDebts"), icon: HandCoins, color: "bg-sky-600" },
    { href: "/recurring", label: t("navRecurring"), icon: Repeat, color: "bg-violet-600" },
    { href: "/settings", label: t("navSettings"), icon: Settings, color: "bg-slate-600" },
  ];
  return (
    <div>
      <PageHeader title={t("more")} />
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
