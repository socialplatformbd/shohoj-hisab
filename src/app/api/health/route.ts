export const dynamic = "force-dynamic";

/**
 * অ্যাপের হিসাব IndexedDB-তে থাকে, সার্ভারে ডেটাবেস লাগে না।
 * তাই DATABASE_URL না থাকলেও এই রুট সচল থাকে; থাকলে তবেই ডেটাবেস যাচাই হয়।
 * (আগে `@/db` সরাসরি ইমপোর্ট ছিল — DATABASE_URL না থাকলে `next build` ভেঙে যেত।)
 */
export async function GET() {
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, db: "not_configured" });
  try {
    const [{ db }, { sql }] = await Promise.all([import("@/db"), import("drizzle-orm")]);
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok" });
  } catch {
    return Response.json({ ok: false, db: "error" }, { status: 500 });
  }
}
