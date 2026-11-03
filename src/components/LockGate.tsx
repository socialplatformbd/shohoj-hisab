"use client";

import { Lock } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "./AppProvider";
import { Logo } from "./Logo";
import { Spinner } from "./ui";
import { db, eraseAllData } from "@/lib/db";
import { normalizePin, verifyPin } from "@/lib/pin";

/** এত সময়ের বেশি অ্যাপ থেকে বাইরে থাকলে আবার পিন চাওয়া হয় */
const RELOCK_AFTER_MS = 60_000;
const MAX_TRIES = 5;
const COOLDOWN_S = 30;

const LockContext = createContext<{ unlockNow: () => void }>({ unlockNow: () => {} });
export function useLock() {
  return useContext(LockContext);
}

export function LockGate({ children }: { children: ReactNode }) {
  const rows = useLiveQuery(() => db.settings.bulkGet(["pinHash", "pinSalt"]), []);
  const [unlocked, setUnlocked] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current !== null) {
        if (Date.now() - hiddenAt.current > RELOCK_AFTER_MS) setUnlocked(false);
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (rows === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }
  const hash = rows[0]?.value;
  const salt = rows[1]?.value;
  if (typeof hash === "string" && typeof salt === "string" && !unlocked) {
    return <LockScreen hash={hash} salt={salt} onUnlock={() => setUnlocked(true)} />;
  }
  return <LockContext.Provider value={{ unlockNow: () => setUnlocked(true) }}>{children}</LockContext.Provider>;
}

function LockScreen({ hash, salt, onUnlock }: { hash: string; salt: string; onUnlock: () => void }) {
  const { t, confirm, toast } = useApp();
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const [fails, setFails] = useState(0);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function submit() {
    if (busy || wait > 0) return;
    setBusy(true);
    try {
      if (await verifyPin(normalizePin(pin), salt, hash)) {
        onUnlock();
        return;
      }
      setWrong(true);
      setPin("");
      const f = fails + 1;
      if (f >= MAX_TRIES) {
        setFails(0);
        setWait(COOLDOWN_S);
      } else {
        setFails(f);
      }
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!(await confirm({ message: t("lockForgotConfirm"), danger: true, confirmText: t("resetTitle") }))) return;
    try {
      await eraseAllData();
      await db.settings.bulkDelete(["pinHash", "pinSalt"]);
      onUnlock();
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-card px-6 text-center">
      <Logo size={72} />
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Lock className="h-5 w-5" />
        {t("lockTitle")}
      </h1>
      <form
        className="w-full max-w-xs space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="input text-center text-2xl tracking-[0.5em]"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setWrong(false);
          }}
          placeholder="••••"
          aria-label={t("lockEnterPin")}
          autoFocus
        />
        {wait > 0 ? (
          <p className="text-sm font-medium text-rose-600" role="alert">
            {t("lockWait", { s: wait })}
          </p>
        ) : (
          wrong && (
            <p className="text-sm font-medium text-rose-600" role="alert">
              {t("lockWrong")}
            </p>
          )
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || wait > 0 || pin.length < 4}>
          {t("lockUnlock")}
        </button>
      </form>
      <button className="min-h-11 text-sm text-muted underline" onClick={() => void forgot()}>
        {t("lockForgot")}
      </button>
    </div>
  );
}
