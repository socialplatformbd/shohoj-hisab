"use client";

import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Banknote } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { LabelChips, savedLabels } from "@/components/LabelChips";
import { EmptyState, Field, PageHeader, Sheet } from "@/components/ui";
import { addMonths, isValidIsoDate, monthKey, todayDhaka } from "@/lib/dates";
import { db, newId } from "@/lib/db";
import { formatPlainPaisa, parseAmountToPaisa } from "@/lib/money";
import { MESS_ENTRY_KINDS, type MessEntry, type MessEntryKind } from "@/lib/types";

const KIND_LABEL = { bazaar: "messKindBazaar", deposit: "messKindDeposit", shared: "messKindShared" } as const;
type Filter = "all" | MessEntryKind;

export default function MessEntriesPage() {
  const { t, data, money, date, monthLabel, toast, confirm, dataReady } = useApp();
  const [month, setMonth] = useState(monthKey(todayDhaka()));
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ entry?: MessEntry } | null>(null);

  const nameOf = useMemo(() => new Map(data.messMembers.map((m) => [m.id, m.name])), [data.messMembers]);
  const list = useMemo(
    () =>
      data.messEntries
        .filter((e) => e.date.slice(0, 7) === month && (filter === "all" || e.kind === filter))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)),
    [data.messEntries, month, filter],
  );
  const total = list.reduce((s, e) => s + e.amount, 0);

  if (!dataReady) return null;

  async function remove(e: MessEntry) {
    if (!(await confirm({ message: t("messEntryDeleteConfirm"), danger: true, confirmText: t("delete") }))) return;
    try {
      await db.messEntries.delete(e.id);
      toast(t("messEntryDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("messMoneyTitle")}
        right={
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus className="h-5 w-5" />
            {t("add")}
          </button>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setMonth(addMonths(month, -1))} aria-label="−1">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="flex-1 text-center text-lg font-bold">{monthLabel(month)}</p>
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setMonth(addMonths(month, 1))} aria-label="+1">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(["all", ...MESS_ENTRY_KINDS] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${filter === f ? "bg-emerald-700 text-white" : "bg-soft"}`}>
            {f === "all" ? t("messKindAll") : t(KIND_LABEL[f])}
          </button>
        ))}
      </div>

      {list.length > 0 && <p className="mb-3 text-sm font-medium">{money(total)}</p>}

      {list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Banknote className="h-8 w-8" />}
            title={t("messEmptyEntries")}
            action={
              <button className="btn btn-primary" onClick={() => setEditing({})}>
                <Plus className="h-5 w-5" />
                {t("messEntryAdd")}
              </button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((e) => (
            <li key={e.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold">
                    {t(KIND_LABEL[e.kind])}
                    {e.note ? ` • ${e.note}` : ""}
                  </p>
                  <p className="text-sm text-muted">
                    {date(e.date)} • {e.memberId ? (nameOf.get(e.memberId) ?? "—") : t("messFromPool")}
                  </p>
                </div>
                <p className={`shrink-0 text-lg font-bold ${e.kind === "deposit" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{money(e.amount)}</p>
              </div>
              <div className="mt-2 flex justify-end gap-1">
                <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setEditing({ entry: e })} aria-label={t("edit")}>
                  <Pencil className="h-5 w-5" />
                </button>
                <button className="flex h-11 w-11 items-center justify-center rounded-full text-rose-600 hover:bg-soft" onClick={() => void remove(e)} aria-label={t("delete")}>
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <EntrySheet entry={editing.entry} defaultKind={filter === "all" ? "bazaar" : filter} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EntrySheet({ entry, defaultKind, onClose }: { entry?: MessEntry; defaultKind: MessEntryKind; onClose: () => void }) {
  const { t, data, toast } = useApp();
  const [kind, setKind] = useState<MessEntryKind>(entry?.kind ?? defaultKind);
  const [memberId, setMemberId] = useState(entry?.memberId ?? "");
  const [amountText, setAmountText] = useState(entry ? formatPlainPaisa(entry.amount, "en").replace(/,/g, "").replace(/\.00$/, "") : "");
  const [dateText, setDateText] = useState(entry?.date ?? todayDhaka());
  const [note, setNote] = useState(entry?.note ?? "");
  const [errors, setErrors] = useState<{ member?: string; amount?: string; date?: string; note?: string; split?: string }>({});
  const [busy, setBusy] = useState(false);

  // সাধারণ খরচ: কাদের মধ্যে ভাগ হবে (শুরুতে সবাই) ও খাতের নামের দ্রুত বাছাই
  const activeIds = data.messMembers.filter((m) => m.active).map((m) => m.id);
  const [splitIds, setSplitIds] = useState<string[]>(() => entry?.splitWith ?? activeIds);
  const presets = [t("labelRent"), t("labelElectricity"), t("labelGas"), t("labelInternet"), t("labelWater"), t("labelHelper")];
  const saved = savedLabels(
    data.messEntries.filter((e) => e.kind === "shared").map((e) => ({ label: e.note, at: e.createdAt })),
    presets,
  );

  // সক্রিয় সদস্য + (সম্পাদনার সময়) এই এন্ট্রির সদস্য, নিষ্ক্রিয় হলেও
  const people = data.messMembers.filter((m) => m.active || m.id === entry?.memberId);

  async function submit() {
    if (busy) return;
    const err: typeof errors = {};
    const amount = amountText.trim() ? parseAmountToPaisa(amountText) : null;
    if (kind === "deposit" && !memberId) err.member = t("errMemberRequired");
    if (!amountText.trim()) err.amount = t("errAmountRequired");
    else if (amount === null) err.amount = t("errAmountInvalid");
    if (!isValidIsoDate(dateText) || dateText < "2000-01-01" || dateText > "2100-12-31") err.date = t("errDateInvalid");
    if (note.length > 200) err.note = t("errTooLong");
    if (kind === "shared" && splitIds.length === 0) err.split = t("errSplitNone");
    setErrors(err);
    if (Object.keys(err).length || amount === null) return;
    setBusy(true);
    try {
      const payer = people.some((m) => m.id === memberId) ? memberId : undefined;
      // সবাই (সব সক্রিয় সদস্য) বাছা থাকলে splitWith রাখা হয় না — পরে নতুন সদস্য এলে সেও ভাগ পাবে
      const everyone = activeIds.length > 0 && activeIds.every((id) => splitIds.includes(id)) && splitIds.every((id) => activeIds.includes(id));
      const row: MessEntry = {
        id: entry?.id ?? newId(),
        kind,
        memberId: payer,
        amount,
        date: dateText,
        note: note.trim() || undefined,
        splitWith: kind === "shared" && !everyone ? splitIds : undefined,
        createdAt: entry?.createdAt ?? Date.now(),
      };
      await db.messEntries.put(row);
      toast(t("messEntrySaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={entry ? t("messEntryEdit") : t("messEntryAdd")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("messEntryKind")}>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as MessEntryKind)}>
            {MESS_ENTRY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(KIND_LABEL[k])}
              </option>
            ))}
          </select>
        </Field>
        {kind === "shared" && <p className="-mt-2 text-xs text-muted">{t("messSharedHint")}</p>}
        <Field label={kind === "deposit" ? t("messEntryDepositor") : t("messEntryPayer")} error={errors.member}>
          <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">{kind === "deposit" ? "—" : t("messFromPool")}</option>
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("amount") + " (৳)"} error={errors.amount}>
          <input className="input text-xl font-bold" inputMode="decimal" placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </Field>
        <Field label={t("date")} error={errors.date}>
          <input className="input" type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} />
        </Field>
        <Field label={kind === "shared" ? t("messSharedTitle") : t("messEntryNote")} optional error={errors.note}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {kind === "shared" && (
          <>
            <div className="-mt-2">
              <LabelChips presets={presets} saved={saved} onPick={setNote} />
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">{t("messSplitWith")}</legend>
              <div className="space-y-1">
                {data.messMembers
                  .filter((m) => m.active || splitIds.includes(m.id))
                  .map((m) => (
                    <label key={m.id} className="flex min-h-11 items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={splitIds.includes(m.id)}
                        onChange={(e) => setSplitIds(e.target.checked ? [...splitIds, m.id] : splitIds.filter((x) => x !== m.id))}
                      />
                      <span>{m.name}</span>
                    </label>
                  ))}
              </div>
              {errors.split && (
                <p className="mt-1 text-sm font-medium text-rose-600" role="alert">
                  {errors.split}
                </p>
              )}
            </fieldset>
          </>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
