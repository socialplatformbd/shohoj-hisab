import { z } from "zod";
import { DB_SCHEMA_VERSION, DEFAULT_CATEGORIES, db } from "./db";
import { isValidIsoDate, TIMEZONE } from "./dates";
import { MAX_PAISA } from "./money";
import { encryptText } from "./cryptoBackup";
import { MAX_QTY } from "./products";
import { shopEntryValid } from "./shop";
import { PAYMENT_METHODS, PRODUCT_UNITS } from "./types";

export const BACKUP_FILENAME = "shohoj-hisab-backup.json";
export const ENCRYPTED_BACKUP_FILENAME = "shohoj-hisab-backup-encrypted.json";
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;

const id = z.string().min(1).max(100);
const date = z.string().refine(isValidIsoDate, "invalid date");
const paisa = z.number().int().positive().max(MAX_PAISA);
const ts = z.number().int().nonnegative();
const txType = z.enum(["income", "expense", "saving", "withdraw"]);

export const TransactionSchema = z.object({
  id,
  type: txType,
  amount: paisa,
  categoryId: id,
  date,
  description: z.string().max(500).optional(),
  paymentMethod: z
    .string()
    .refine((m) => (PAYMENT_METHODS as readonly string[]).includes(m), "invalid payment method")
    .optional(),
  accountId: id.optional(),
  reimbursable: z.boolean().optional(),
  reimbursedAt: date.optional(),
  reimbursementTxId: id.optional(),
  note: z.string().max(2000).optional(),
  createdAt: ts,
  updatedAt: ts,
});
export const CategorySchema = z.object({
  id,
  type: txType,
  name: z.string().min(1).max(80),
  nameEn: z.string().max(80).optional(),
  builtin: z.boolean(),
  createdAt: ts,
});
export const BudgetSchema = z.object({
  id,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  categoryId: id.nullable(),
  amount: paisa,
  createdAt: ts,
  updatedAt: ts,
});
export const DebtSchema = z.object({
  id,
  person: z.string().min(1).max(100),
  amount: paisa,
  kind: z.enum(["lent", "borrowed"]),
  date,
  dueDate: date.optional(),
  description: z.string().max(500).optional(),
  createdAt: ts,
  updatedAt: ts,
});
export const RepaymentSchema = z.object({
  id,
  debtId: id,
  amount: paisa,
  date,
  note: z.string().max(500).optional(),
  createdAt: ts,
});
export const RecurringSchema = z.object({
  id,
  type: txType,
  amount: paisa,
  categoryId: id,
  description: z.string().max(500).optional(),
  paymentMethod: z
    .string()
    .refine((m) => (PAYMENT_METHODS as readonly string[]).includes(m), "invalid payment method")
    .optional(),
  accountId: id.optional(),
  dayOfMonth: z.number().int().min(1).max(31),
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  lastMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  active: z.boolean(),
  createdAt: ts,
  updatedAt: ts,
});
export const AccountSchema = z.object({
  id,
  name: z.string().min(1).max(40),
  kind: z.string().refine((m) => (PAYMENT_METHODS as readonly string[]).includes(m), "invalid kind"),
  openingBalance: z.number().int().min(0).max(MAX_PAISA),
  createdAt: ts,
  updatedAt: ts,
});
export const TransferSchema = z.object({
  id,
  fromAccountId: id,
  toAccountId: id,
  amount: paisa,
  date,
  note: z.string().max(500).optional(),
  createdAt: ts,
});
export const MessMemberSchema = z.object({
  id,
  name: z.string().min(1).max(40),
  active: z.boolean(),
  createdAt: ts,
  updatedAt: ts,
});
export const MessMealSchema = z.object({
  id,
  date,
  memberId: id,
  halves: z.number().int().min(1).max(24),
  updatedAt: ts,
});
export const MessEntrySchema = z.object({
  id,
  kind: z.enum(["bazaar", "deposit", "shared"]),
  memberId: id.optional(),
  amount: paisa,
  date,
  note: z.string().max(500).optional(),
  splitWith: z.array(id).max(200).optional(),
  createdAt: ts,
});
export const ShopPartySchema = z.object({
  id,
  name: z.string().min(1).max(60),
  kind: z.enum(["customer", "supplier"]),
  phone: z.string().max(20).optional(),
  createdAt: ts,
  updatedAt: ts,
});
export const ShopEntrySchema = z.object({
  id,
  kind: z.enum(["sale", "purchase", "expense", "receive", "pay"]),
  amount: paisa,
  paidAmount: z.number().int().min(0).max(MAX_PAISA).optional(),
  partyId: id.optional(),
  category: z.string().max(60).optional(),
  productId: id.optional(),
  qty: z.number().int().positive().max(MAX_QTY).optional(),
  note: z.string().max(500).optional(),
  date,
  createdAt: ts,
});
export const ShopProductSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  unit: z.string().refine((u) => (PRODUCT_UNITS as readonly string[]).includes(u), "invalid unit"),
  buyPrice: z.number().int().min(0).max(MAX_PAISA),
  sellPrice: z.number().int().min(0).max(MAX_PAISA),
  openingStock: z.number().int().min(0).max(MAX_QTY),
  minStock: z.number().int().min(0).max(MAX_QTY),
  createdAt: ts,
  updatedAt: ts,
});
export const ShopAdjustmentSchema = z.object({
  id,
  productId: id,
  delta: z
    .number()
    .int()
    .min(-MAX_QTY)
    .max(MAX_QTY)
    .refine((d) => d !== 0, "zero delta"),
  date,
  note: z.string().max(200).optional(),
  createdAt: ts,
});
export const MessBudgetSchema = z.object({
  id: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amount: paisa,
  createdAt: ts,
  updatedAt: ts,
});
export const SettingSchema = z.object({
  key: z.string().min(1).max(60),
  value: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
});

