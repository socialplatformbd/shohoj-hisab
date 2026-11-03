"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useApp } from "./AppProvider";
import { useLock } from "./LockGate";
import { Field } from "./ui";
import { db } from "@/lib/db";
import { PIN_RE, hashPin, makeSalt, normalizePin, verifyPin } from "@/lib/pin";

type Mode = "set" | "change" | "remove";

const pinInput = { type: "password", inputMode: "numeric", autoComplete: "off", maxLength: 6 } as const;

export function PinSection() {
  const { t, toast } = useApp();
  const { unlockNow } = useLock();
  const rows = useLiveQuery(() => db.settings.bulkGet(["pinHash", "pinSalt"]), []);
  const [mode, setMode] = useState<Mode | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (rows === undefined) return null;
  const hash = rows[0]?.value;
  const salt = rows[1]?.value;
  const has = typeof hash === "string" && typeof salt === "string";

  function close() {
    setMode(null);
    setCur("");
    setNext("");
    setAgain("");
    setError("");
  }

  async function submit() {
    if (busy || !mode) return;
    setBusy(true);
    try {
      if (mode !== "set") {
        if (typeof hash !== "string" || typeof salt !== "string" || !(await verifyPin(normalizePin(cur), salt, hash))) {
          setError(t("lockWrong"));
          return;
        }
      }
      if (mode === "remove") {
        await db.settings.bulkDelete(["pinHash", "pinSalt"]);
        toast(t("lockRemoved"));
        close();
        return;
      }
      const p = normalizePin(next);
      if (!PIN_RE.test(p)) {
        setError(t("lockPinInvalid"));
        return;
      }
      if (p !== normalizePin(again)) {
        setError(t("lockPinMismatch"));
        return;
      }
      const s = makeSalt();
      const h = await hashPin(p, s);
      unlockNow(); // লক চালু হওয়ার মুহূর্তে নিজেকেই যেন লক না করে দেয়
      await db.settings.bulkPut([
        { key: "pinSalt", value: s },
        { key: "pinHash", value: h },
      ]);
      toast(t(mode === "set" ? "lockSaved" : "lockChanged"));
      close();
    } catch {
      toast(t("dbError"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold">{t("lockSection")}</h2>
      <p className="text-sm text-muted">{t("lockHint")}</p>
      <p className="text-sm font-medium">{has ? t("lockStatusOn") : t("lockStatusOff")}</p>

      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          {has ? (
            <>
              <button className="btn btn-ghost flex-1" onClick={() => setMode("change")}>
                {t("lockChange")}
              </button>
              <button className="btn btn-ghost flex-1" onClick={() => setMode("remove")}>
                {t("lockRemove")}
              </button>
            </>
          ) : (
            <button className="btn btn-primary w-full" onClick={() => setMode("set")}>
              {t("lockSet")}
            </button>
          )}
        </div>
      ) : (
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode !== "set" && (
            <Field label={t("lockCurrent")}>
              <input className="input" {...pinInput} value={cur} onChange={(e) => setCur(e.target.value)} />
            </Field>
          )}
          {mode !== "remove" && (
            <>
              <Field label={t("lockNew")}>
                <input className="input" {...pinInput} value={next} onChange={(e) => setNext(e.target.value)} />
              </Field>
              <Field label={t("lockConfirmPin")}>
                <input className="input" {...pinInput} value={again} onChange={(e) => setAgain(e.target.value)} />
              </Field>
            </>
          )}
          {error && (
            <p className="text-sm font-medium text-rose-600" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={close}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
              {t("save")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
