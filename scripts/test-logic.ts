// চালানো: npx tsx scripts/test-logic.ts
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { formatMoney, parseAmountToPaisa, numberToPaisa, percentOf } from "../src/lib/money";
import { addDays, endOfMonth, startOfWeek, todayDhaka, isValidIsoDate, BN_MONTHS_SHORT, EN_MONTHS_SHORT } from "../src/lib/dates";
import { budgetStatuses, debtTotals, sumTx, categoryBreakdown, summarizeDebt, monthlySeries } from "../src/lib/calc";
import { normalizeStartDay, periodKeyOf, periodRange } from "../src/lib/dates";
import { parseLocalText } from "../src/lib/localParser";
import { DEFAULT_CATEGORIES, db, newId, eraseAllData } from "../src/lib/db";
import { buildBackup, validateBackupText, restoreBackup, BackupError, encryptedBackupBlob } from "../src/lib/backup";
import { DecryptError, decryptText, encryptText, isEncryptedBackupText } from "../src/lib/cryptoBackup";
import { transactionsToCsv, parseTransactionsCsv } from "../src/lib/csv";
import { ExtractResponseSchema } from "../src/lib/aiSchema";
import { localAnswer } from "../src/lib/insights";
import { dueOccurrences, defaultStartMonth, generateRecurring, occurrenceId, scheduledDate } from "../src/lib/recurring";
import { PIN_RE, hashPin, makeSalt, normalizePin, verifyPin } from "../src/lib/pin";
import { accountSummary } from "../src/lib/accounts";
import { allocate, messSummary, mealId } from "../src/lib/mess";
import { paidOf, creditOf, partyBalances, shopSummary, shopEntryValid } from "../src/lib/shop";
import { parseAmountOrZero } from "../src/lib/money";
import type { Transaction, Debt, Repayment, Budget, Recurring, Account, Transfer, MessEntry, MessMeal, MessMember, ShopEntry, ShopParty } from "../src/lib/types";

let n = 0;
const ok = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve(fn()).then(() => console.log("  ✓", name), (e) => { console.error("  ✗", name, "\n", e); process.exitCode = 1; }).finally(() => n++);

const tx = (p: Partial<Transaction>): Transaction => ({ id: newId(), type: "expense", amount: 100, categoryId: "cat_food", date: "2026-05-10", createdAt: 1, updatedAt: 1, ...p });

