"use client";

import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EmptyState, PageHeader } from "@/components/ui";
import { addDays, isValidIsoDate, todayDhaka } from "@/lib/dates";
import { db } from "@/lib/db";
import { mealId } from "@/lib/mess";
import type { MessMember } from "@/lib/types";

const MAX_HALVES = 24;

export default function MessMealsPage() {
  const { t, data, num, date, toast, dataReady } = useApp();
  const [day, setDay] = useState(todayDhaka());

  if (!dataReady) return null;

  const dayMeals = new Map(data.messMeals.filter((m) => m.date === day).map((m) => [m.memberId, m.halves]));
  // সক্রিয় সদস্য + (নিষ্ক্রিয় হলেও) যার ওই দিনে মিল আছে
  const people: MessMember[] = data.messMembers.filter((m) => m.active || dayMeals.has(m.id)).sort((a, b) => a.createdAt - b.createdAt);
  const totalHalves = people.reduce((s, m) => s + (dayMeals.get(m.id) ?? 0), 0);

  async function setHalves(m: MessMember, halves: number) {
    const h = Math.min(MAX_HALVES, Math.max(0, halves));
    try {
      if (h === 0) await db.messMeals.delete(mealId(day, m.id));
      else await db.messMeals.put({ id: mealId(day, m.id), date: day, memberId: m.id, halves: h, updatedAt: Date.now() });
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <div>
      <PageHeader title={t("messMealsTitle")} />

      <div className="mb-4 flex items-center gap-2">
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setDay(addDays(day, -1))} aria-label="−1">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 text-center">
          <input
            className="input text-center"
            type="date"
            value={day}
            onChange={(e) => {
              if (isValidIsoDate(e.target.value)) setDay(e.target.value);
            }}
            aria-label={date(day)}
          />
        </div>
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setDay(addDays(day, 1))} aria-label="+1">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <p className="mb-1 text-sm font-medium">{t("messMealsDay", { n: num(totalHalves / 2) })}</p>
      <p className="mb-4 text-xs text-muted">{t("messMealsHint")}</p>

      {people.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Plus className="h-8 w-8" />} title={t("messNoMembersTitle")} hint={t("messNoMembersHint")} />
        </div>
      ) : (
        <ul className="space-y-3">
          {people.map((m) => {
            const halves = dayMeals.get(m.id) ?? 0;
            return (
              <li key={m.id} className="card flex items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-base font-semibold">{m.name}</p>
                <button className="flex h-12 w-12 items-center justify-center rounded-full bg-soft disabled:opacity-40" onClick={() => void setHalves(m, halves - 1)} disabled={halves === 0} aria-label={t("messMealDec")}>
                  <Minus className="h-5 w-5" />
                </button>
                <span className="w-12 text-center text-xl font-bold" aria-live="polite">
                  {num(halves / 2)}
                </span>
                <button className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-white disabled:opacity-40" onClick={() => void setHalves(m, halves + 1)} disabled={halves >= MAX_HALVES} aria-label={t("messMealInc")}>
                  <Plus className="h-5 w-5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
