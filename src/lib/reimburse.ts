import { db } from "./db";
import type { Transaction } from "./types";

/** ফেরত পেলে যে আয়-খাতে এন্ট্রি হয় (না থাকলে নিজে তৈরি হয়) */
export const REIMBURSEMENT_CATEGORY_ID = "cat_reimbursement";

export const isPending = (t: Transaction): boolean => t.type === "expense" && t.reimbursable === true && !t.reimbursedAt;
export const isReceived = (t: Transaction): boolean => t.type === "expense" && t.reimbursable === true && !!t.reimbursedAt;
export const pendingTotal = (txs: Transaction[]): number => txs.filter(isPending).reduce((s, t) => s + t.amount, 0);

/** একই খরচের জন্য সব সময় একই আইডি — তাই দুইবার চাপলেও ডুপ্লিকেট আয় হয় না */
export const reimbursementIncomeId = (txId: string): string => `reimb_${txId}`;

/**
 * ফেরত পাওয়া গেল: ওই তারিখে সমান অঙ্কের আয় ("খরচ ফেরত" খাতে) যোগ হয়, আসল খরচ "ফেরত পাওয়া" চিহ্নিত হয়।
 * এতে ব্যালেন্স ও অ্যাকাউন্টের টাকা ঠিক থাকে। সফল হলে true।
 */
export async function markReceived(txId: string, date: string, accountId: string | undefined, label: string): Promise<boolean> {
  return db.transaction("rw", [db.transactions, db.categories], async () => {
    const tx = await db.transactions.get(txId);
    if (!tx || !isPending(tx)) return false;
    const now = Date.now();
    if (!(await db.categories.get(REIMBURSEMENT_CATEGORY_ID))) {
      await db.categories.add({ id: REIMBURSEMENT_CATEGORY_ID, type: "income", name: "খরচ ফেরত", nameEn: "Reimbursement", builtin: false, createdAt: now });
    }
    const incomeId = reimbursementIncomeId(tx.id);
    const base = (tx.description ?? "").trim();
    await db.transactions.put({
      id: incomeId,
      type: "income",
      amount: tx.amount,
      categoryId: REIMBURSEMENT_CATEGORY_ID,
      date,
      description: (base ? `${label}: ${base}` : label).slice(0, 200),
      accountId,
      createdAt: now,
      updatedAt: now,
    });
    await db.transactions.put({ ...tx, reimbursedAt: date, reimbursementTxId: incomeId, updatedAt: now });
    return true;
  });
}

/** ফেরত বাতিল: ফেরতের আয়-এন্ট্রি মুছে খরচটি আবার "ফেরত বাকি" হয়ে যায় */
export async function undoReceived(txId: string): Promise<boolean> {
  return db.transaction("rw", db.transactions, async () => {
    const tx = await db.transactions.get(txId);
    if (!tx || !tx.reimbursedAt) return false;
    if (tx.reimbursementTxId) await db.transactions.delete(tx.reimbursementTxId);
    const next: Transaction = { ...tx, updatedAt: Date.now() };
    delete next.reimbursedAt;
    delete next.reimbursementTxId;
    await db.transactions.put(next);
    return true;
  });
}
