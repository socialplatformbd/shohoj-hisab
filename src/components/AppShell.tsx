"use client";

import { BarChart3, Bot, Home, ListChecks, MoreHorizontal, Plus, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "./AppProvider";
import { Logo } from "./Logo";
import { useTxForm } from "./TransactionForm";
import { Spinner } from "./ui";
import { Welcome } from "./Welcome";

const MORE_PATHS = ["/more", "/budgets", "/debts", "/settings"];

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, dbError, settings, t, online } = useApp();
  const pathname = usePathname();
  const form = useTxForm();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Service Worker (শুধু প্রোডাকশনে) — অফলাইন চালানোর জন্য
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* নিবন্ধন ব্যর্থ হলেও অ্যাপ স্বাভাবিক চলবে */
    });
  }, []);

  if (!mounted || (!ready && !dbError)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <Logo size={88} />
        <Spinner />
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <Logo size={72} />
        <h1 className="text-xl font-bold">{t("dbError")}</h1>
        <p className="text-sm text-muted">
          {settings.language === "bn"
            ? "ব্রাউজারের প্রাইভেট মোড বন্ধ করে বা স্টোরেজের অনুমতি দিয়ে আবার চেষ্টা করুন।"
            : "Turn off private mode or allow storage, then try again."}
        </p>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          {t("loading").replace("...", "")} ↻
        </button>
      </div>
    );
  }

  if (!settings.welcomeDone) return <Welcome />;

  const nav = [
    { href: "/", label: t("navHome"), icon: Home, active: pathname === "/" },
    { href: "/transactions", label: t("navTransactions"), icon: ListChecks, active: pathname.startsWith("/transactions") },
    { href: "/ai", label: t("navAi"), icon: Bot, active: pathname.startsWith("/ai") },
    { href: "/reports", label: t("navReports"), icon: BarChart3, active: pathname.startsWith("/reports") },
    { href: "/more", label: t("navMore"), icon: MoreHorizontal, active: MORE_PATHS.some((p) => pathname.startsWith(p)) },
  ];
  const showFab = pathname === "/" || pathname.startsWith("/transactions");

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl">
      <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <Logo size={36} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400">{t("appName")}</p>
            {settings.userName && (
              <p className="truncate text-xs text-muted">
                {t("hello")}, {settings.userName}
              </p>
            )}
          </div>
        </div>
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900" role="status">
            <WifiOff className="h-4 w-4" />
            {t("offlineBanner")}
          </div>
        )}
      </header>

      <main className="px-4 pb-32 pt-4">{children}</main>

      {showFab && (
        <button
          onClick={() => form.open()}
          aria-label={t("addTransaction")}
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg active:scale-95 sm:right-[max(1rem,calc(50%-19rem))]"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur" aria-label="main">
        <ul className="mx-auto grid max-w-2xl grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {nav.map((n) => (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={n.active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${n.active ? "text-emerald-700 dark:text-emerald-400" : "text-muted"}`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full ${n.active ? "bg-emerald-100 dark:bg-emerald-900/40" : ""}`}>
                  <n.icon className="h-5 w-5" />
                </span>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
