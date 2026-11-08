"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BN_MONTHS, BN_MONTHS_SHORT, BN_WEEKDAYS, EN_MONTHS, EN_MONTHS_SHORT, EN_WEEKDAYS, normalizeStartDay, weekdayIndex } from "@/lib/dates";
import { db, setSetting } from "@/lib/db";
import type { DataBundle } from "@/lib/insights";
import type { Account, AppMode, MessEntry, MessMeal, MessMember, Transfer } from "@/lib/types";
import { translate, type TKey } from "@/lib/i18n";
import { applyDigits, formatMoney } from "@/lib/money";
import type { Category, Digits, Lang, SettingRow, Theme } from "@/lib/types";

/* ---------------- সেটিংস ও ভাষা ---------------- */

export interface Settings {
  userName: string;
  language: Lang;
  digits: Digits;
  theme: Theme;
  welcomeDone: boolean;
  budgetNotifications: boolean;
  lastBackupAt: number | null;
  /** মাস কোন তারিখ থেকে শুরু (১ = সাধারণ ক্যালেন্ডার মাস; বেতনের তারিখ হলে ২–২৮) */
  monthStartDay: number;
  /** চলতি মোড: ব্যক্তিগত (ডিফল্ট) বা মেস */
  mode: AppMode;
}

type ToastKind = "success" | "error" | "warn" | "info";

interface AppCtx {
  ready: boolean;
  dbError: boolean;
  settings: Settings;
  updateSetting: (key: keyof Settings, value: SettingRow["value"]) => Promise<void>;
  lang: Lang;
  digits: Digits;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  money: (paisa: number, withFraction?: boolean) => string;
  num: (n: number | string) => string;
  date: (iso: string, withWeekday?: boolean) => string;
  shortDate: (iso: string) => string;
  monthLabel: (key: string) => string;
  monthShort: (key: string) => string;
  catName: (c: Category | undefined) => string;
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (opts: { title?: string; message: string; confirmText?: string; danger?: boolean }) => Promise<boolean>;
  data: AppData;
  dataReady: boolean;
  online: boolean;
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  promptInstall: () => Promise<void>;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("AppProvider missing");
  return c;
}

/** অ্যাপের সব ডেটা (AI-র DataBundle + অ্যাকাউন্ট ও ট্রান্সফার) */
export type AppData = DataBundle & { accounts: Account[]; transfers: Transfer[]; messMembers: MessMember[]; messMeals: MessMeal[]; messEntries: MessEntry[] };
const EMPTY: AppData = { transactions: [], categories: [], budgets: [], debts: [], repayments: [], accounts: [], transfers: [], messMembers: [], messMeals: [], messEntries: [] };

const TOAST_ICON = { success: CheckCircle2, error: XCircle, warn: AlertTriangle, info: Info };
const TOAST_STYLE: Record<ToastKind, string> = {
  success: "bg-emerald-600 text-white",
  error: "bg-rose-600 text-white",
  warn: "bg-amber-500 text-black",
  info: "bg-slate-800 text-white",
};

