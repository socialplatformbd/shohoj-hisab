export type TxType = "income" | "expense" | "saving" | "withdraw";
export type DebtKind = "lent" | "borrowed";
export type Lang = "bn" | "en";
export type Digits = "bn" | "en";
export type Theme = "light" | "dark" | "system";

/** সব টাকার অঙ্ক paisa (পূর্ণসংখ্যা) হিসাবে রাখা হয়। ১ টাকা = ১০০ পয়সা */
export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  categoryId: string;
  date: string; // YYYY-MM-DD (Asia/Dhaka)
  description?: string;
  paymentMethod?: string;
  accountId?: string; // কোন অ্যাকাউন্টে (ঐচ্ছিক)
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** নগদ, বিকাশ, ব্যাংক ইত্যাদি — আলাদা ব্যালেন্সসহ অ্যাকাউন্ট */
export interface Account {
  id: string;
  name: string;
  kind: string; // PAYMENT_METHODS-এর একটি
  openingBalance: number; // paisa, ০ বা বেশি
  createdAt: number;
  updatedAt: number;
}

/** এক অ্যাকাউন্ট থেকে অন্যটিতে টাকা সরানো — আয়/খরচ নয় */
export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
  createdAt: number;
}

export interface Category {
  id: string;
  type: TxType;
  name: string;
  nameEn?: string;
  builtin: boolean;
  createdAt: number;
}

export interface Budget {
  id: string;
  month: string; // YYYY-MM
  categoryId: string | null; // null = সামগ্রিক বাজেট
  amount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Debt {
  id: string;
  person: string;
  amount: number;
  kind: DebtKind; // lent = আমি ধার দিয়েছি (পাব), borrowed = আমি ধার নিয়েছি (দেব)
  date: string;
  dueDate?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Repayment {
  id: string;
  debtId: string;
  amount: number;
  date: string;
  note?: string;
  createdAt: number;
}

/** প্রতি মাসের নির্দিষ্ট তারিখে নিজে নিজে যোগ হওয়া লেনদেনের নিয়ম (বেতন, ভাড়া, কিস্তি ইত্যাদি) */
export interface Recurring {
  id: string;
  type: TxType;
  amount: number;
  categoryId: string;
  description?: string;
  paymentMethod?: string;
  accountId?: string;
  dayOfMonth: number; // ১–৩১ (ছোট মাসে মাসের শেষ দিন)
  startMonth: string; // YYYY-MM — যে মাস থেকে চালু
  lastMonth?: string; // YYYY-MM — সর্বশেষ যে মাসের লেনদেন তৈরি হয়েছে
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SettingRow {
  key: string;
  value: string | number | boolean | null;
}

export const TX_TYPES: TxType[] = ["income", "expense", "saving", "withdraw"];
export const PAYMENT_METHODS = ["cash", "bkash", "nagad", "rocket", "bank", "card", "other"] as const;
