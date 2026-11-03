import { newId } from "./db";
import { isValidIsoDate } from "./dates";
import { paisaToDecimalString, parseAmountToPaisa } from "./money";
import { PAYMENT_METHODS, TX_TYPES, type Category, type Transaction, type TxType } from "./types";

export const CSV_HEADER = ["date", "type", "category", "amount", "description", "payment_method", "note"];

function safeCell(v: string): string {
  // CSV/Excel ফর্মুলা ইনজেকশন ঠেকাতে
  const guarded = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function transactionsToCsv(txs: Transaction[], categories: Category[]): string {
  const cats = new Map(categories.map((c) => [c.id, c]));
  const rows = [...txs]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((t) =>
      [
        t.date,
        t.type,
        safeCell(cats.get(t.categoryId)?.name ?? t.categoryId),
        paisaToDecimalString(t.amount),
        safeCell(t.description ?? ""),
        t.paymentMethod ?? "",
        safeCell(t.note ?? ""),
      ].join(","),
    );
  // BOM থাকলে Excel-এ বাংলা ঠিকভাবে দেখায়
  return "\uFEFF" + [CSV_HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function unguard(v: string): string {
  return /^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v;
}

export interface CsvImportResult {
  transactions: Transaction[];
  newCategories: Category[];
  bad: number;
}

export function parseTransactionsCsv(text: string, categories: Category[], now: number): CsvImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { transactions: [], newCategories: [], bad: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const cols = Object.fromEntries(CSV_HEADER.map((h) => [h, idx(h)])) as Record<string, number>;
  if (cols.date < 0 || cols.type < 0 || cols.category < 0 || cols.amount < 0) {
    throw new Error("missing columns");
  }
  const allCats = [...categories];
  const newCategories: Category[] = [];
  const transactions: Transaction[] = [];
  let bad = 0;

  for (const r of rows.slice(1)) {
    const get = (k: string) => (cols[k] >= 0 ? unguard((r[cols[k]] ?? "").trim()) : "");
    const date = get("date");
    const type = get("type").toLowerCase() as TxType;
    const catName = get("category");
    const amount = parseAmountToPaisa(get("amount"));
    if (!isValidIsoDate(date) || !TX_TYPES.includes(type) || amount === null || !catName) {
      bad++;
      continue;
    }
    // নাম আগেই ৪০ অক্ষরে ছেঁটে, ছোট/বড় হাতের পার্থক্য ছাড়া মেলাই — নইলে প্রতিটি সারিতে একই খাত বারবার তৈরি হয়
    const wanted = catName.slice(0, 40).toLowerCase();
    let cat = allCats.find((c) => c.type === type && (c.name.toLowerCase() === wanted || c.nameEn?.toLowerCase() === wanted));
    if (!cat) {
      cat = { id: newId(), type, name: catName.slice(0, 40), builtin: false, createdAt: now };
      allCats.push(cat);
      newCategories.push(cat);
    }
    const pm = get("payment_method").toLowerCase();
    transactions.push({
      id: newId(),
      type,
      amount,
      categoryId: cat.id,
      date,
      description: get("description").slice(0, 200) || undefined,
      paymentMethod: (PAYMENT_METHODS as readonly string[]).includes(pm) ? pm : pm ? "other" : undefined,
      note: get("note").slice(0, 500) || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { transactions, newCategories, bad };
}
