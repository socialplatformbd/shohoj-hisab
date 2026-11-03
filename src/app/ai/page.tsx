"use client";

import { Bot, Loader2, Plus, Send, Sparkles, Trash2, WifiOff } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { PageHeader } from "@/components/ui";
import { useBudgetAlerts } from "@/components/useBudgetAlerts";
import { ExtractResponseSchema } from "@/lib/aiSchema";
import { isValidIsoDate, monthKey, todayDhaka } from "@/lib/dates";
import { db, newId } from "@/lib/db";
import { buildFacts, localAnswer, monthSummary, todaySummary } from "@/lib/insights";
import { parseLocalText, suggestCategoryId, type ExtractedRow } from "@/lib/localParser";
import { applyDigits, numberToPaisa, parseAmountToPaisa, paisaToDecimalString } from "@/lib/money";
import type { Transaction } from "@/lib/types";

interface Draft {
  key: string;
  type: "income" | "expense";
  title: string;
  amountText: string;
  categoryId: string;
  date: string;
}

type AiFail = "offline" | "not_configured" | "unavailable";

async function callAi<T>(body: unknown): Promise<{ ok: true; data: T } | { ok: false; reason: AiFail }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, reason: "offline" };
  // AbortSignal.timeout পুরনো ফোনের ব্রাউজারে নেই (ছুঁড়লে AI কখনোই চলত না) — তাই AbortController
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (res.status === 503) return { ok: false, reason: "not_configured" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

function toDraft(r: ExtractedRow): Draft {
  return { key: newId(), type: r.type, title: r.title, amountText: paisaToDecimalString(r.amount).replace(/\.00$/, ""), categoryId: r.categoryId, date: r.date };
}

type ChatMsg = { id: string; role: "user" | "assistant"; text: string; source?: "ai" | "local"; notice?: string };

export default function AiPage() {
  const { t, online, dataReady } = useApp();
  const [tab, setTab] = useState<"entry" | "ask">("entry");
  if (!dataReady) return null;
  return (
    <div className="space-y-4">
      <PageHeader title={t("aiTitle")} />
      {!online && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900" role="status">
          <WifiOff className="h-4 w-4 shrink-0" />
          {t("offlineAi")}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-soft p-1" role="tablist">
        {(
          [
            ["entry", t("aiTabEntry")],
            ["ask", t("aiTabAsk")],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-11 rounded-xl text-sm font-semibold ${tab === k ? "bg-card shadow-sm" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "entry" ? <EntryTab /> : <AskTab />}
      <p className="text-xs text-muted">🔒 {t("aiPrivacy")}</p>
    </div>
  );
}

/* ---------------- লেনদেন লিখে যোগ ---------------- */

function EntryTab() {
  const { t, data, catName, money, toast, confirm } = useApp();
  const checkBudgets = useBudgetAlerts();
  const today = todayDhaka();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [source, setSource] = useState<{ kind: "ai" | "local"; reason?: AiFail } | null>(null);

  async function extract() {
    if (!text.trim()) return toast(t("aiNeedText"), "warn");
    setBusy(true);
    setRows(null);
    try {
      const res = await callAi<unknown>({
        mode: "extract",
        text: text.trim(),
        today,
        categories: data.categories.filter((c) => c.type === "income" || c.type === "expense").map((c) => ({ id: c.id, type: c.type, name: c.name })),
      });
      let drafts: Draft[] | null = null;
      if (res.ok) {
        const parsed = ExtractResponseSchema.safeParse(res.data);
        if (parsed.success) {
          const out: ExtractedRow[] = [];
          for (const it of parsed.data.items) {
            const amount = numberToPaisa(it.amount);
            if (amount === null) continue;
            const valid = data.categories.some((c) => c.id === it.categoryId && c.type === it.type);
            out.push({
              type: it.type,
              title: it.title,
              amount,
              categoryId: valid && it.categoryId ? it.categoryId : suggestCategoryId(it.title, it.type, data.categories),
              date: it.date && isValidIsoDate(it.date) ? it.date : today,
            });
          }
          drafts = out.map(toDraft);
          setSource({ kind: "ai" });
        }
      }
      if (!drafts) {
        const reason: AiFail = res.ok ? "unavailable" : res.reason;
        drafts = parseLocalText(text, data.categories, today).map(toDraft);
        setSource({ kind: "local", reason });
      }
      if (drafts.length === 0) toast(t("aiNothingFound"), "warn");
      setRows(drafts);
    } catch {
      toast(t("unexpectedError"), "error");
    } finally {
      setBusy(false);
    }
  }

  const update = (key: string, patch: Partial<Draft>) => setRows((r) => r && r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const totals = useMemo(() => {
    let expense = 0;
    let income = 0;
    for (const r of rows ?? []) {
      const p = parseAmountToPaisa(r.amountText);
      if (p === null) continue;
      if (r.type === "expense") expense += p;
      else income += p;
    }
    return { expense, income };
  }, [rows]);

  async function saveAll() {
    if (!rows || rows.length === 0 || saving) return;
    const valid = rows.every((r) => r.title.trim() && r.title.length <= 80 && parseAmountToPaisa(r.amountText) !== null && isValidIsoDate(r.date));
    if (!valid) return toast(t("aiRowInvalid"), "error");
    const ok = await confirm({
      title: t("confirm"),
      message: t("aiConfirmSave", { n: rows.length, e: money(totals.expense), i: money(totals.income) }),
      confirmText: t("aiSaveAll"),
      danger: false,
    });
    if (!ok) return;
    setSaving(true);
    try {
      const now = Date.now();
      const txs: Transaction[] = rows.map((r) => ({
        id: newId(),
        type: r.type,
        amount: parseAmountToPaisa(r.amountText) as number,
        categoryId: data.categories.some((c) => c.id === r.categoryId && c.type === r.type) ? r.categoryId : suggestCategoryId(r.title, r.type, data.categories),
        date: r.date,
        description: r.title.trim(),
        createdAt: now,
        updatedAt: now,
      }));
      // শুধু এখানে, ব্যবহারকারীর নিশ্চিতকরণের পরেই ডেটাবেসে লেখা হয় (AI সরাসরি লেখে না)
      await db.transactions.bulkAdd(txs);
      toast(t("aiSavedN", { n: txs.length }));
      checkBudgets(data.transactions, [...data.transactions, ...txs], txs.filter((x) => x.type === "expense").map((x) => monthKey(x.date)));
      setRows(null);
      setText("");
      setSource(null);
    } catch {
      toast(t("dbError"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="text-sm text-muted">{t("aiEntryHint")}</p>
        <textarea className="input min-h-32" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder={t("aiEntryPlaceholder")} />
        <button className="btn btn-primary w-full" onClick={extract} disabled={busy}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          {busy ? t("aiExtracting") : t("aiExtract")}
        </button>
      </div>

      {rows && (
        <div className="card space-y-3">
          <div>
            <h2 className="font-bold">{t("aiPreview")}</h2>
            <p className="text-xs text-muted">{t("aiPreviewNote")}</p>
            {source && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${source.kind === "ai" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
                {source.kind === "ai" ? t("aiSourceAi") : `${source.reason === "not_configured" ? t("aiNotConfigured") : source.reason === "offline" ? t("offlineAi") : t("aiUnavailable")} ${t("aiSourceLocal")}`}
              </p>
            )}
          </div>

          {rows.length === 0 && <p className="text-sm text-muted">{t("aiNothingFound")}</p>}

          {rows.map((r) => (
            <div key={r.key} className="space-y-2 rounded-xl border border-line p-3">
              <div className="flex gap-2">
                <input className="input" aria-label={t("aiTitleLabel")} value={r.title} maxLength={80} onChange={(e) => update(r.key, { title: e.target.value })} />
                <button className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-rose-600 hover:bg-soft" onClick={() => setRows((l) => l && l.filter((x) => x.key !== r.key))} aria-label={t("aiRemoveRow")}>
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={`input font-bold ${parseAmountToPaisa(r.amountText) === null ? "border-rose-500" : ""}`}
                  inputMode="decimal"
                  aria-label={t("amount")}
                  value={r.amountText}
                  onChange={(e) => update(r.key, { amountText: e.target.value })}
                />
                <select
                  className="input"
                  aria-label={t("type")}
                  value={r.type}
                  onChange={(e) => {
                    const type = e.target.value as "income" | "expense";
                    update(r.key, { type, categoryId: suggestCategoryId(r.title, type, data.categories) });
                  }}
                >
                  <option value="expense">{t("typeExpense")}</option>
                  <option value="income">{t("typeIncome")}</option>
                </select>
                <select className="input" aria-label={t("category")} value={r.categoryId} onChange={(e) => update(r.key, { categoryId: e.target.value })}>
                  {data.categories
                    .filter((c) => c.type === r.type)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {catName(c)}
                      </option>
                    ))}
                </select>
                <input type="date" className="input" aria-label={t("date")} value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} />
              </div>
              <p className="text-right text-sm font-semibold">
                {r.title || "—"}: {parseAmountToPaisa(r.amountText) !== null ? money(parseAmountToPaisa(r.amountText) as number) : "?"}
              </p>
            </div>
          ))}

          <button
            className="btn btn-ghost w-full"
            onClick={() => setRows((l) => [...(l ?? []), { key: newId(), type: "expense", title: "", amountText: "", categoryId: suggestCategoryId("", "expense", data.categories), date: today }])}
          >
            <Plus className="h-4 w-4" />
            {t("aiAddRow")}
          </button>

          <div className="rounded-xl bg-soft p-3 text-sm">
            {totals.expense > 0 && (
              <p className="flex justify-between">
                <span>{t("aiTotalExpense")}</span>
                <b className="text-rose-600">{money(totals.expense)}</b>
              </p>
            )}
            {totals.income > 0 && (
              <p className="flex justify-between">
                <span>{t("aiTotalIncome")}</span>
                <b className="text-emerald-600">{money(totals.income)}</b>
              </p>
            )}
          </div>

          <button className="btn btn-primary w-full" onClick={saveAll} disabled={saving || rows.length === 0}>
            {t("aiSaveAll")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- প্রশ্ন করুন ---------------- */

function AskTab() {
  const { t, data, lang, digits } = useApp();
  const today = todayDhaka();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const push = (m: Omit<ChatMsg, "id">) => {
    setMsgs((l) => [...l, { ...m, id: newId() }]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
  };

  async function ask(question: string, opts?: { local?: () => string }) {
    const text = question.trim();
    if (!text || busy) return;
    push({ role: "user", text });
    setQ("");
    if (opts?.local) {
      push({ role: "assistant", text: opts.local(), source: "local" });
      return;
    }
    setBusy(true);
    try {
      const res = await callAi<{ answer?: string }>({ mode: "chat", question: text, facts: buildFacts(data, today, lang, digits), lang });
      if (res.ok && typeof res.data.answer === "string" && res.data.answer.trim()) {
        push({ role: "assistant", text: res.data.answer, source: "ai" });
      } else {
        const reason: AiFail = res.ok ? "unavailable" : res.reason;
        const notice = reason === "offline" ? t("offlineAi") : reason === "not_configured" ? t("aiNotConfigured") : t("aiUnavailable");
        const local = localAnswer(text, data, today, lang, digits);
        push({ role: "assistant", text: local ?? t("aiCannotAnswerLocal"), source: "local", notice });
      }
    } finally {
      setBusy(false);
    }
  }

  const chips: { label: string; run: () => void }[] = [
    { label: t("aiQuickToday"), run: () => ask(t("aiQuickToday"), { local: () => todaySummary(data, today, lang, digits) }) },
    { label: t("aiQuickMonth"), run: () => ask(t("aiQuickMonth"), { local: () => monthSummary(data, today, lang, digits) }) },
    { label: t("aiQuickTop"), run: () => ask(lang === "bn" ? "এই মাসে আমার সবচেয়ে বেশি খরচ কোন খাতে হয়েছে?" : "Which category had my highest spending this month?") },
    { label: t("aiQuickAnalysis"), run: () => ask(lang === "bn" ? "আমার এই মাসের খরচ বিশ্লেষণ করো এবং কোথায় খরচ কমানো যায় বলো।" : "Analyse my spending this month and tell me where I can cut back.") },
    { label: t("aiQuickBudget"), run: () => ask(lang === "bn" ? "আমার খরচের ধরন দেখে আগামী মাসের জন্য বাজেট পরামর্শ দাও।" : "Suggest budgets for next month based on my spending pattern.") },
  ];

  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {chips.map((c) => (
          <button key={c.label} className="chip" onClick={c.run} disabled={busy}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-3" aria-live="polite">
        {msgs.length === 0 && (
          <div className="card flex flex-col items-center gap-2 py-8 text-center">
            <Bot className="h-10 w-10 text-emerald-600" />
            <p className="text-sm text-muted">{t("aiAskPlaceholder")}</p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-emerald-700 text-white" : "border border-line bg-card"}`}>
              {m.notice && <p className="mb-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">{m.notice}</p>}
              <p className="whitespace-pre-line">{applyDigits(m.text, digits)}</p>
              {m.role === "assistant" && m.source && <p className="mt-1.5 text-[11px] text-muted">{m.source === "ai" ? t("aiAnswerSourceAi") : t("aiAnswerSourceLocal")}</p>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("aiThinking")}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <input className="input" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder={t("aiAskPlaceholder")} aria-label={t("aiAsk")} />
        <button type="submit" className="btn btn-primary shrink-0 px-4" disabled={busy || !q.trim()} aria-label={t("aiAsk")}>
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