export const BackupSchema = z.object({
  app: z.literal("shohoj-hisab"),
  version: z.number().int().positive(),
  exportedAt: z.string().min(1),
  timezone: z.string().optional(),
  data: z.object({
    transactions: z.array(TransactionSchema),
    categories: z.array(CategorySchema),
    budgets: z.array(BudgetSchema),
    debts: z.array(DebtSchema),
    repayments: z.array(RepaymentSchema),
    recurring: z.array(RecurringSchema).default([]), // পুরনো ব্যাকআপে এই অংশ নেই
    accounts: z.array(AccountSchema).default([]),
    transfers: z.array(TransferSchema).default([]),
    messMembers: z.array(MessMemberSchema).default([]),
    messMeals: z.array(MessMealSchema).default([]),
    messEntries: z.array(MessEntrySchema).default([]),
    shopParties: z.array(ShopPartySchema).default([]),
    shopEntries: z.array(ShopEntrySchema).default([]),
    shopProducts: z.array(ShopProductSchema).default([]),
    shopAdjustments: z.array(ShopAdjustmentSchema).default([]),
    messBudgets: z.array(MessBudgetSchema).default([]),
    settings: z.array(SettingSchema),
  }),
});

export type BackupFile = z.infer<typeof BackupSchema>;

/** শুধু সেটিংস যেগুলো ব্যাকআপে যাবে (ডিভাইস-নির্ভর অবস্থা নয়) */
const PREFERENCE_KEYS = ["userName", "language", "digits", "theme", "budgetNotifications", "monthStartDay", "mode"];

export async function buildBackup(): Promise<BackupFile> {
  return db.transaction("r", [db.transactions, db.categories, db.budgets, db.debts, db.repayments, db.recurring, db.accounts, db.transfers, db.messMembers, db.messMeals, db.messEntries, db.shopParties, db.shopEntries, db.shopProducts, db.shopAdjustments, db.messBudgets, db.settings], async () => {
    const [transactions, categories, budgets, debts, repayments, recurring, accounts, transfers, messMembers, messMeals, messEntries, shopParties, shopEntries, shopProducts, shopAdjustments, messBudgets, settings] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      db.budgets.toArray(),
      db.debts.toArray(),
      db.repayments.toArray(),
      db.recurring.toArray(),
      db.accounts.toArray(),
      db.transfers.toArray(),
      db.messMembers.toArray(),
      db.messMeals.toArray(),
      db.messEntries.toArray(),
      db.shopParties.toArray(),
      db.shopEntries.toArray(),
      db.shopProducts.toArray(),
      db.shopAdjustments.toArray(),
      db.messBudgets.toArray(),
      db.settings.toArray(),
    ]);
    return {
      app: "shohoj-hisab" as const,
      version: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      timezone: TIMEZONE,
      data: {
        transactions,
        categories,
        budgets,
        debts,
        repayments,
        recurring,
        accounts,
        transfers,
        messMembers,
        messMeals,
        messEntries,
        shopParties,
        shopEntries,
        shopProducts,
        shopAdjustments,
        messBudgets,
        settings: settings.filter((s) => PREFERENCE_KEYS.includes(s.key)),
      },
    };
  });
}

