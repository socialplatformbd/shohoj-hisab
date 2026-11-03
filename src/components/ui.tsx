"use client";

import { X } from "lucide-react";
import { Children, cloneElement, isValidElement, useEffect, useId, type ReactElement, type ReactNode } from "react";
import { useApp } from "./AppProvider";
import type { SeriesPoint } from "@/lib/calc";
import type { TxType } from "@/lib/types";

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useApp();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-anim flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={onClose} aria-label={t("close")}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

/** লেবেলকে প্রথম input/select/textarea-এর সাথে যুক্ত করে (স্ক্রিন রিডার ও ট্যাপ-টু-ফোকাসের জন্য) */
function injectId(node: ReactNode, id: string, state: { done: boolean }): ReactNode {
  if (state.done || !isValidElement(node)) return node;
  const el = node as ReactElement<{ id?: string; children?: ReactNode }>;
  if (typeof el.type === "string" && ["input", "select", "textarea"].includes(el.type)) {
    state.done = true;
    return cloneElement(el, { id: el.props.id ?? id });
  }
  if (el.props.children === undefined) return el;
  const kids = Children.map(el.props.children, (c) => injectId(c, id, state));
  return cloneElement(el, undefined, kids);
}

export function Field({ label, error, children, optional }: { label: string; error?: string; children: ReactNode; optional?: boolean }) {
  const { t } = useApp();
  const id = useId();
  const content = Children.map(children, (c) => injectId(c, id, { done: false }));
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
        {optional && <span className="ml-1 text-xs font-normal opacity-70">({t("optional")})</span>}
      </label>
      {content}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-soft text-muted">{icon}</div>
      <p className="text-base font-semibold">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, right, sub }: { title: string; right?: ReactNode; sub?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export const TYPE_STYLE: Record<TxType, { text: string; bg: string; sign: string }> = {
  income: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-600", sign: "+" },
  expense: { text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-600", sign: "-" },
  saving: { text: "text-sky-600 dark:text-sky-400", bg: "bg-sky-600", sign: "" },
  withdraw: { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-600", sign: "" },
};

export function ProgressBar({ percent, level }: { percent: number; level: "ok" | "warn" | "over" }) {
  const color = level === "over" ? "bg-rose-600" : level === "warn" ? "bg-amber-500" : "bg-emerald-600";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={Math.min(percent, 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

/** হালকা SVG গ্রুপড বার চার্ট: আয় (সবুজ) বনাম খরচ (লাল) */
export function IncomeExpenseChart({ points, labelOf }: { points: SeriesPoint[]; labelOf: (key: string) => string }) {
  const { t, money } = useApp();
  const max = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]));
  const hasData = points.some((p) => p.income > 0 || p.expense > 0);
  if (!hasData) return <p className="py-8 text-center text-sm text-muted">{t("noDataChart")}</p>;
  const H = 140;
  const slot = points.length > 14 ? 22 : 56;
  const barW = points.length > 14 ? 8 : 18;
  const W = Math.max(points.length * slot, 280);
  const every = points.length > 14 ? Math.ceil(points.length / 7) : 1;
  const summary = points.map((p) => `${labelOf(p.key)}: ${t("typeIncome")} ${money(p.income, false)}, ${t("typeExpense")} ${money(p.expense, false)}`).join("; ");
  return (
    <div>
      <div className="overflow-x-auto no-scrollbar">
        <svg viewBox={`0 0 ${W} ${H + 28}`} style={{ minWidth: W, width: "100%", height: H + 28 }} role="img" aria-label={summary}>
          <line x1="0" y1={H} x2={W} y2={H} stroke="currentColor" className="text-line" />
          {points.map((p, i) => {
            const cx = i * slot + slot / 2;
            const hi = Math.round((p.income / max) * (H - 8));
            const he = Math.round((p.expense / max) * (H - 8));
            return (
              <g key={p.key}>
                <rect x={cx - barW - 1} y={H - hi} width={barW} height={hi} rx="3" className="fill-emerald-500" />
                <rect x={cx + 1} y={H - he} width={barW} height={he} rx="3" className="fill-rose-500" />
                {i % every === 0 && (
                  <text x={cx} y={H + 16} textAnchor="middle" fontSize="11" className="fill-muted">
                    {labelOf(p.key)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-center gap-5 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-500" />
          {t("typeIncome")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-rose-500" />
          {t("typeExpense")}
        </span>
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-label="loading" />;
}
