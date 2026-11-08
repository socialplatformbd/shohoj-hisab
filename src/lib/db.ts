import Dexie, { type Table } from "dexie";
import type { Account, Budget, Category, Debt, MessEntry, MessMeal, MessMember, Recurring, Repayment, SettingRow, ShopEntry, ShopParty, Transaction, Transfer } from "./types";

export const DB_NAME = "shohoj-hisab";
export const DB_SCHEMA_VERSION = 5;

export const DEFAULT_CATEGORIES: Category[] = (
  [
    ["cat_salary", "income", "বেতন", "Salary"],
    ["cat_business", "income", "ব্যবসা", "Business"],
    ["cat_freelancing", "income", "ফ্রিল্যান্সিং", "Freelancing"],
    ["cat_other_income", "income", "অন্যান্য আয়", "Other income"],
    ["cat_food", "expense", "খাবার", "Food"],
    ["cat_shopping", "expense", "কেনাকাটা", "Shopping"],
    ["cat_transport", "expense", "যাতায়াত", "Transport"],
    ["cat_housing", "expense", "বাসা ভাড়া ও বাড়ি", "Housing"],
    ["cat_utilities", "expense", "বিল ও ইউটিলিটি", "Utilities"],
    ["cat_medical", "expense", "চিকিৎসা", "Medical"],
    ["cat_education", "expense", "শিক্ষা", "Education"],
    ["cat_entertainment", "expense", "বিনোদন", "Entertainment"],
    ["cat_other_expense", "expense", "অন্যান্য খরচ", "Other expenses"],
    ["cat_saving", "saving", "সাধারণ সঞ্চয়", "General savings"],
    ["cat_saving_dps", "saving", "ডিপিএস / এফডিআর", "DPS / FDR"],
    ["cat_saving_emergency", "saving", "জরুরি তহবিল", "Emergency fund"],
    ["cat_withdraw", "withdraw", "সঞ্চয় উত্তোলন", "Savings withdrawal"],
  ] as const
).map(([id, type, name, nameEn]) => ({ id, type, name, nameEn, builtin: true, createdAt: 0 }));

export const FALLBACK_CATEGORY: Record<string, string> = {
  income: "cat_other_income",
  expense: "cat_other_expense",
  saving: "cat_saving",
  withdraw: "cat_withdraw",
};

class HisabDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  budgets!: Table<Budget, string>;
  debts!: Table<Debt, string>;
  repayments!: Table<Repayment, string>;
  settings!: Table<SettingRow, string>;
  recurring!: Table<Recurring, string>;
  accounts!: Table<Account, string>;
  transfers!: Table<Transfer, string>;
  messMembers!: Table<MessMember, string>;
  messMeals!: Table<MessMeal, string>;
  messEntries!: Table<MessEntry, string>;
  shopParties!: Table<ShopParty, string>;
  shopEntries!: Table<ShopEntry, string>;

  constructor() {
    super(DB_NAME);
    const base = {
      transactions: "id, type, categoryId, date, createdAt",
      categories: "id, type",
      budgets: "id, month, categoryId",
      debts: "id, kind, date",
      repayments: "id, debtId",
      settings: "key",
    };
    this.version(1).stores(base);
    // v2: নিয়মিত লেনদেন (পুরনো ডেটা অক্ষত থাকে)
    this.version(2).stores({ ...base, recurring: "id" });
    // v3: অ্যাকাউন্ট ও ট্রান্সফার (পুরনো ডেটা অক্ষত থাকে)
    const v3 = { ...base, recurring: "id", accounts: "id", transfers: "id, date" };
    this.version(3).stores(v3);
    // v4: মেস মোড
    const v4 = { ...v3, messMembers: "id", messMeals: "id, date, memberId", messEntries: "id, date, kind" };
    this.version(4).stores(v4);
    // v5: দোকান মোড
    this.version(DB_SCHEMA_VERSION).stores({ ...v4, shopParties: "id, kind", shopEntries: "id, date, kind, partyId" });
    this.on("populate", (tx) => {
      tx.table("categories").bulkAdd(DEFAULT_CATEGORIES);
    });
  }
}

export const db = new HisabDB();

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getSetting<T extends SettingRow["value"]>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: SettingRow["value"]): Promise<void> {
  await db.settings.put({ key, value });
}

/** সব ডেটা মুছে ডিফল্ট খাত আবার বসায় (ওয়েলকাম-স্ক্রিনের অবস্থা অক্ষত থাকে) */
export async function eraseAllData(): Promise<void> {
  await db.transaction("rw", [db.transactions, db.categories, db.budgets, db.debts, db.repayments, db.recurring, db.accounts, db.transfers, db.messMembers, db.messMeals, db.messEntries, db.shopParties, db.shopEntries, db.settings], async () => {
    await Promise.all([db.transactions.clear(), db.categories.clear(), db.budgets.clear(), db.debts.clear(), db.repayments.clear(), db.recurring.clear(), db.accounts.clear(), db.transfers.clear(), db.messMembers.clear(), db.messMeals.clear(), db.messEntries.clear(), db.shopParties.clear(), db.shopEntries.clear()]);
    await db.categories.bulkAdd(DEFAULT_CATEGORIES);
    await db.settings.delete("lastBackupAt");
  });
}