export type BackupParseError = "invalid" | "newer";

export class BackupError extends Error {
  constructor(public code: BackupParseError) {
    super(code);
  }
}

function dupes(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

/** ফাইলের লেখা যাচাই করে — ব্যর্থ হলে BackupError ছোঁড়ে, ডেটাবেসে কিছু লেখে না */
export function validateBackupText(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("invalid");
  }
  if (raw && typeof raw === "object" && (raw as { app?: unknown }).app === "shohoj-hisab") {
    const v = (raw as { version?: unknown }).version;
    if (typeof v === "number" && v > BACKUP_FORMAT_VERSION) throw new BackupError("newer");
  }
  const parsed = BackupSchema.safeParse(raw);
  if (!parsed.success) throw new BackupError("invalid");
  const { data } = parsed.data;

  // রেফারেন্স ও অনন্যতা যাচাই
  if (
    dupes(data.transactions.map((x) => x.id)) ||
    dupes(data.categories.map((x) => x.id)) ||
    dupes(data.budgets.map((x) => x.id)) ||
    dupes(data.debts.map((x) => x.id)) ||
    dupes(data.repayments.map((x) => x.id)) ||
    dupes(data.recurring.map((x) => x.id)) ||
    dupes(data.accounts.map((x) => x.id)) ||
    dupes(data.transfers.map((x) => x.id)) ||
    dupes(data.messMembers.map((x) => x.id)) ||
    dupes(data.messMeals.map((x) => x.id)) ||
    dupes(data.messEntries.map((x) => x.id)) ||
    dupes(data.shopParties.map((x) => x.id)) ||
    dupes(data.shopEntries.map((x) => x.id)) ||
    dupes(data.shopProducts.map((x) => x.id)) ||
    dupes(data.shopAdjustments.map((x) => x.id)) ||
    dupes(data.messBudgets.map((x) => x.month))
  ) {
    throw new BackupError("invalid");
  }
  const catIds = new Set(data.categories.map((c) => c.id));
  const debtById = new Map(data.debts.map((d) => [d.id, d]));
  if (data.transactions.some((t) => !catIds.has(t.categoryId))) throw new BackupError("invalid");
  if (data.budgets.some((b) => b.categoryId !== null && !catIds.has(b.categoryId))) throw new BackupError("invalid");
  if (data.recurring.some((r) => !catIds.has(r.categoryId))) throw new BackupError("invalid");
  const memberIds = new Set(data.messMembers.map((m) => m.id));
  if (data.messMeals.some((m) => !memberIds.has(m.memberId))) throw new BackupError("invalid");
  if (data.messEntries.some((e) => (e.memberId !== undefined && !memberIds.has(e.memberId)) || (e.kind === "deposit" && e.memberId === undefined) || (e.splitWith ?? []).some((x) => !memberIds.has(x)))) throw new BackupError("invalid");
  const partyMap = new Map(data.shopParties.map((p) => [p.id, p]));
  const productIds = new Set(data.shopProducts.map((p) => p.id));
  if (data.shopEntries.some((e) => !shopEntryValid(e, partyMap, productIds))) throw new BackupError("invalid");
  if (data.shopAdjustments.some((a) => !productIds.has(a.productId))) throw new BackupError("invalid");
  if (data.messBudgets.some((b) => b.id !== b.month)) throw new BackupError("invalid");
  const accIds = new Set(data.accounts.map((a) => a.id));
  if (data.transactions.some((t) => t.accountId !== undefined && !accIds.has(t.accountId))) throw new BackupError("invalid");
  if (data.recurring.some((r) => r.accountId !== undefined && !accIds.has(r.accountId))) throw new BackupError("invalid");
  if (data.transfers.some((x) => !accIds.has(x.fromAccountId) || !accIds.has(x.toAccountId) || x.fromAccountId === x.toAccountId)) throw new BackupError("invalid");
  const paidBy = new Map<string, number>();
  for (const r of data.repayments) {
    if (!debtById.has(r.debtId)) throw new BackupError("invalid");
    paidBy.set(r.debtId, (paidBy.get(r.debtId) ?? 0) + r.amount);
  }
  for (const [debtId, paid] of paidBy) {
    if (paid > (debtById.get(debtId)?.amount ?? 0)) throw new BackupError("invalid");
  }
  return parsed.data;
}