(async () => {
  console.log("টাকা");
  await ok("parse amounts (bn/en digits, commas)", () => {
    assert.equal(parseAmountToPaisa("১,৫০০"), 150000);
    assert.equal(parseAmountToPaisa("1500.5"), 150050);
    assert.equal(parseAmountToPaisa("0.1"), 10);
    assert.equal(parseAmountToPaisa("0"), null);
    assert.equal(parseAmountToPaisa("-5"), null);
    assert.equal(parseAmountToPaisa("1.234"), null);
    assert.equal(parseAmountToPaisa("abc"), null);
    assert.equal(parseAmountToPaisa("1e5"), null);
    assert.equal(numberToPaisa(0.1 + 0.2), 30);
  });
  await ok("format money", () => {
    assert.equal(formatMoney(150000, "bn"), "৳ ১,৫০০.০০");
    assert.equal(formatMoney(150000, "en"), "৳ 1,500.00");
    assert.equal(formatMoney(12345678900, "en"), "৳ 12,34,56,789.00");
    assert.equal(formatMoney(-5, "en"), "-৳ 0.05");
    assert.equal(percentOf(1, 3), 33);
  });
  console.log("তারিখ");
  await ok("dates", () => {
    assert.ok(isValidIsoDate(todayDhaka()));
    assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    assert.equal(endOfMonth("2024-02-10"), "2024-02-29");
    assert.equal(startOfWeek("2026-05-15"), "2026-05-09"); // শুক্রবার → আগের শনিবার
    assert.equal(startOfWeek("2026-05-16"), "2026-05-16"); // শনিবার
    assert.ok(!isValidIsoDate("2026-02-30"));
  });
  await ok("ছোট মাসের নাম (বাংলা যুক্তাক্ষর কাটা হয় না)", () => {
    assert.equal(BN_MONTHS_SHORT.length, 12);
    assert.equal(EN_MONTHS_SHORT.length, 12);
    assert.ok(BN_MONTHS_SHORT.every((m) => m.length > 0 && !m.endsWith("\u09CD")));
  });

  console.log("হিসাব (আয়/খরচ/ড্যাশবোর্ড/রিপোর্ট)");
  const txs = [
    tx({ type: "income", amount: 5000000, categoryId: "cat_salary" }),
    tx({ amount: 50000 }),
    tx({ amount: 8000, categoryId: "cat_transport" }),
    tx({ amount: 12000 }),
    tx({ type: "saving", amount: 100000, categoryId: "cat_saving" }),
    tx({ type: "withdraw", amount: 20000, categoryId: "cat_withdraw" }),
    tx({ amount: 99900, date: "2026-04-30" }),
  ];
  await ok("totals", () => {
    const s = sumTx(txs);
    assert.equal(s.income, 5000000);
    assert.equal(s.expense, 50000 + 8000 + 12000 + 99900);
    assert.equal(s.savings, 80000);
    assert.equal(s.balance, 5000000 - 169900 - 100000 + 20000);
  });
  await ok("category breakdown", () => {
    const b = categoryBreakdown(txs.filter((t) => t.date.startsWith("2026-05")), "expense");
    assert.equal(b[0].categoryId, "cat_food");
    assert.equal(b[0].total, 62000);
    assert.equal(b[0].percent, 88);
  });
  await ok("budget", () => {
    const budgets: Budget[] = [
      { id: "b1", month: "2026-05", categoryId: null, amount: 100000, createdAt: 1, updatedAt: 1 },
      { id: "b2", month: "2026-05", categoryId: "cat_food", amount: 60000, createdAt: 1, updatedAt: 1 },
    ];
    const st = budgetStatuses(budgets, txs, "2026-05");
    const overall = st.find((s) => s.budget.id === "b1")!;
    assert.equal(overall.spent, 70000);
    assert.equal(overall.remaining, 30000);
    assert.equal(overall.percent, 70);
    assert.equal(overall.level, "ok");
    const food = st.find((s) => s.budget.id === "b2")!;
    assert.equal(food.spent, 62000);
    assert.equal(food.level, "over");
  });
  await ok("debts & repayments", () => {
    const d: Debt = { id: "d1", person: "রহিম", amount: 100000, kind: "lent", date: "2026-05-01", dueDate: "2026-05-05", createdAt: 1, updatedAt: 1 };
    const d2: Debt = { id: "d2", person: "করিম", amount: 50000, kind: "borrowed", date: "2026-05-01", createdAt: 1, updatedAt: 1 };
    const reps: Repayment[] = [
      { id: "r1", debtId: "d1", amount: 30000, date: "2026-05-02", createdAt: 1 },
      { id: "r2", debtId: "d1", amount: 20000, date: "2026-05-03", createdAt: 2 },
    ];
    const s = summarizeDebt(d, reps, "2026-05-10");
    assert.equal(s.paid, 50000);
    assert.equal(s.remaining, 50000);
    assert.equal(s.status, "partial");
    assert.ok(s.overdue);
    const tot = debtTotals([d, d2], reps, "2026-05-10");
    assert.equal(tot.receivable, 50000);
    assert.equal(tot.payable, 50000);
    reps.push({ id: "r3", debtId: "d1", amount: 50000, date: "2026-05-04", createdAt: 3 });
    assert.equal(summarizeDebt(d, reps, "2026-05-10").status, "paid");
  });

  console.log("AI (স্থানীয় ফলব্যাক পার্সার ও স্কিমা)");
  const cats = DEFAULT_CATEGORIES;
  await ok("বাংলা বাক্য থেকে ৩টি খরচ", () => {
    const rows = parseLocalText("আজ বাজারে ৫০০ টাকা, রিকশা ভাড়া ৮০ টাকা আর দুপুরে খাবারে ১২০ টাকা খরচ করেছি।", cats, "2026-05-10");
    console.log("    →", rows.map((r) => `${r.title}:${r.amount / 100}:${r.categoryId}`).join(" | "));
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.amount), [50000, 8000, 12000]);
    assert.deepEqual(rows.map((r) => r.title), ["বাজার", "রিকশা ভাড়া", "দুপুরের খাবার"]);
    assert.ok(rows.every((r) => r.type === "expense" && r.date === "2026-05-10"));
    assert.deepEqual(rows.map((r) => r.categoryId), ["cat_food", "cat_transport", "cat_food"]);
  });
  await ok("আয় চিহ্নিত", () => {
    const rows = parseLocalText("আজ বেতন পেয়েছি ২৫০০০ টাকা", cats, "2026-05-10");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, "income");
    assert.equal(rows[0].categoryId, "cat_salary");
  });
  await ok("কোনো অঙ্ক নেই → খালি", () => assert.equal(parseLocalText("আজ কিছু হয়নি", cats, "2026-05-10").length, 0));
  await ok("৳ চিহ্নসহ পুরো সংখ্যা (৳৫০০ → ৫০০, ৫ নয়)", () => {
    const r = parseLocalText("৳৫০০ চা", cats, "2026-05-10");
    assert.equal(r.length, 1);
    assert.equal(r[0].amount, 50000);
    assert.equal(parseLocalText("৳ 1,200.50 বাজার", cats, "2026-05-10")[0].amount, 120050);
  });
  await ok("ইংরেজি বাক্যে একই লেবেল দুইবার আসে না", () => {
    const r = parseLocalText("500 tk lunch and 200 tk bus", cats, "2026-05-10");
    assert.deepEqual(r.map((x) => x.title), ["lunch", "bus"]);
    assert.deepEqual(r.map((x) => x.categoryId), ["cat_food", "cat_transport"]);
  });
  await ok("আয় ও খরচ মেশানো বাক্যে ধরন আলাদা", () => {
    const r = parseLocalText("বেতন পেয়েছি ২৫০০০ টাকা এবং বাজার ৫০০ টাকা", cats, "2026-05-10");
    assert.deepEqual(r.map((x) => x.type), ["income", "expense"]);
  });
  await ok("AI আউটপুট স্কিমা কঠোর", () => {
    assert.ok(ExtractResponseSchema.safeParse({ items: [{ type: "expense", title: "বাজার", amount: 500, categoryId: "cat_food", date: "2026-05-10" }] }).success);
    assert.ok(!ExtractResponseSchema.safeParse({ items: [{ type: "expense", title: "বাজার", amount: -5 }] }).success);
    assert.ok(!ExtractResponseSchema.safeParse({ items: [{ type: "gift", title: "x", amount: 5 }] }).success);
    assert.ok(!ExtractResponseSchema.safeParse({ items: [{ type: "expense", title: "x", amount: "500" }] }).success);
    assert.ok(!ExtractResponseSchema.safeParse({ items: [{ type: "expense", title: "x", amount: 5, date: "2026-13-40" }] }).success);
    assert.ok(!ExtractResponseSchema.safeParse({ foo: 1 }).success);
  });
  await ok("প্রশ্নের স্থানীয় উত্তর (সবচেয়ে বেশি খরচ)", () => {
    const ans = localAnswer("এই মাসে আমার সবচেয়ে বেশি খরচ কোন খাতে হয়েছে?", { transactions: txs, categories: cats, budgets: [], debts: [], repayments: [] }, "2026-05-20", "bn", "bn");
    console.log("    →", ans);
    assert.ok(ans && ans.includes("খাবার") && ans.includes("৬২০.০০"));
  });

  console.log("CSV");
  await ok("export → import round trip", () => {
    const withText = [tx({ description: 'বাজার, "কাঁচা" সবজি', note: "=1+1", amount: 12345 })];
    const csv = transactionsToCsv(withText, cats);
    assert.ok(csv.includes("'=1+1"));
    const r = parseTransactionsCsv(csv, cats, 5);
    assert.equal(r.bad, 0);
    assert.equal(r.transactions.length, 1);
    assert.equal(r.transactions[0].amount, 12345);
    assert.equal(r.transactions[0].description, 'বাজার, "কাঁচা" সবজি');
    assert.equal(r.transactions[0].note, "=1+1");
    const bad = parseTransactionsCsv("date,type,category,amount\n2026-05-01,expense,খাবার,-5\n2026-05-01,expense,খাবার,50\n", cats, 5);
    assert.equal(bad.bad, 1);
    assert.equal(bad.transactions.length, 1);
  });

  await ok("CSV: একই নতুন খাত বারবার তৈরি হয় না", () => {
    const long = "ক".repeat(60);
    const r = parseTransactionsCsv(`date,type,category,amount\n2026-05-01,expense,${long},10\n2026-05-02,expense,${long},20\n2026-05-03,expense,Zakat,5\n2026-05-04,expense,zakat,5\n`, cats, 5);
    assert.equal(r.newCategories.length, 2);
    assert.equal(r.transactions.length, 4);
  });

  console.log("IndexedDB: যোগ/সম্পাদনা/মুছা, ব্যাকআপ ও রিস্টোর");
  await db.open();
  await ok("ডিফল্ট খাত seed হয়েছে", async () => assert.equal(await db.categories.count(), DEFAULT_CATEGORIES.length));
  const a = tx({ amount: 11100, description: "চা" });
  await ok("add / edit / delete", async () => {
    await db.transactions.add(a);
    assert.equal((await db.transactions.get(a.id))?.amount, 11100);
    await db.transactions.put({ ...a, amount: 22200, updatedAt: 99 });
    assert.equal((await db.transactions.get(a.id))?.amount, 22200);
    await db.transactions.delete(a.id);
    assert.equal(await db.transactions.count(), 0);
  });
  const d: Debt = { id: "dd", person: "সালমা", amount: 70000, kind: "lent", date: "2026-05-01", createdAt: 1, updatedAt: 1 };
  await db.transactions.bulkAdd(txs);
  await db.debts.add(d);
  await db.repayments.add({ id: "rr", debtId: "dd", amount: 20000, date: "2026-05-02", createdAt: 2 });
  await db.budgets.add({ id: "bb", month: "2026-05", categoryId: null, amount: 90000, createdAt: 1, updatedAt: 1 });
  await db.settings.put({ key: "userName", value: "রাকিব" });
  await db.settings.put({ key: "welcomeDone", value: true });
  let text = "";
  await ok("ব্যাকআপ তৈরি ও যাচাই", async () => {
    const b = await buildBackup();
    text = JSON.stringify(b);
    assert.equal(b.version, 1);
    assert.equal(b.data.transactions.length, txs.length);
    assert.ok(!b.data.settings.some((s) => s.key === "welcomeDone"));
    const v = validateBackupText(text);
    assert.equal(v.data.debts.length, 1);
  });
  await ok("ত্রুটিপূর্ণ ব্যাকআপ প্রত্যাখ্যাত", () => {
    const rej = (s: string, code = "invalid") => assert.throws(() => validateBackupText(s), (e: unknown) => e instanceof BackupError && e.code === code);
    rej("not json");
    rej("{}");
    rej(JSON.stringify({ app: "other", version: 1 }));
    rej(JSON.stringify({ ...JSON.parse(text), version: 99 }), "newer");
    const j = JSON.parse(text);
    j.data.transactions[0].amount = -5;
    rej(JSON.stringify(j));
    const j2 = JSON.parse(text);
    j2.data.transactions[0].categoryId = "nope";
    rej(JSON.stringify(j2));
    const j3 = JSON.parse(text);
    j3.data.repayments[0].amount = 999999999;
    rej(JSON.stringify(j3));
    const j4 = JSON.parse(text);
    j4.data.transactions.push(j4.data.transactions[0]);
    rej(JSON.stringify(j4));
  });
  await ok("রিস্টোর: ডেটা মুছে ফিরিয়ে আনা", async () => {
    await eraseAllData();
    await db.settings.clear();
    assert.equal(await db.transactions.count(), 0);
    await restoreBackup(validateBackupText(text));
    assert.equal(await db.transactions.count(), txs.length);
    assert.equal(await db.debts.count(), 1);
    assert.equal(await db.repayments.count(), 1);
    assert.equal(await db.budgets.count(), 1);
    assert.equal((await db.settings.get("userName"))?.value, "রাকিব");
    const again = await buildBackup();
    assert.equal(JSON.stringify(again.data.transactions.sort((x, y) => x.id.localeCompare(y.id))), JSON.stringify(JSON.parse(text).data.transactions.sort((x: Transaction, y: Transaction) => x.id.localeCompare(y.id))));
  });
  await ok("রিস্টোর মাঝপথে ব্যর্থ হলে আগের ডেটা অক্ষত (rollback)", async () => {
    const before = await db.transactions.count();
    const bad = validateBackupText(text);
    // ইচ্ছাকৃতভাবে ক্ষতিগ্রস্ত: duplicate key ঢুকিয়ে bulkAdd ব্যর্থ করানো (যাচাইয়ের পরের ধাপ)
    bad.data.transactions.push({ ...bad.data.transactions[0] });
    await assert.rejects(() => restoreBackup(bad));
    assert.equal(await db.transactions.count(), before);
    assert.equal(await db.debts.count(), 1);
  });

  await ok("অচেনা পেমেন্ট মাধ্যমসহ ব্যাকআপ প্রত্যাখ্যাত", () => {
    const b = JSON.parse(text);
    b.data.transactions[0].paymentMethod = "xyz";
    assert.throws(() => validateBackupText(JSON.stringify(b)), (e: unknown) => e instanceof BackupError && e.code === "invalid");
  });
  await ok("ব্যাকআপে ডিফল্ট খাত না থাকলেও রিস্টোরের পর সব ডিফল্ট খাত থাকে", async () => {
    const b = JSON.parse(text);
    const used = new Set(b.data.transactions.map((t: Transaction) => t.categoryId));
    b.data.categories = b.data.categories.filter((c: { id: string }) => used.has(c.id));
    await restoreBackup(validateBackupText(JSON.stringify(b)));
    assert.equal(await db.categories.count(), DEFAULT_CATEGORIES.length);
  });

  console.log("বেতন-মাস (মাসের শুরুর তারিখ)");
  await ok("periodKeyOf / periodRange", () => {
    assert.equal(normalizeStartDay(25), 25);
    assert.equal(normalizeStartDay(0), 1);
    assert.equal(normalizeStartDay(29), 1);
    assert.equal(normalizeStartDay("x"), 1);
    assert.deepEqual(periodRange("2026-11", 1), { from: "2026-11-01", to: "2026-11-30" });
    assert.deepEqual(periodRange("2026-11", 25), { from: "2026-10-25", to: "2026-11-24" });
    assert.deepEqual(periodRange("2027-01", 25), { from: "2026-12-25", to: "2027-01-24" });
    assert.equal(periodKeyOf("2026-10-24", 25), "2026-10");
    assert.equal(periodKeyOf("2026-10-25", 25), "2026-11");
    assert.equal(periodKeyOf("2026-12-31", 25), "2027-01");
    for (const D of [1, 2, 15, 25, 28]) {
      for (const key of ["2026-01", "2026-02", "2026-12", "2028-03"]) {
        const r = periodRange(key, D);
        assert.equal(periodKeyOf(r.from, D), key);
        assert.equal(periodKeyOf(r.to, D), key);
      }
    }
  });
  await ok("বাজেট ও চার্ট শুরুর তারিখ মানে", () => {
    const txs = [tx({ date: "2026-10-24", amount: 1000 }), tx({ date: "2026-10-25", amount: 2000 }), tx({ date: "2026-11-24", amount: 3000 }), tx({ date: "2026-11-25", amount: 5000 })];
    const b: Budget[] = [{ id: "bb", month: "2026-11", categoryId: null, amount: 10000, createdAt: 1, updatedAt: 1 }];
    assert.equal(budgetStatuses(b, txs, "2026-11", 25)[0].spent, 5000);
    assert.equal(budgetStatuses(b, txs, "2026-11")[0].spent, 8000);
    assert.deepEqual(monthlySeries(txs, "2026-10", "2026-12", 25).map((x) => x.expense), [1000, 5000, 5000]);
    assert.deepEqual(monthlySeries(txs, "2026-10", "2026-12").map((x) => x.expense), [3000, 8000, 0]);
  });

  console.log("নিয়মিত লেনদেন ও পিন");
  await ok("নিয়মিত লেনদেনের তারিখ-হিসাব", () => {
    const r = (o: Partial<Recurring> = {}): Recurring => ({ id: "r1", type: "expense", amount: 100, categoryId: "cat_housing", dayOfMonth: 5, startMonth: "2026-05", active: true, createdAt: 0, updatedAt: 0, ...o });
    assert.equal(scheduledDate("2026-02", 31), "2026-02-28");
    assert.equal(scheduledDate("2028-02", 31), "2028-02-29");
    assert.equal(scheduledDate("2026-04", 31), "2026-04-30");
    assert.deepEqual(dueOccurrences(r(), "2026-07-10").map((x) => x.month), ["2026-05", "2026-06", "2026-07"]);
    assert.equal(dueOccurrences(r({ lastMonth: "2026-10" }), "2026-11-03").length, 0);
    assert.equal(dueOccurrences(r({ lastMonth: "2026-10" }), "2026-11-05").length, 1);
    assert.equal(dueOccurrences(r({ active: false }), "2026-11-10").length, 0);
    assert.equal(dueOccurrences(r({ startMonth: "2020-01" }), "2026-11-30").length, 24);
    assert.deepEqual(dueOccurrences(r({ startMonth: "2026-11", dayOfMonth: 1 }), "2027-02-01").map((x) => x.month), ["2026-11", "2026-12", "2027-01", "2027-02"]);
    assert.equal(defaultStartMonth(25, "2026-11-03"), "2026-11");
    assert.equal(defaultStartMonth(2, "2026-12-20"), "2027-01");
  });
  await ok("পিন হ্যাশ ও যাচাই", async () => {
    const salt = makeSalt();
    const h = await hashPin("1234", salt);
    assert.ok(await verifyPin("1234", salt, h));
    assert.ok(!(await verifyPin("1235", salt, h)));
    assert.equal(normalizePin(" ১২৩৪ "), "1234");
    assert.ok(PIN_RE.test("1234") && PIN_RE.test("123456") && !PIN_RE.test("123") && !PIN_RE.test("1234567"));
  });
  await ok("generateRecurring: তৈরি, ডুপ্লিকেট নয়, মুছলে ফেরে না, সম্পাদনা অক্ষত", async () => {
    await db.recurring.clear();
    const before = await db.transactions.count();
    const rule: Recurring = { id: "rr1", type: "expense", amount: 500000, categoryId: "cat_housing", description: "বাসা ভাড়া", dayOfMonth: 5, startMonth: "2026-08", active: true, createdAt: 1, updatedAt: 1 };
    await db.recurring.add(rule);
    assert.equal(await generateRecurring("2026-10-10"), 3);
    assert.equal(await db.transactions.count(), before + 3);
    assert.equal(await generateRecurring("2026-10-10"), 0);
    const sep = occurrenceId("rr1", "2026-09");
    const oct = occurrenceId("rr1", "2026-10");
    await db.transactions.delete(sep);
    await db.transactions.update(oct, { amount: 600000 });
    assert.equal(await generateRecurring("2026-10-20"), 0);
    assert.equal(await db.transactions.get(sep), undefined);
    assert.equal((await db.transactions.get(oct))?.amount, 600000);
    assert.equal(await generateRecurring("2026-11-05"), 1);
  });
  await ok("ব্যাকআপে নিয়মিত লেনদেন যায় ও ফেরে; পুরনো ব্যাকআপ (recurring ছাড়া) চলে", async () => {
    const b = await buildBackup();
    assert.equal(b.data.recurring.length, 1);
    const text2 = JSON.stringify(b);
    await db.recurring.clear();
    await restoreBackup(validateBackupText(text2));
    assert.equal(await db.recurring.count(), 1);
    const old = JSON.parse(text2);
    delete old.data.recurring;
    assert.deepEqual(validateBackupText(JSON.stringify(old)).data.recurring, []);
  });
  await ok("সব ডেটা মুছলে নিয়মিত লেনদেনও যায়", async () => {
    await eraseAllData();
    assert.equal(await db.recurring.count(), 0);
  });

  console.log("অ্যাকাউন্ট ও ট্রান্সফার");
  await ok("অ্যাকাউন্ট ব্যালেন্স ও ট্রান্সফার (মোট অঙ্ক অপরিবর্তিত)", () => {
    const acc = (id: string, open: number): Account => ({ id, name: id, kind: "cash", openingBalance: open, createdAt: 1, updatedAt: 1 });
    const accounts = [acc("cash", 100000), acc("bank", 500000)];
    const txs = [
      tx({ type: "income", amount: 800000, accountId: "bank" }),
      tx({ type: "expense", amount: 20000, accountId: "cash" }),
      tx({ type: "saving", amount: 50000, accountId: "bank" }),
      tx({ type: "withdraw", amount: 10000, accountId: "bank" }),
      tx({ type: "expense", amount: 5000 }),
    ];
    const transfers: Transfer[] = [{ id: "t1", fromAccountId: "bank", toAccountId: "cash", amount: 100000, date: "2026-11-04", createdAt: 1 }];
    const sm = accountSummary(accounts, txs, transfers);
    const by = Object.fromEntries(sm.rows.map((r) => [r.account.id, r.balance]));
    assert.equal(by.cash, 100000 - 20000 + 100000);
    assert.equal(by.bank, 500000 + 800000 - 50000 + 10000 - 100000);
    assert.equal(sm.unassigned, -5000);
    assert.equal(sm.total, 600000 + sumTx(txs).balance);
  });
  await ok("ব্যাকআপে অ্যাকাউন্ট, ট্রান্সফার ও লেনদেনের accountId যায়-ফেরে", async () => {
    await eraseAllData();
    const now = Date.now();
    await db.accounts.bulkAdd([
      { id: "a1", name: "নগদ", kind: "cash", openingBalance: 100000, createdAt: now, updatedAt: now },
      { id: "a2", name: "ব্যাংক", kind: "bank", openingBalance: 0, createdAt: now, updatedAt: now },
    ]);
    await db.transactions.add({ ...tx({ type: "income", amount: 500000 }), id: "ax1", accountId: "a2" });
    await db.transfers.add({ id: "tr1", fromAccountId: "a2", toAccountId: "a1", amount: 100000, date: "2026-11-04", createdAt: now });
    const text3 = JSON.stringify(await buildBackup());
    await eraseAllData();
    await restoreBackup(validateBackupText(text3));
    assert.equal(await db.accounts.count(), 2);
    assert.equal(await db.transfers.count(), 1);
    assert.equal((await db.transactions.get("ax1"))?.accountId, "a2");
    // অচেনা অ্যাকাউন্ট বা নিজের কাছে ট্রান্সফার প্রত্যাখ্যাত
    const bad = JSON.parse(text3);
    bad.data.transactions[0].accountId = "nope";
    assert.throws(() => validateBackupText(JSON.stringify(bad)), (e: unknown) => e instanceof BackupError);
    const bad2 = JSON.parse(text3);
    bad2.data.transfers[0].toAccountId = bad2.data.transfers[0].fromAccountId;
    assert.throws(() => validateBackupText(JSON.stringify(bad2)), (e: unknown) => e instanceof BackupError);
    // পুরনো ব্যাকআপ (accounts/transfers ছাড়া) চলে
    const old = JSON.parse(text3);
    delete old.data.accounts;
    delete old.data.transfers;
    for (const x of old.data.transactions) delete x.accountId;
    assert.deepEqual(validateBackupText(JSON.stringify(old)).data.accounts, []);
  });
  await ok("সব ডেটা মুছলে অ্যাকাউন্টও যায়", async () => {
    await eraseAllData();
    assert.equal(await db.accounts.count(), 0);
    assert.equal(await db.transfers.count(), 0);
  });

  console.log("মেস মোড");
  await ok("ভাগ (allocate): যোগফল সব সময় ঠিক", () => {
    assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
    assert.deepEqual(allocate(100, [0, 0]), [0, 0]);
    assert.deepEqual(allocate(10, [3, 0, 7]), [3, 0, 7]);
    for (let i = 0; i < 2000; i++) {
      const w = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, () => Math.floor(Math.random() * 40));
      const total = Math.floor(Math.random() * 1e9);
      const a = allocate(total, w);
      assert.equal(a.reduce((x, y) => x + y, 0), w.reduce((x, y) => x + y, 0) > 0 ? total : 0);
    }
    assert.equal(allocate(999_999_999_999, [3, 3, 3, 1]).reduce((x, y) => x + y, 0), 999_999_999_999);
  });
  await ok("মেসের মাসিক হিসাব: মিল-রেট, সাধারণ ভাগ, ব্যালেন্স ও পুল", () => {
    const mem = (id: string, active = true): MessMember => ({ id, name: id, active, createdAt: 1, updatedAt: 1 });
    const meal = (d: string, memberId: string, halves: number): MessMeal => ({ id: mealId(d, memberId), date: d, memberId, halves, updatedAt: 1 });
    const ent = (o: Partial<MessEntry>): MessEntry => ({ id: newId(), kind: "bazaar", amount: 100, date: "2026-11-03", createdAt: 1, ...o });
    const members = [mem("a"), mem("b"), mem("c"), mem("old", false)];
    const meals = [meal("2026-11-01", "a", 2), meal("2026-11-01", "b", 2), meal("2026-11-02", "a", 4), meal("2026-11-02", "c", 1), meal("2026-10-30", "b", 2)];
    const entries = [
      ent({ kind: "deposit", memberId: "a", amount: 100000 }),
      ent({ kind: "deposit", memberId: "b", amount: 50000 }),
      ent({ kind: "bazaar", memberId: "a", amount: 30000 }),
      ent({ kind: "bazaar", amount: 20000 }),
      ent({ kind: "shared", memberId: "c", amount: 90000 }),
      ent({ kind: "bazaar", amount: 99999, date: "2026-10-31" }),
    ];
    const sm = messSummary(members, meals, entries, "2026-11");
    assert.deepEqual(sm.rows.map((r) => r.member.id), ["a", "b", "c"]);
    assert.equal(sm.totalBazaar, 50000);
    assert.equal(sm.totalShared, 90000);
    assert.equal(sm.totalHalves, 9);
    assert.equal(sm.rows.reduce((x, r) => x + r.mealCost, 0), 50000);
    assert.deepEqual(sm.rows.map((r) => r.shared), [30000, 30000, 30000]);
    assert.equal(sm.pool, 150000 + 30000 + 90000 - 50000 - 90000);
    assert.equal(messSummary(members, [...meals, meal("2026-11-05", "old", 2)], entries, "2026-11").rows.some((r) => r.member.id === "old"), true);
    assert.equal(messSummary(members, [], entries, "2026-11").noMeals, true);
  });
  await ok("মেসের ডেটা ব্যাকআপে যায়-ফেরে; অবৈধ সদস্য-রেফারেন্স প্রত্যাখ্যাত; পুরনো ব্যাকআপ চলে", async () => {
    await eraseAllData();
    const now = Date.now();
    await db.messMembers.bulkAdd([
      { id: "m1", name: "রাকিব", active: true, createdAt: now, updatedAt: now },
      { id: "m2", name: "করিম", active: true, createdAt: now, updatedAt: now },
    ]);
    await db.messMeals.add({ id: mealId("2026-11-01", "m1"), date: "2026-11-01", memberId: "m1", halves: 3, updatedAt: now });
    await db.messEntries.bulkAdd([
      { id: "e1", kind: "deposit", memberId: "m1", amount: 100000, date: "2026-11-01", createdAt: now },
      { id: "e2", kind: "bazaar", amount: 30000, date: "2026-11-02", createdAt: now },
    ]);
    const text5 = JSON.stringify(await buildBackup());
    await eraseAllData();
    assert.equal(await db.messMembers.count(), 0);
    await restoreBackup(validateBackupText(text5));
    assert.equal(await db.messMembers.count(), 2);
    assert.equal(await db.messMeals.count(), 1);
    assert.equal(await db.messEntries.count(), 2);
    const bad = JSON.parse(text5);
    bad.data.messMeals[0].memberId = "nope";
    assert.throws(() => validateBackupText(JSON.stringify(bad)), (e: unknown) => e instanceof BackupError);
    const bad2 = JSON.parse(text5);
    delete bad2.data.messEntries.find((x: MessEntry) => x.kind === "deposit").memberId;
    assert.throws(() => validateBackupText(JSON.stringify(bad2)), (e: unknown) => e instanceof BackupError);
    const old = JSON.parse(text5);
    delete old.data.messMembers;
    delete old.data.messMeals;
    delete old.data.messEntries;
    assert.deepEqual(validateBackupText(JSON.stringify(old)).data.messMembers, []);
    await eraseAllData();
  });

  await ok("মেস: সাধারণ খরচ নির্দিষ্ট সদস্যদের মধ্যে ভাগ (splitWith)", () => {
    const mem = (id: string): MessMember => ({ id, name: id, active: true, createdAt: 1, updatedAt: 1 });
    const meals: MessMeal[] = ["a", "b", "c"].map((m) => ({ id: mealId("2026-11-01", m), date: "2026-11-01", memberId: m, halves: 2, updatedAt: 1 }));
    const sh = (o: Partial<MessEntry>): MessEntry => ({ id: newId(), kind: "shared", amount: 100, date: "2026-11-03", createdAt: 1, ...o });
    const sm = messSummary([mem("a"), mem("b"), mem("c")], meals, [sh({ amount: 90000 }), sh({ amount: 10001, splitWith: ["a", "b"] })], "2026-11");
    const by = Object.fromEntries(sm.rows.map((r) => [r.member.id, r.shared]));
    assert.equal(by.a + by.b + by.c, 100001);
    assert.equal(by.c, 30000);
    const fb = messSummary([mem("a"), mem("b")], [], [sh({ amount: 300, splitWith: ["zzz"] })], "2026-11");
    assert.deepEqual(fb.rows.map((r) => r.shared), [150, 150]);
  });

  console.log("দোকান মোড");
  await ok("দোকানের হিসাব: বিক্রি/ক্রয়/খরচ/লাভ, ক্যাশ, বাকি", () => {
    const P = (id: string, kind: "customer" | "supplier"): ShopParty => ({ id, name: id, kind, createdAt: 1, updatedAt: 1 });
    const E = (o: Partial<ShopEntry>): ShopEntry => ({ id: newId(), kind: "sale", amount: 1000, date: "2026-11-03", createdAt: 1, ...o });
    const parties = [P("c1", "customer"), P("c2", "customer"), P("s1", "supplier")];
    const entries = [
      E({ kind: "sale", amount: 5000 }),
      E({ kind: "sale", amount: 3000, paidAmount: 1000, partyId: "c1" }),
      E({ kind: "sale", amount: 2000, paidAmount: 0, partyId: "c2" }),
      E({ kind: "receive", amount: 500, partyId: "c1" }),
      E({ kind: "purchase", amount: 4000, paidAmount: 1500, partyId: "s1" }),
      E({ kind: "pay", amount: 1000, partyId: "s1" }),
      E({ kind: "expense", amount: 700, category: "ভাড়া" }),
      E({ kind: "sale", amount: 900, date: "2026-10-31" }),
    ];
    assert.equal(paidOf(entries[1]), 1000);
    assert.equal(creditOf(entries[1]), 2000);
    const bal = Object.fromEntries(partyBalances(parties, entries).map((b) => [b.party.id, b.balance]));
    assert.deepEqual([bal.c1, bal.c2, bal.s1], [1500, 2000, 1500]);
    const m = shopSummary(entries, parties, "2026-11-01", "2026-11-30");
    assert.equal(m.sales, 10000);
    assert.equal(m.profit, 10000 - 4000 - 700);
    assert.equal(m.cash, 5000 + 1000 + 500 - 1500 - 1000 - 700 + 900);
    assert.equal(m.customerDue, 3500);
    assert.equal(m.supplierDue, 1500);
    const pm = new Map(parties.map((p) => [p.id, p]));
    assert.ok(shopEntryValid(entries[1], pm));
    assert.ok(!shopEntryValid(E({ kind: "sale", amount: 100, paidAmount: 0 }), pm));
    assert.ok(!shopEntryValid(E({ kind: "receive", amount: 100, partyId: "s1" }), pm));
    assert.ok(!shopEntryValid(E({ kind: "sale", amount: 100, paidAmount: 200, partyId: "c1" }), pm));
    assert.equal(parseAmountOrZero(""), 0);
    assert.equal(parseAmountOrZero("০"), 0);
    assert.equal(parseAmountOrZero("abc"), null);
  });
  await ok("দোকানের ডেটা ব্যাকআপে যায়-ফেরে; অবৈধ এন্ট্রি প্রত্যাখ্যাত; পুরনো ব্যাকআপ চলে", async () => {
    await eraseAllData();
    const now = Date.now();
    await db.shopParties.bulkAdd([
      { id: "p1", name: "রহিম", kind: "customer", phone: "01700000000", createdAt: now, updatedAt: now },
      { id: "p2", name: "সরবরাহকারী", kind: "supplier", createdAt: now, updatedAt: now },
    ]);
    await db.shopEntries.bulkAdd([
      { id: "se1", kind: "sale", amount: 300000, paidAmount: 100000, partyId: "p1", date: "2026-11-02", createdAt: now },
      { id: "se2", kind: "expense", amount: 50000, category: "দোকান ভাড়া", date: "2026-11-02", createdAt: now },
    ]);
    const text6 = JSON.stringify(await buildBackup());
    await eraseAllData();
    assert.equal(await db.shopEntries.count(), 0);
    await restoreBackup(validateBackupText(text6));
    assert.equal(await db.shopParties.count(), 2);
    assert.equal(await db.shopEntries.count(), 2);
    const bad = JSON.parse(text6);
    bad.data.shopEntries[0].partyId = "p2"; // বিক্রিতে সরবরাহকারী — ভুল ধরন
    assert.throws(() => validateBackupText(JSON.stringify(bad)), (e: unknown) => e instanceof BackupError);
    const bad2 = JSON.parse(text6);
    bad2.data.shopEntries[0].paidAmount = 999999999; // মোটের বেশি নগদ
    assert.throws(() => validateBackupText(JSON.stringify(bad2)), (e: unknown) => e instanceof BackupError);
    const old = JSON.parse(text6);
    delete old.data.shopParties;
    delete old.data.shopEntries;
    assert.deepEqual(validateBackupText(JSON.stringify(old)).data.shopEntries, []);
    await eraseAllData();
  });

  console.log("এনক্রিপ্টেড ব্যাকআপ");
  await ok("এনক্রিপ্ট/ডিক্রিপ্ট; ভুল পাসওয়ার্ড ও বদলানো ফাইল প্রত্যাখ্যাত", async () => {
    const plain = JSON.stringify({ a: "বাংলা ✓", n: 1 });
    const e = await encryptText(plain, "পাসওয়ার্ড-১২৩");
    assert.ok(isEncryptedBackupText(e) && !isEncryptedBackupText(plain));
    assert.ok(!e.includes("বাংলা"));
    assert.equal(await decryptText(e, "পাসওয়ার্ড-১২৩"), plain);
    await assert.rejects(decryptText(e, "ভুল-পাসওয়ার্ড"), (x: unknown) => x instanceof DecryptError && x.code === "wrong");
    const o = JSON.parse(e);
    const bytes = Buffer.from(o.data, "base64");
    bytes[3] ^= 1;
    o.data = bytes.toString("base64");
    await assert.rejects(decryptText(JSON.stringify(o), "পাসওয়ার্ড-১২৩"), (x: unknown) => x instanceof DecryptError && x.code === "wrong");
    await assert.rejects(decryptText("{}", "x"), (x: unknown) => x instanceof DecryptError && x.code === "invalid");
  });
  await ok("এনক্রিপ্টেড ব্যাকআপ থেকে রিস্টোর; সাধারণ ইম্পোর্ট এটি নেয় না", async () => {
    await eraseAllData();
    await db.transactions.add({ ...tx({ amount: 4242 }), id: "enc1", description: "গোপন-বিবরণ" });
    const text4 = await (await encryptedBackupBlob(await buildBackup(), "secret-pass-1")).text();
    assert.ok(isEncryptedBackupText(text4));
    assert.ok(!text4.includes("গোপন-বিবরণ"));
    await eraseAllData();
    await restoreBackup(validateBackupText(await decryptText(text4, "secret-pass-1")));
    assert.equal((await db.transactions.get("enc1"))?.amount, 4242);
    assert.throws(() => validateBackupText(text4), (e: unknown) => e instanceof BackupError);
  });

  console.log(`\nসম্পন্ন: ${n} টি পরীক্ষা চলেছে`, process.exitCode ? "— ব্যর্থতা আছে ✗" : "— সব পাস ✓");
})();
