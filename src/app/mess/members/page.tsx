"use client";

import { Pencil, Plus, Power, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EmptyState, Field, PageHeader, Sheet } from "@/components/ui";
import { db, newId } from "@/lib/db";
import type { MessMember } from "@/lib/types";

export default function MessMembersPage() {
  const { t, data, toast, confirm, dataReady } = useApp();
  const [editing, setEditing] = useState<{ member?: MessMember } | null>(null);

  if (!dataReady) return null;
  const members = [...data.messMembers].sort((a, b) => Number(b.active) - Number(a.active) || a.createdAt - b.createdAt);

  async function toggleActive(m: MessMember) {
    try {
      await db.messMembers.put({ ...m, active: !m.active, updatedAt: Date.now() });
    } catch {
      toast(t("dbError"), "error");
    }
  }

  async function remove(m: MessMember) {
    const used = data.messMeals.some((x) => x.memberId === m.id) || data.messEntries.some((x) => x.memberId === m.id);
    if (used) {
      toast(t("messMemberInUse"), "error");
      return;
    }
    if (!(await confirm({ message: t("messMemberDeleteConfirm"), danger: true, confirmText: t("delete") }))) return;
    try {
      await db.messMembers.delete(m.id);
      toast(t("messMemberDeleted"));
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("messMembers")}
        right={
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus className="h-5 w-5" />
            {t("add")}
          </button>
        }
      />
      <p className="mb-4 text-sm text-muted">{t("messMemberHint")}</p>

      {members.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={t("messNoMembersTitle")}
            hint={t("messNoMembersHint")}
            action={
              <button className="btn btn-primary" onClick={() => setEditing({})}>
                <Plus className="h-5 w-5" />
                {t("messMemberAdd")}
              </button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {members.map((m) => (
            <li key={m.id} className={`card flex items-center gap-2 ${m.active ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{m.name}</p>
                {!m.active && <p className="text-xs text-muted">{t("messMemberInactive")}</p>}
              </div>
              <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => void toggleActive(m)} aria-label={m.active ? t("messMemberDeactivate") : t("messMemberActivate")}>
                <Power className="h-5 w-5" />
              </button>
              <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft" onClick={() => setEditing({ member: m })} aria-label={t("edit")}>
                <Pencil className="h-5 w-5" />
              </button>
              <button className="flex h-11 w-11 items-center justify-center rounded-full text-rose-600 hover:bg-soft" onClick={() => void remove(m)} aria-label={t("delete")}>
                <Trash2 className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && <MemberSheet member={editing.member} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MemberSheet({ member, onClose }: { member?: MessMember; onClose: () => void }) {
  const { t, data, toast } = useApp();
  const [name, setName] = useState(member?.name ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const n = name.trim();
    if (!n) return setError(t("errNameRequired"));
    if (n.length > 40) return setError(t("errTooLong"));
    if (data.messMembers.some((m) => m.id !== member?.id && m.name.toLowerCase() === n.toLowerCase())) return setError(t("errDuplicate"));
    setBusy(true);
    try {
      const now = Date.now();
      if (member) await db.messMembers.put({ ...member, name: n, updatedAt: now });
      else await db.messMembers.add({ id: newId(), name: n, active: true, createdAt: now, updatedAt: now });
      toast(t("messMemberSaved"));
      onClose();
    } catch {
      toast(t("dbError"), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={member ? t("messMemberEdit") : t("messMemberAdd")} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("messMemberName")} error={error}>
          <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
