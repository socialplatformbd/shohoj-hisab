import { daysBetween } from "./dates";
import { lineTotal } from "./products";
import { creditOf } from "./shop";
import type { ShopEntry, ShopProduct } from "./types";

/** পণ্যের মোট ক্রয়-খরচ ও মোট পরিমাণ (শুরুর স্টক ক্রয়মূল্যে ধরে) — গড় ক্রয়দাম = cost ÷ qty */
export interface CostBasis {
  qty: number;
  cost: number;
}

export function costBasis(products: ShopProduct[], entries: ShopEntry[]): Map<string, CostBasis> {
  const map = new Map<string, CostBasis>();
  for (const p of products) map.set(p.id, { qty: p.openingStock, cost: p.openingStock > 0 ? (lineTotal(p.openingStock, p.buyPrice) ?? 0) : 0 });
  for (const e of entries) {
    if (e.kind !== "purchase" || !e.productId || !e.qty) continue;
    const b = map.get(e.productId);
    if (b) {
      b.qty += e.qty;
      b.cost += e.amount;
    }
  }
  return map;
}

/** বিক্রি হওয়া qty (মিলি-একক) এর গড় ক্রয়দামে খরচ (paisa); হিসাবের মতো তথ্য না থাকলে পণ্যের ক্রয়মূল্য */
export function cogsOf(basis: CostBasis | undefined, qty: number, fallbackBuyPrice: number): number {
  if (!basis || basis.qty <= 0 || basis.cost <= 0) return lineTotal(qty, fallbackBuyPrice) ?? 0;
  return Number((BigInt(qty) * BigInt(basis.cost) + BigInt(Math.floor(basis.qty / 2))) / BigInt(basis.qty));
}

export interface AvgProfit {
  sales: number;
  cogs: number; // পণ্য-সংযুক্ত বিক্রির গড় ক্রয়দামে খরচ
  unlinkedPurchases: number; // পণ্য ছাড়া ক্রয় — কেনার সময়েই খরচ ধরা
  expenses: number;
  profit: number;
  linkedSales: number;
  unlinkedSales: number;
}

/**
 * গড় ক্রয়দামে লাভ: পণ্য-সংযুক্ত বিক্রির জন্য বিক্রি − (পরিমাণ × গড় ক্রয়দাম);
 * পণ্য ছাড়া বিক্রি পুরোটাই আয় ধরা হয়, আর পণ্য ছাড়া ক্রয় কেনার সময়েই খরচ। পণ্য-সংযুক্ত ক্রয় স্টকে যায় (বিক্রির সময় খরচ হয়)।
 * সরল হিসাব (বিক্রি − ক্রয় − খরচ) আলাদা — সেটি shopSummary-তে।
 */
export function shopProfitAvg(entries: ShopEntry[], products: ShopProduct[], from: string | null, to: string | null): AvgProfit {
  const basis = costBasis(products, entries);
  const byId = new Map(products.map((p) => [p.id, p]));
  const inRange = (d: string) => (from === null || d >= from) && (to === null || d <= to);
  const r: AvgProfit = { sales: 0, cogs: 0, unlinkedPurchases: 0, expenses: 0, profit: 0, linkedSales: 0, unlinkedSales: 0 };
  for (const e of entries) {
    if (!inRange(e.date)) continue;
    if (e.kind === "sale") {
      r.sales += e.amount;
      const p = e.productId ? byId.get(e.productId) : undefined;
      if (p && e.qty) {
        r.cogs += cogsOf(basis.get(p.id), e.qty, p.buyPrice);
        r.linkedSales++;
      } else r.unlinkedSales++;
    } else if (e.kind === "purchase") {
      if (!(e.productId && e.qty && byId.has(e.productId))) r.unlinkedPurchases += e.amount;
    } else if (e.kind === "expense") r.expenses += e.amount;
  }
  r.profit = r.sales - r.cogs - r.unlinkedPurchases - r.expenses;
  return r;
}

export interface TopProduct {
  product: ShopProduct;
  qty: number;
  revenue: number;
}

/** সময়ের মধ্যে সবচেয়ে বেশি বিক্রির পণ্য (বিক্রির অঙ্ক অনুযায়ী) */
export function topProducts(entries: ShopEntry[], products: ShopProduct[], from: string | null, to: string | null, limit = 5): TopProduct[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const acc = new Map<string, TopProduct>();
  for (const e of entries) {
    if (e.kind !== "sale" || !e.productId || !e.qty) continue;
    if ((from !== null && e.date < from) || (to !== null && e.date > to)) continue;
    const p = byId.get(e.productId);
    if (!p) continue;
    const row = acc.get(p.id) ?? { product: p, qty: 0, revenue: 0 };
    row.qty += e.qty;
    row.revenue += e.amount;
    acc.set(p.id, row);
  }
  return [...acc.values()].sort((a, b) => b.revenue - a.revenue || a.product.name.localeCompare(b.product.name)).slice(0, limit);
}

/**
 * একটি পক্ষের (কাস্টমার/সরবরাহকারী) সবচেয়ে পুরনো অনাদায়ী বাকির তারিখ। আদায়/পরিশোধ পুরনো বাকি আগে মেটায় (FIFO)।
 * বাকি না থাকলে null।
 */
export function oldestDue(partyId: string, entries: ShopEntry[]): string | null {
  const mine = entries.filter((e) => e.partyId === partyId).sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
  const queue: { date: string; left: number }[] = [];
  let pay = 0;
  for (const e of mine) {
    const c = creditOf(e);
    if (c > 0) queue.push({ date: e.date, left: c });
    else if (e.kind === "receive" || e.kind === "pay") pay += e.amount;
  }
  // মোট পরিশোধ সামনের (পুরনো) বাকি থেকে কাটা হয়
  for (const q of queue) {
    const use = Math.min(q.left, pay);
    q.left -= use;
    pay -= use;
  }
  return queue.find((q) => q.left > 0)?.date ?? null;
}

/** কত দিন ধরে বাকি (আজ − পুরনো বাকির তারিখ), না থাকলে null */
export function dueAgeDays(partyId: string, entries: ShopEntry[], today: string): number | null {
  const d = oldestDue(partyId, entries);
  return d === null ? null : Math.max(0, daysBetween(d, today));
}