interface ConfirmState {
  title?: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [dbError, setDbError] = useState(false);
  const settingRows = useLiveQuery(() => db.settings.toArray(), []);
  const data = useLiveQuery(async () => {
    const [transactions, categories, budgets, debts, repayments, accounts, transfers, messMembers, messMeals, messEntries] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      db.budgets.toArray(),
      db.debts.toArray(),
      db.repayments.toArray(),
      db.accounts.toArray(),
      db.transfers.toArray(),
      db.messMembers.toArray(),
      db.messMeals.toArray(),
      db.messEntries.toArray(),
    ]);
    return { transactions, categories, budgets, debts, repayments, accounts, transfers, messMembers, messMeals, messEntries } satisfies AppData;
  }, []);

  useEffect(() => {
    db.open().catch(() => setDbError(true));
  }, []);

  const settings: Settings = useMemo(() => {
    const m = new Map<string, SettingRow["value"]>((settingRows ?? []).map((r) => [r.key, r.value]));
    const language: Lang = m.get("language") === "en" ? "en" : "bn";
    const d = m.get("digits");
    return {
      userName: typeof m.get("userName") === "string" ? (m.get("userName") as string) : "",
      language,
      digits: d === "en" || d === "bn" ? d : language === "en" ? "en" : "bn",
      theme: (["light", "dark", "system"] as const).find((x) => x === m.get("theme")) ?? "light",
      welcomeDone: m.get("welcomeDone") === true,
      budgetNotifications: m.get("budgetNotifications") === true,
      lastBackupAt: typeof m.get("lastBackupAt") === "number" ? (m.get("lastBackupAt") as number) : null,
      monthStartDay: normalizeStartDay(m.get("monthStartDay")),
      mode: m.get("mode") === "mess" ? "mess" : "personal",
    };
  }, [settingRows]);

  const { language: lang, digits } = settings;

  // থিম
  useEffect(() => {
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f172a" : "#047857");
    };
    apply();
    if (settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.lang = lang === "bn" ? "bn" : "en";
  }, [lang]);

  const t = useCallback((key: TKey, vars?: Record<string, string | number>) => {
    const v: Record<string, string | number> | undefined = vars
      ? Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, typeof x === "number" ? applyDigits(String(x), digits) : applyDigits(String(x), digits)]))
      : undefined;
    return translate(lang, key, v);
  }, [lang, digits]);

  const money = useCallback((p: number, f = true) => formatMoney(p, digits, f), [digits]);
  const num = useCallback((n: number | string) => applyDigits(String(n), digits), [digits]);
  const date = useCallback(
    (iso: string, withWeekday = false) => {
      const [y, m, d] = iso.split("-").map(Number);
      const months = lang === "bn" ? BN_MONTHS : EN_MONTHS;
      const wd = (lang === "bn" ? BN_WEEKDAYS : EN_WEEKDAYS)[weekdayIndex(iso)];
      return applyDigits(`${withWeekday ? wd + ", " : ""}${d} ${months[m - 1]} ${y}`, digits);
    },
    [lang, digits],
  );
  const shortDate = useCallback(
    (iso: string) => {
      const [, m, d] = iso.split("-").map(Number);
      const months = lang === "bn" ? BN_MONTHS_SHORT : EN_MONTHS_SHORT;
      return applyDigits(`${d} ${months[m - 1]}`, digits);
    },
    [lang, digits],
  );
  const monthLabel = useCallback(
    (key: string) => {
      const [y, m] = key.split("-").map(Number);
      return applyDigits(`${(lang === "bn" ? BN_MONTHS : EN_MONTHS)[m - 1]} ${y}`, digits);
    },
    [lang, digits],
  );
  const monthShort = useCallback(
    (key: string) => {
      const m = Number(key.split("-")[1]);
      return (lang === "bn" ? BN_MONTHS_SHORT : EN_MONTHS_SHORT)[m - 1] ?? key;
    },
    [lang],
  );
  const catName = useCallback((c: Category | undefined) => (!c ? "—" : lang === "en" && c.nameEn ? c.nameEn : c.name), [lang]);

  const updateSetting = useCallback(async (key: keyof Settings, value: SettingRow["value"]) => {
    await setSetting(key, value);
  }, []);

  /* ---------- টোস্ট ও কনফার্ম ---------- */
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: ToastKind }[]>([]);
  const toastId = useRef(0);
  const toast = useCallback((text: string, kind: ToastKind = "success") => {
    const id = ++toastId.current;
    setToasts((l) => [...l.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), kind === "error" ? 6000 : 4000);
  }, []);

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const confirm = useCallback(
    (opts: { title?: string; message: string; confirmText?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  );
  const closeConfirm = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  /* ---------- অনলাইন অবস্থা ও ইনস্টল ---------- */
  const [online, setOnline] = useState(true);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const promptInstall = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }, [installEvent]);

  const value: AppCtx = {
    ready: settingRows !== undefined,
    dbError,
    settings,
    updateSetting,
    lang,
    digits,
    t,
    money,
    num,
    date,
    shortDate,
    monthLabel,
    monthShort,
    catName,
    toast,
    confirm,
    data: data ?? EMPTY,
    dataReady: data !== undefined,
    online,
    installEvent,
    installed,
    promptInstall,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((x) => {
          const Icon = TOAST_ICON[x.kind];
          return (
            <div key={x.id} className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ${TOAST_STYLE[x.kind]}`} role="status">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="flex-1 whitespace-pre-line">{x.text}</span>
              <button aria-label={t("close")} onClick={() => setToasts((l) => l.filter((y) => y.id !== x.id))}>
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      {confirmState && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
            <h2 className="text-lg font-bold">{confirmState.title ?? t("confirmDeleteTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{confirmState.message}</p>
            <div className="mt-5 flex gap-3">
              <button className="btn btn-ghost flex-1" onClick={() => closeConfirm(false)}>
                {t("cancel")}
              </button>
              <button className={`btn flex-1 ${confirmState.danger === false ? "btn-primary" : "btn-danger"}`} onClick={() => closeConfirm(true)} autoFocus>
                {confirmState.confirmText ?? t("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
