"use client";

import { ChevronLeft, ChevronRight, Share2, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EmptyState, PageHeader } from "@/components/ui";
import { addMonths, monthKey, todayDhaka } from "@/lib/dates";
import { messSummary } from "@/lib/mess";

export default function MessHomePage() {
  const { t, data, money, num, monthLabel, toast, dataReady } = useApp();
  const [month, setMonth] = useState(monthKey(todayDhaka()));
  const s = useMemo(() => messSummary(data.messMembers, data.messMeals, data.messEntries, month), [data.messMembers, data.messMeals, data.messEntries, month]);

  if (!dataReady) return null;

  async function share() {
    const lines = [
      t("messShareHeading", { m: monthLabel(month) }),
      `${t("messTotalBazaar")}: ${money(s.totalBazaar)}`,
      `${t("messTotalMeals")}: ${num(s.totalHalves / 2)}`,
      `${t("messMealRate")}: ${money(s.mealRate)}`,
      `${t("messTotalShared")}: ${money(s.totalShared)}`,
      "",
      ...s.rows.map((r) => {
        const state = r.balance > 0 ? `${t("messGets")} ${money(r.balance)}` : r.balance < 0 ? `${t("messOwes")} ${money(-r.balance)}` : t("messSettled");
        return `${r.member.name} — ${t("messMealsLabel")} ${num(r.halves / 2)} — ${state}`;
      }),
    ];
    const text = lines.join("\n");
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast(t("messCopied"));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // ব্যবহারকারী শেয়ার বাতিল করেছেন
      toast(t("dbError"), "error");
    }
  }

  const stats = [
    { label: t("messTotalBazaar"), value: money(s.totalBazaar) },
    { label: t("messTotalMeals"), value: num(s.totalHalves / 2) },
    { label: t("messMealRate"), value: money(s.mealRate) },
    { label: t("messTotalShared"), value: money(s.totalShared) },
    { label: t("messTotalDeposits"), value: money(s.totalDeposits) },
    { label: t("messPool"), value: money(s.pool) },
  ];

  return (
    <div>
      <PageHeader title={t("messTitle")} />

      <div className="mb-4 flex items-center gap-2">
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setMonth(addMonths(month, -1))} aria-label="−1">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="flex-1 text-center text-lg font-bold">{monthLabel(month)}</p>
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setMonth(addMonths(month, 1))} aria-label="+1">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {data.messMembers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={t("messNoMembersTitle")}
            hint={t("messNoMembersHint")}
            action={
              <Link href="/mess/members" className="btn btn-primary">
                {t("messMemberAdd")}
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            {stats.map((x) => (
              <div key={x.label} className="card">
                <p className="text-xs text-muted">{x.label}</p>
                <p className="text-lg font-bold">{x.value}</p>
              </div>
            ))}
          </div>
          <p className="mb-4 text-xs text-muted">{t("messPoolHint")}</p>
          {s.noMeals && (
            <p className="mb-4 rounded-xl bg-amber-100 p-3 text-sm font-medium text-amber-900" role="status">
              {t("messNoMeals")}
            </p>
          )}

          <h2 className="mb-2 text-lg font-bold">{t("messSettlement")}</h2>
          <ul className="space-y-3">
            {s.rows.map((r) => (
              <li key={r.member.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-base font-semibold">
                    {r.member.name}
                    {!r.member.active && <span className="ml-2 text-xs font-normal text-muted">({t("messMemberInactive")})</span>}
                  </p>
                  <div className="shrink-0 text-right">
                    <p className={`text-lg font-bold ${r.balance > 0 ? "text-emerald-700 dark:text-emerald-400" : r.balance < 0 ? "text-rose-600" : ""}`}>{money(Math.abs(r.balance))}</p>
                    <p className="text-xs text-muted">{r.balance > 0 ? t("messGets") : r.balance < 0 ? t("messOwes") : t("messSettled")}</p>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
                  <div className="flex justify-between">
                    <dt>{t("messMealsLabel")}</dt>
                    <dd>{num(r.halves / 2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("messMealCost")}</dt>
                    <dd>{money(r.mealCost)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("messSharedShare")}</dt>
                    <dd>{money(r.shared)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("messDeposited")}</dt>
                    <dd>{money(r.deposits)}</dd>
                  </div>
                  {r.paid > 0 && (
                    <div className="col-span-2 flex justify-between">
                      <dt>{t("messPaidPocket")}</dt>
                      <dd>{money(r.paid)}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>

          <button className="btn btn-ghost mt-4 w-full" onClick={() => void share()}>
            <Share2 className="h-5 w-5" />
            {t("messShare")}
          </button>
        </>
      )}
    </div>
  );
}
