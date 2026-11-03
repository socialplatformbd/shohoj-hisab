"use client";

import { Download, ExternalLink, FileUp, MessageCircle, Send, Share2, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useApp } from "@/components/AppProvider";
import { Field, PageHeader } from "@/components/ui";
import {
  BACKUP_FILENAME,
  BackupError,
  backupBlob,
  buildBackup,
  canShareFiles,
  readFileText,
  restoreBackup,
  saveBlob,
  shareBlob,
  validateBackupText,
  type SaveResult,
} from "@/lib/backup";
import { parseTransactionsCsv, transactionsToCsv } from "@/lib/csv";
import { dhakaDateOf, todayDhaka } from "@/lib/dates";
import { db, eraseAllData, newId, setSetting } from "@/lib/db";
import { COMMUNITY_LINKS, APP_VERSION } from "@/lib/links";
import { TX_TYPES, type Theme, type TxType } from "@/lib/types";

const TYPE_LABEL = { income: "typeIncome", expense: "typeExpense", saving: "typeSaving", withdraw: "typeWithdraw" } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { t, settings, updateSetting, data, toast, confirm, lang, digits, date, installEvent, installed, promptInstall, dataReady } = useApp();
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState<TxType>("expense");
  const [catError, setCatError] = useState("");
  const { catName: label } = useApp();

  async function save(key: "language" | "digits" | "theme", value: string) {
    try {
      await updateSetting(key, value);
      toast(t("settingsSaved"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  async function saveName() {
    if (name === null) return;
    try {
      await updateSetting("userName", name.trim().slice(0, 40));
      toast(t("settingsSaved"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  const fmtTs = (ms: number) => {
    const time = new Intl.DateTimeFormat(lang === "bn" ? `bn-BD-u-nu-${digits === "bn" ? "beng" : "latn"}` : "en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
    return `${date(dhakaDateOf(ms))}, ${time}`;
  };

  /* ---------- ব্যাকআপ ---------- */
  async function doBackup(mode: "file" | "share") {
    if (busy) return;
    setBusy(true);
    try {
      const backup = await buildBackup();
      const blob = backupBlob(backup);
      if (blob.size === 0) throw new Error("empty");
      let result: SaveResult;
      if (mode === "share") result = await shareBlob(blob, BACKUP_FILENAME, "application/json");
      else result = await saveBlob(blob, BACKUP_FILENAME, "application/json", "JSON", ".json");
      if (result === "cancelled") {
        toast(t("backupCancelled"), "info");
      } else {
        await setSetting("lastBackupAt", Date.now());
        toast(result === "downloaded" ? t("backupDoneDownload") : t("backupDone"));
      }
    } catch {
      toast(t("backupFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function onRestoreFile(file: File | undefined) {
    if (!file) return;
    if (restoreRef.current) restoreRef.current.value = "";
    setBusy(true);
    try {
      if (file.size > 50 * 1024 * 1024) {
        toast(t("restoreTooBig"), "error");
        return;
      }
      const text = await readFileText(file);
      const parsed = validateBackupText(text);
      const d = parsed.data;
      const when = isNaN(Date.parse(parsed.exportedAt)) ? "—" : fmtTs(Date.parse(parsed.exportedAt));
      const ok = await confirm({
        title: t("restoreConfirmTitle"),
        message: t("restoreConfirmBody", { tx: d.transactions.length, debts: d.debts.length, budgets: d.budgets.length, d: when }),
        confirmText: t("restoreAction"),
      });
      if (!ok) return;
      await restoreBackup(parsed);
      toast(t("restoreDone"));
    } catch (e) {
      if (e instanceof BackupError) toast(e.code === "newer" ? t("restoreNewer") : t("restoreInvalid"), "error");
      else toast(t("restoreFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- CSV ---------- */
  async function exportAllCsv() {
    if (data.transactions.length === 0) return toast(t("csvNothing"), "warn");
    try {
      const blob = new Blob([transactionsToCsv(data.transactions, data.categories)], { type: "text/csv;charset=utf-8" });
      const r = await saveBlob(blob, `shohoj-hisab-transactions-${todayDhaka()}.csv`, "text/csv", "CSV", ".csv");
      if (r !== "cancelled") toast(t("csvExported"));
    } catch {
      toast(t("unexpectedError"), "error");
    }
  }

  async function onCsvFile(file: File | undefined) {
    if (!file) return;
    if (csvRef.current) csvRef.current.value = "";
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("big");
      const text = await file.text();
      const res = parseTransactionsCsv(text, data.categories, Date.now());
      if (res.transactions.length === 0) {
        toast(t("importDone", { ok: 0, bad: res.bad }), "warn");
        return;
      }
      const ok = await confirm({ title: t("confirm"), message: t("importConfirm", { n: res.transactions.length, bad: res.bad }), confirmText: t("confirm"), danger: false });
      if (!ok) return;
      await db.transaction("rw", db.transactions, db.categories, async () => {
        if (res.newCategories.length) await db.categories.bulkAdd(res.newCategories);
        await db.transactions.bulkAdd(res.transactions);
      });
      toast(t("importDone", { ok: res.transactions.length, bad: res.bad }));
    } catch {
      toast(t("importFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- খাত ---------- */
  const custom = data.categories.filter((c) => !c.builtin);

  async function addCategory() {
    const n = catName.trim();
    if (!n) return setCatError(t("errNameRequired"));
    if (n.length > 40) return setCatError(t("errTooLong"));
    if (data.categories.some((c) => c.type === catType && (c.name.toLowerCase() === n.toLowerCase() || c.nameEn?.toLowerCase() === n.toLowerCase()))) return setCatError(t("errDuplicate"));
    setCatError("");
    try {
      await db.categories.add({ id: newId(), type: catType, name: n, builtin: false, createdAt: Date.now() });
      setCatName("");
      toast(t("categoryAdded"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  async function removeCategory(id: string) {
    const used = data.transactions.some((x) => x.categoryId === id) || data.budgets.some((b) => b.categoryId === id);
    if (used) return toast(t("categoryInUse"), "warn");
    if (!(await confirm({ message: t("categoryDeleteConfirm") }))) return;
    try {
      await db.categories.delete(id);
      toast(t("categoryDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  /* ---------- নোটিফিকেশন ---------- */
  async function toggleNotifications() {
    if (settings.budgetNotifications) {
      await updateSetting("budgetNotifications", false);
      return;
    }
    if (typeof Notification === "undefined") return toast(t("notifUnsupported"), "warn");
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      await updateSetting("budgetNotifications", true);
      toast(t("settingsSaved"));
    } else toast(t("notifDenied"), "warn");
  }

  async function eraseAll() {
    const ok = await confirm({ title: t("resetTitle"), message: t("resetBody"), confirmText: t("resetAction") });
    if (!ok) return;
    try {
      await eraseAllData();
      toast(t("resetDone"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  if (!dataReady) return null;

  const notifSupported = typeof Notification !== "undefined";

  return (
    <div className="space-y-4">
      <PageHeader title={t("settings")} />

      <Section title={t("secPreferences")}>
        <Field label={t("userName")}>
          <input className="input" placeholder={t("userNamePlaceholder")} maxLength={40} value={name ?? settings.userName} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
        </Field>
        <Field label={t("language")}>
          <div className="grid grid-cols-2 gap-2">
            {(["bn", "en"] as const).map((l) => (
              <button key={l} className={`chip ${settings.language === l ? "chip-active" : ""}`} onClick={() => save("language", l)}>
                {l === "bn" ? "বাংলা" : "English"}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("numerals")}>
          <div className="grid grid-cols-2 gap-2">
            {(["bn", "en"] as const).map((l) => (
              <button key={l} className={`chip ${settings.digits === l ? "chip-active" : ""}`} onClick={() => save("digits", l)}>
                {l === "bn" ? t("numBn") : t("numEn")}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("theme")}>
          <div className="grid grid-cols-3 gap-2">
            {(["light", "dark", "system"] as Theme[]).map((x) => (
              <button key={x} className={`chip ${settings.theme === x ? "chip-active" : ""}`} onClick={() => save("theme", x)}>
                {x === "light" ? t("themeLight") : x === "dark" ? t("themeDark") : t("themeSystem")}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("currency")}>
          <p className="rounded-xl bg-soft px-3 py-3 text-sm font-medium">{t("currencyValue")}</p>
          <p className="mt-1 text-xs text-muted">{t("currencyNote")}</p>
        </Field>
        <p className="text-xs text-muted">
          {t("timezone")}: Asia/Dhaka (UTC+6)
        </p>
      </Section>

      <Section title={t("secInstall")}>
        {installed ? (
          <p className="text-sm font-semibold text-emerald-700">{t("installed")}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{t("installHint")}</p>
            {installEvent ? (
              <button className="btn btn-primary w-full" onClick={promptInstall}>
                <Download className="h-5 w-5" />
                {t("installApp")}
              </button>
            ) : (
              <p className="rounded-xl bg-soft p-3 text-sm">{t("installManual")}</p>
            )}
          </>
        )}
      </Section>

      <Section title={t("secNotifications")}>
        <p className="text-sm text-muted">{t("notifHint")}</p>
        {!notifSupported ? (
          <p className="text-sm">{t("notifUnsupported")}</p>
        ) : (
          <button className={`btn w-full ${settings.budgetNotifications ? "btn-ghost" : "btn-primary"}`} onClick={toggleNotifications}>
            {settings.budgetNotifications ? t("notifOn") : t("notifEnable")}
          </button>
        )}
      </Section>

      <Section title={t("secCategories")}>
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={catType} onChange={(e) => setCatType(e.target.value as TxType)} aria-label={t("type")}>
            {TX_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(TYPE_LABEL[x])}
              </option>
            ))}
          </select>
          <input className="input" placeholder={t("newCategoryName")} maxLength={40} value={catName} onChange={(e) => setCatName(e.target.value)} />
        </div>
        {catError && <p className="field-error">{catError}</p>}
        <button className="btn btn-ghost w-full" onClick={addCategory}>
          {t("add")}
        </button>
        <h3 className="pt-1 text-sm font-semibold text-muted">{t("customCategories")}</h3>
        {custom.length === 0 ? (
          <p className="text-sm text-muted">{t("noCustomCategories")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {custom.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <span>
                  {label(c)} <span className="text-xs text-muted">({t(TYPE_LABEL[c.type])})</span>
                </span>
                <button className="flex h-11 w-11 items-center justify-center rounded-full text-rose-600 hover:bg-soft" onClick={() => removeCategory(c.id)} aria-label={t("delete")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("secBackup")}>
        <p className="text-sm text-muted">{t("backupHint")}</p>
        <p className="text-xs font-medium">{settings.lastBackupAt ? t("lastBackup", { d: fmtTs(settings.lastBackupAt) }) : t("neverBackedUp")}</p>
        <button className="btn btn-primary w-full" onClick={() => doBackup("file")} disabled={busy}>
          <Download className="h-5 w-5" />
          {t("backupCreate")}
        </button>
        {canShareFiles() && (
          <button className="btn btn-ghost w-full" onClick={() => doBackup("share")} disabled={busy}>
            <Share2 className="h-5 w-5" />
            {t("backupShare")}
          </button>
        )}
        <button className="btn btn-ghost w-full" onClick={() => restoreRef.current?.click()} disabled={busy}>
          <Upload className="h-5 w-5" />
          {t("backupRestore")}
        </button>
        <input ref={restoreRef} type="file" accept=".json,application/json,text/plain" className="hidden" onChange={(e) => onRestoreFile(e.target.files?.[0])} data-testid="restore-input" />
      </Section>

      <Section title={t("secExport")}>
        <p className="text-xs text-muted">{t("importCsvHint")}</p>
        <button className="btn btn-ghost w-full" onClick={exportAllCsv}>
          <Download className="h-5 w-5" />
          {t("exportAllCsv")}
        </button>
        <button className="btn btn-ghost w-full" onClick={() => csvRef.current?.click()} disabled={busy}>
          <FileUp className="h-5 w-5" />
          {t("importCsv")}
        </button>
        <input ref={csvRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => onCsvFile(e.target.files?.[0])} />
      </Section>

      <Section title={t("secPrivacy")}>
        <p className="whitespace-pre-line text-sm leading-relaxed">{t("privacyText")}</p>
      </Section>

      <Section title={t("secAbout")}>
        <p className="text-sm">{t("aboutText")}</p>
        <p className="text-sm text-muted">
          {t("version")}: {APP_VERSION}
        </p>
      </Section>

      <Section title={t("secDeveloper")}>
        <p className="font-semibold">{t("madeBy")}</p>
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted">
            <MessageCircle className="h-4 w-4" />
            {t("whatsappCommunity")}
          </p>
          <a className="flex min-h-11 items-center gap-1 break-all text-sm font-medium text-emerald-700 underline dark:text-emerald-400" href={COMMUNITY_LINKS.whatsapp} target="_blank" rel="noopener noreferrer">
            {COMMUNITY_LINKS.whatsapp}
            <ExternalLink className="h-4 w-4 shrink-0" />
          </a>
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted">
            <Send className="h-4 w-4" />
            {t("telegramChannel")}
          </p>
          <a className="flex min-h-11 items-center gap-1 break-all text-sm font-medium text-emerald-700 underline dark:text-emerald-400" href={COMMUNITY_LINKS.telegram} target="_blank" rel="noopener noreferrer">
            {COMMUNITY_LINKS.telegram}
            <ExternalLink className="h-4 w-4 shrink-0" />
          </a>
        </div>
      </Section>

      <section className="card space-y-2 border-rose-300">
        <h2 className="text-lg font-bold text-rose-600">{t("resetTitle")}</h2>
        <p className="text-sm text-muted">{t("resetBody")}</p>
        <button className="btn btn-danger w-full" onClick={eraseAll}>
          <Trash2 className="h-5 w-5" />
          {t("resetTitle")}
        </button>
      </section>
    </div>
  );
}
