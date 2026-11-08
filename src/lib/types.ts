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
  reimbursable?: boolean; // অফিস/অন্যের জন্য করা খরচ — ফেরত পাওয়ার কথা
  reimbursedAt?: string; // ফেরত পাওয়ার তারিখ (পেয়ে গেলে)
  reimbursementTxId?: string; // ফেরতের আয়-এন্ট্রির আইডি
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

/** অ্যাপের মোড: ব্যক্তিগত (ডিফল্ট), মেস বা দোকান */
export type AppMode = "personal" | "mess" | "shop";
export const APP_MODES: readonly AppMode[] = ["personal", "mess", "shop"];

/** দোকানের কাস্টমার (বাকিতে বিক্রি) বা সরবরাহকারী (বাকিতে ক্রয়) */
export type ShopPartyKind = "customer" | "supplier";
export interface ShopParty {
  id: string;
  name: string;
  kind: ShopPartyKind;
  phone?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * sale = বিক্রি, purchase = মাল ক্রয়, expense = দোকানের খরচ,
 * receive = কাস্টমারের বাকি আদায়, pay = সরবরাহকারীর দেনা পরিশোধ
 */
export type ShopEntryKind = "sale" | "purchase" | "expense" | "receive" | "pay";
export const SHOP_ENTRY_KINDS: readonly ShopEntryKind[] = ["sale", "purchase", "expense", "receive", "pay"];
export interface ShopEntry {
  id: string;
  kind: ShopEntryKind;
  amount: number; // বিক্রি/ক্রয়ের মোট; খরচ/আদায়/পরিশোধের অঙ্ক
  paidAmount?: number; // বিক্রি/ক্রয়ে এখনই যা নেওয়া/দেওয়া হয়েছে; না থাকলে পুরোটাই নগদ
  partyId?: string; // বাকি/আদায়/পরিশোধে আবশ্যক
  category?: string; // দোকানের খরচের খাত (নিজের লেখাও চলে)
  note?: string;
  date: string;
  createdAt: number;
}

/** মেসের সদস্য — ডেটা থাকলে মোছা হয় না, নিষ্ক্রিয় (active=false) করা হয় */
export interface MessMember {
  id: string;
  name: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** একজন সদস্যের একদিনের মিল; halves = আধা-মিল (২ = ১টি মিল)। শূন্য হলে সারিই রাখা হয় না */
export interface MessMeal {
  id: string; // `${date}_${memberId}` — প্রতিদিন প্রতি সদস্যের একটিই সারি
  date: string;
  memberId: string;
  halves: number;
  updatedAt: number;
}

/** বাজার / জমা / সাধারণ খরচ (ভাড়া, বিদ্যুৎ ইত্যাদি — সবাই সমান ভাগে) */
export type MessEntryKind = "bazaar" | "deposit" | "shared";
export const MESS_ENTRY_KINDS: readonly MessEntryKind[] = ["bazaar", "deposit", "shared"];
export interface MessEntry {
  id: string;
  kind: MessEntryKind;
  memberId?: string; // জমা: যিনি দিয়েছেন (আবশ্যক); বাজার/সাধারণ খরচ: যিনি নিজের পকেট থেকে দিয়েছেন (না থাকলে পুলের টাকা থেকে)
  amount: number;
  date: string;
  note?: string; // সাধারণ খরচে এটিই খাতের নাম (ভাড়া, বিদ্যুৎ বা নিজের লেখা)
  splitWith?: string[]; // সাধারণ খরচ কাদের মধ্যে ভাগ হবে; না থাকলে সব অংশগ্রহণকারী
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
