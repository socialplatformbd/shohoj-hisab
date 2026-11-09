import { toAsciiDigits, MAX_PAISA } from "./money";
import type { ShopAdjustment, ShopEntry, ShopProduct } from "./types";

/** পরিমাণ পূর্ণসংখ্যায় রাখা হয়: ১ একক = ১০০০ (ভাসমান-সংখ্যার ভুল এড়াতে) */
export const QTY_SCALE = 1000;
export const MAX_QTY = 999_999_999; // ≈ ৯,৯৯,৯৯৯.৯৯৯ একক

function cleanQty(text: string): string {
  return toAsciiDigits(text).replace(/[,\s]/g, "");
}

/** ধনাত্মক পরিমাণ (তিন দশমিক পর্যন্ত) → ×১০০০ পূর্ণসংখ্যা; অবৈধ বা ০ হলে null */
export function parseQty(text: string): number | null {
  const v = parseQtyOrZero(text);
  return v !== null && v > 0 ? v : null;
}

/** ০ চলে এমন পরিমাণ: খালি বা ০ হলে ০; অবৈধ হলে null */
export function parseQtyOrZero(text: string): number | null {
  const s = cleanQty(text);
  if (s === "") return 0;
  const m = /^(\d{1,6})(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) return null;
  const q = Number(m[1]) * QTY_SCALE + Number((m[2] ?? "").padEnd(3, "0"));
  return q <= MAX_QTY ? q : null;
}

/** ×১০০০ পরিমাণ → "2.5" / "12" / "0.001" (অঙ্কের ধরন num() ঠিক করে) */
export function formatQty(q: number): string {
  const neg = q < 0;
  const a = Math.abs(Math.trunc(q));
  const whole = Math.floor(a / QTY_SCALE);
  const frac = String(a % QTY_SCALE).padStart(3, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

/** পরিমাণ × একক-দাম (paisa); BigInt — বড় অঙ্কেও নির্ভুল। সীমা ছাড়ালে null */
export function lineTotal(qty: number, unitPrice: number): number | null {
  if (!Number.isInteger(qty) || !Number.isInteger(unitPrice) || qty < 0 || unitPrice < 0) return null;
  const v = (BigInt(qty) * BigInt(unitPrice) + BigInt(500)) / BigInt(QTY_SCALE);
  return v > BigInt(MAX_PAISA) ? null : Number(v);
}

export interface StockRow {
  product: ShopProduct;
  /** হাতে থাকার কথা (×১০০০); বিক্রি বেশি হলে ঋণাত্মক হতে পারে */
  stock: number;
  /** ক্রয়মূল্যে স্টকের দাম (paisa); ঋণাত্মক স্টক ০ ধরা হয় */
  value: number;
  /** স্টক শেষ (≤ ০) */
  out: boolean;
  /** কম স্টক: সতর্কসীমা দেওয়া আছে এবং স্টক তার সমান বা কম (তবে শেষ নয়) */
  low: boolean;
}

export interface StockSummary {
  rows: StockRow[];
  totalValue: number;
  lowCount: number;
  outCount: number;
}

/** শুরুর স্টক + ক্রয় − বিক্রি ± সংশোধন, পণ্য ধরে */
export function stockMap(products: ShopProduct[], entries: ShopEntry[], adjustments: ShopAdjustment[]): Map<string, number> {
  const m = new Map<string, number>(products.map((p) => [p.id, p.openingStock]));
  for (const e of entries) {
    if (!e.productId || !e.qty || !m.has(e.productId)) continue;
    if (e.kind === "purchase") m.set(e.productId, (m.get(e.productId) ?? 0) + e.qty);
    else if (e.kind === "sale") m.set(e.productId, (m.get(e.productId) ?? 0) - e.qty);
  }
  for (const a of adjustments) if (m.has(a.productId)) m.set(a.productId, (m.get(a.productId) ?? 0) + a.delta);
  return m;
}

export function stockSummary(products: ShopProduct[], entries: ShopEntry[], adjustments: ShopAdjustment[]): StockSummary {
  const m = stockMap(products, entries, adjustments);
  const rows: StockRow[] = products.map((product) => {
    const stock = m.get(product.id) ?? 0;
    const out = stock <= 0;
    return {
      product,
      stock,
      value: out ? 0 : (lineTotal(stock, product.buyPrice) ?? 0),
      out,
      low: !out && product.minStock > 0 && stock <= product.minStock,
    };
  });
  return { rows, totalValue: rows.reduce((s, r) => s + r.value, 0), lowCount: rows.filter((r) => r.low).length, outCount: rows.filter((r) => r.out && r.product.minStock > 0).length };
}
