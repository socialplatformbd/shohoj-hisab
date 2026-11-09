"use client";

import { Banknote, BarChart3, Bot, CalendarDays, Home, ListChecks, MoreHorizontal, Package, Plus, Receipt, Store, Users, Utensils, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "./AppProvider";
import { LockGate } from "./LockGate";
import { Logo } from "./Logo";
import { useTxForm } from "./TransactionForm";
import { Spinner } from "./ui";
import { todayDhaka } from "@/lib/dates";
import { generateRecurring } from "@/lib/recurring";
import { Welcome } from "./Welcome";

const MORE_PATHS = ["/more", "/budgets", "/debts", "/accounts", "/recurring", "/reimbursements", "/settings"];

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, dbError, settings, t, online, toast } = useApp();
  const pathname = usePathname();
  const router = useRouter();
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

  // নিয়মিত লেনদেন: অ্যাপ খুললে ও আবার সামনে এলে বাকি থাকা লেনদেন যোগ করে (একই লেনদেন দুইবার তৈরি হয় না)
  const welcomeDone = settings.welcomeDone;
  useEffect(() => {
    if (!ready || !welcomeDone) return;
    let cancelled = false;
    const run = () => {
      generateRecurring(todayDhaka())
        .then((n) => {
          if (n > 0 && !cancelled) toast(t("recurringAutoAdded", { n }));
        })
        .catch(() => {
          /* ব্যর্থ হলে পরের বার আবার চেষ্টা হবে */
        });
    };
    run();
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ready, welcomeDone, toast, t]);

  // মোড অনুযায়ী পেজ: মেস মোডে মেসের পেজ (+ আরও/সেটিংস), ব্যক্তিগত মোডে মেসের পেজ নয়
  const mode = settings.mode;
  useEffect(() => {
    if (!ready || !welcomeDone) return;
    // প্রতিটি মোডের নিজের পেজ; "/more" ও "/settings" সব মোডে চলে
    const shared = pathname === "/more" || pathname === "/settings";
    const inMess = pathname.startsWith("/mess");
    const inShop = pathname.startsWith("/shop");
    if (mode === "mess" && !inMess && !shared) router.replace("/mess");
    else if (mode === "shop" && !inShop && !shared) router.replace("/shop");
    else if (mode === "personal" && (inMess || inShop)) router.replace("/");
  }, [ready, welcomeDone, mode, pathname, router]);

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

  const messNav = [
    { href: "/mess", label: t("messHome"), icon: Utensils, active: pathname === "/mess" },
    { href: "/mess/meals", label: t("messMeals"), icon: CalendarDays, active: pathname.startsWith("/mess/meals") },
    { href: "/mess/entries", label: t("messMoney"), icon: Banknote, active: pathname.startsWith("/mess/entries") },
    { href: "/mess/members", label: t("messMembers"), icon: Users, active: pathname.startsWith("/mess/members") },
    { href: "/more", label: t("navMore"), icon: MoreHorizontal, active: pathname === "/more" || pathname.startsWith("/settings") },
  ];
  const shopNav = [
    { href: "/shop", label: t("shopHome"), icon: Store, active: pathname === "/shop" },
    { href: "/shop/entries", label: t("shopBook"), icon: Receipt, active: pathname.startsWith("/shop/entries") },
    { href: "/shop/products", label: t("shopProducts"), icon: Package, active: pathname.startsWith("/shop/products") },
    { href: "/shop/parties", label: t("shopParties"), icon: Users, active: pathname.startsWith("/shop/parties") },
    { href: "/more", label: t("navMore"), icon: MoreHorizontal, active: pathname === "/more" || pathname.startsWith("/settings") },
  ];
  const personalNav = [
    { href: "/", label: t("navHome"), icon: Home, active: pathname === "/" },
    { href: "/transactions", label: t("navTransactions"), icon: ListChecks, active: pathname.startsWith("/transactions") },
    { href: "/ai", label: t("navAi"), icon: Bot, active: pathname.startsWith("/ai") },
    { href: "/reports", label: t("navReports"), icon: BarChart3, active: pathname.startsWith("/reports") },
    { href: "/more", label: t("navMore"), icon: MoreHorizontal, active: MORE_PATHS.some((p) => pathname.startsWith(p)) },
  ];
  const nav = mode === "mess" ? messNav : mode === "shop" ? shopNav : personalNav;
  const showFab = mode === "personal" && (pathname === "/" || pathname.startsWith("/transactions"));

  return (
    <LockGate>
    <div className="mx-auto min-h-dvh w-full max-w-2xl">
      <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <Logo size={36} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400">
              {t("appName")}
              {mode !== "personal" && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 align-middle text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">{mode === "mess" ? t("modeMess") : t("modeShop")}</span>}
            </p>
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
        <ul className="mx-auto grid max-w-2xl pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
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
    </LockGate>
  );
}
