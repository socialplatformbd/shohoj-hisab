import type { ShopEntry, ShopParty, ShopPartyKind } from "./types";

/** বিক্রি/ক্রয়ে এখনই যা নেওয়া/দেওয়া হয়েছে (০ থেকে মোট অঙ্কের মধ্যে); অন্য ধরনে সবটাই */
export function paidOf(e: ShopEntry): number {
  if (e.kind !== "sale" && e.kind !== "purchase") return e.amount;
  return Math.min(e.amount, Math.max(0, e.paidAmount ?? e.amount));
}

/** বিক্রি/ক্রয়ের বাকি অংশ — কাস্টমারের পাওনা / সরবরাহকারীর দেনায় যোগ হয় */
export function creditOf(e: ShopEntry): number {
  return e.kind === "sale" || e.kind === "purchase" ? e.amount - paidOf(e) : 0;
}

/** ক্যাশ বক্সে কতটা যোগ (+) বা বিয়োগ (−) */
export function cashEffect(e: ShopEntry): number {
  switch (e.kind) {
    case "sale":
      return paidOf(e);
    case "receive":
      return e.amount;
    case "purchase":
      return -paidOf(e);
    case "pay":
    case "expense":
      return -e.amount;
  }
}

/** কোন ধরনের এন্ট্রি কোন ধরনের পক্ষের সাথে যায় */
export const PARTY_KIND_OF: Record<"sale" | "receive" | "purchase" | "pay", ShopPartyKind> = {
  sale: "customer",
  receive: "customer",
  purchase: "supplier",
  pay: "supplier",
};

export interface PartyBalance {
  party: ShopParty;
  /** কাস্টমার: তার কাছে আমার পাওনা (+)। সরবরাহকারী: তাকে আমার দেনা (+)। (−) মানে অগ্রিম/বেশি দেওয়া */
  balance: number;
}

export function partyBalances(parties: ShopParty[], entries: ShopEntry[]): PartyBalance[] {
  const bal = new Map<string, number>(parties.map((p) => [p.id, 0]));
  const kindOf = new Map(parties.map((p) => [p.id, p.kind]));
  for (const e of entries) {
    if (!e.partyId || !bal.has(e.partyId)) continue;
    const k = kindOf.get(e.partyId);
    let d = 0;
    if (k === "customer") d = e.kind === "sale" ? creditOf(e) : e.kind === "receive" ? -e.amount : 0;
    else if (k === "supplier") d = e.kind === "purchase" ? creditOf(e) : e.kind === "pay" ? -e.amount : 0;
    bal.set(e.partyId, (bal.get(e.partyId) ?? 0) + d);
  }
  return parties.map((party) => ({ party, balance: bal.get(party.id) ?? 0 }));
}

export interface ShopSummary {
  sales: number;
  purchases: number;
  expenses: number;
  received: number; // এই সময়ে বাকি আদায়
  paidOut: number; // এই সময়ে সরবরাহকারীকে পরিশোধ
  /** আনুমানিক লাভ = বিক্রি − ক্রয় − খরচ (স্টক হিসাব ছাড়া) */
  profit: number;
  /** ক্যাশ বক্সে থাকার কথা (সব সময়ের হিসাবে) */
  cash: number;
  /** কাস্টমারদের কাছে মোট পাওনা (শুধু যাদের বাকি আছে) */
  customerDue: number;
  /** সরবরাহকারীদের কাছে মোট দেনা (শুধু যাদের বাকি আছে) */
  supplierDue: number;
}

/** from/to (ইনক্লুসিভ, YYYY-MM-DD) এর মধ্যের বিক্রি-ক্রয়-খরচ-লাভ; ক্যাশ ও বাকি সব সময়ের */
export function shopSummary(entries: ShopEntry[], parties: ShopParty[], from: string | null, to: string | null): ShopSummary {
  const inRange = (d: string) => (from === null || d >= from) && (to === null || d <= to);
  let sales = 0;
  let purchases = 0;
  let expenses = 0;
  let received = 0;
  let paidOut = 0;
  let cash = 0;
  for (const e of entries) {
    cash += cashEffect(e);
    if (!inRange(e.date)) continue;
    if (e.kind === "sale") sales += e.amount;
    else if (e.kind === "purchase") purchases += e.amount;
    else if (e.kind === "expense") expenses += e.amount;
    else if (e.kind === "receive") received += e.amount;
    else paidOut += e.amount;
  }
  const bals = partyBalances(parties, entries);
  const sumDue = (k: ShopPartyKind) => bals.filter((b) => b.party.kind === k && b.balance > 0).reduce((s, b) => s + b.balance, 0);
  return { sales, purchases, expenses, received, paidOut, profit: sales - purchases - expenses, cash, customerDue: sumDue("customer"), supplierDue: sumDue("supplier") };
}

/** এন্ট্রি বৈধ কিনা: সঠিক ধরনের পক্ষ, বাকি থাকলে পক্ষ আবশ্যক, paidAmount ≤ amount */
export function shopEntryValid(e: ShopEntry, parties: Map<string, ShopParty>, productIds?: Set<string>): boolean {
  // পণ্য: শুধু বিক্রি/ক্রয়ে, পরিমাণ ধনাত্মক ও আবশ্যক; পণ্য ছাড়া পরিমাণ থাকতে পারে না
  if (e.productId !== undefined) {
    if (e.kind !== "sale" && e.kind !== "purchase") return false;
    if (!(typeof e.qty === "number" && e.qty > 0)) return false;
    if (productIds && !productIds.has(e.productId)) return false;
  } else if (e.qty !== undefined) return false;
  if (e.paidAmount !== undefined && (e.paidAmount < 0 || e.paidAmount > e.amount)) return false;
  if (e.paidAmount !== undefined && e.kind !== "sale" && e.kind !== "purchase") return false;
  const party = e.partyId !== undefined ? parties.get(e.partyId) : undefined;
  if (e.partyId !== undefined && !party) return false;
  if (e.kind === "expense") return e.partyId === undefined;
  const need = PARTY_KIND_OF[e.kind];
  if (party && party.kind !== need) return false;
  if (e.kind === "receive" || e.kind === "pay") return !!party;
  return creditOf(e) === 0 || !!party; // বিক্রি/ক্রয়: বাকি থাকলে পক্ষ চাই
}