/** একটি ট্রানজ্যাকশনে সব বদলায় — মাঝপথে ব্যর্থ হলে আগের ডেটা অক্ষত থাকে */
export async function restoreBackup(file: BackupFile): Promise<void> {
  const d = file.data;
  await db.transaction("rw", [db.transactions, db.categories, db.budgets, db.debts, db.repayments, db.recurring, db.accounts, db.transfers, db.messMembers, db.messMeals, db.messEntries, db.shopParties, db.shopEntries, db.shopProducts, db.shopAdjustments, db.messBudgets, db.settings], async () => {
    await Promise.all([db.transactions.clear(), db.categories.clear(), db.budgets.clear(), db.debts.clear(), db.repayments.clear(), db.recurring.clear(), db.accounts.clear(), db.transfers.clear(), db.messMembers.clear(), db.messMeals.clear(), db.messEntries.clear(), db.shopParties.clear(), db.shopEntries.clear(), db.shopProducts.clear(), db.shopAdjustments.clear(), db.messBudgets.clear()]);
    await db.categories.bulkAdd(d.categories);
    // ডিফল্ট খাত (যেমন "অন্যান্য খরচ") ব্যাকআপে না থাকলেও যেন থাকে — নইলে AI/ফলব্যাক এমন খাতে লেখে যা নেই
    const have = new Set(d.categories.map((c) => c.id));
    const missing = DEFAULT_CATEGORIES.filter((c) => !have.has(c.id));
    if (missing.length) await db.categories.bulkAdd(missing);
    await db.transactions.bulkAdd(d.transactions);
    await db.budgets.bulkAdd(d.budgets);
    await db.debts.bulkAdd(d.debts);
    await db.repayments.bulkAdd(d.repayments);
    await db.recurring.bulkAdd(d.recurring);
    await db.accounts.bulkAdd(d.accounts);
    await db.transfers.bulkAdd(d.transfers);
    await db.messMembers.bulkAdd(d.messMembers);
    await db.messMeals.bulkAdd(d.messMeals);
    await db.messEntries.bulkAdd(d.messEntries);
    await db.shopParties.bulkAdd(d.shopParties);
    await db.shopProducts.bulkAdd(d.shopProducts);
    await db.shopEntries.bulkAdd(d.shopEntries);
    await db.shopAdjustments.bulkAdd(d.shopAdjustments);
    await db.messBudgets.bulkAdd(d.messBudgets);
    await db.settings.bulkPut(d.settings);
  });
}

export async function readFileText(file: File, maxBytes = BACKUP_MAX_BYTES): Promise<string> {
  if (file.size > maxBytes) throw new BackupError("invalid");
  return file.text();
}

export type SaveResult = "saved" | "downloaded" | "shared" | "cancelled";

type PickerWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export function canUseFilePicker(): boolean {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showSaveFilePicker === "function";
}

export function canShareFiles(filename = BACKUP_FILENAME, type = "application/json"): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function" || typeof File === "undefined") return false;
  try {
    return navigator.canShare({ files: [new File(["{}"], filename, { type })] });
  } catch {
    return false;
  }
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** ফাইল সেভ করার সবচেয়ে ভালো উপায়: ফাইল-পিকার → ডাউনলোড */
export async function saveBlob(blob: Blob, filename: string, mime: string, description: string, ext: string): Promise<SaveResult> {
  const w = window as PickerWindow;
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: filename, types: [{ description, accept: { [mime]: [ext] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (e) {
      if (isAbort(e)) return "cancelled";
      // পিকার ব্যর্থ হলে ডাউনলোডে নামি
    }
  }
  triggerDownload(blob, filename);
  return "downloaded";
}

export async function shareBlob(blob: Blob, filename: string, mime: string): Promise<SaveResult> {
  const file = new File([blob], filename, { type: mime });
  try {
    await navigator.share({ files: [file], title: filename });
    return "shared";
  } catch (e) {
    if (isAbort(e)) return "cancelled";
    throw e;
  }
}

export function backupBlob(backup: BackupFile): Blob {
  return new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
}

/** পাসওয়ার্ড দিয়ে এনক্রিপ্ট করা ব্যাকআপ ফাইল */
export async function encryptedBackupBlob(backup: BackupFile, password: string): Promise<Blob> {
  return new Blob([await encryptText(JSON.stringify(backup), password)], { type: "application/json" });
}

export { DB_SCHEMA_VERSION };
