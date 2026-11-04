"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { Field, Sheet } from "./ui";
import { DecryptError, decryptText } from "@/lib/cryptoBackup";

/** এনক্রিপ্টেড ব্যাকআপ রিস্টোরের আগে পাসওয়ার্ড চায়; সফল হলে আসল (ডিক্রিপ্ট করা) টেক্সট ফেরত দেয় */
export function DecryptSheet({ text, onClose, onDone }: { text: string; onClose: () => void; onDone: (plain: string) => void }) {
  const { t } = useApp();
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || !pw) return;
    setBusy(true);
    setError("");
    try {
      onDone(await decryptText(text, pw));
    } catch (e) {
      setError(e instanceof DecryptError && e.code === "unsupported" ? t("encUnsupported") : t("encWrongPassword"));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("encDecryptTitle")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-muted">{t("encDecryptHint")}</p>
        <Field label={t("encPassword")} error={error}>
          <input className="input" type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !pw}>
          {t("encOpen")}
        </button>
      </form>
    </Sheet>
  );
}
