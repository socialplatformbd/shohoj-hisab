import { NextResponse } from "next/server";
import { AiRequestSchema, ExtractResponseSchema } from "@/lib/aiSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI প্রক্সি। API কী শুধু সার্ভারের environment variable-এ থাকে (ব্রাউজারে কখনো যায় না)।
 * এই রুট কোনো ডেটাবেসে লেখে না এবং ব্যবহারকারীর ডেটা সংরক্ষণও করে না।
 *
 * পরিবেশ ভেরিয়েবল:
 *   AI_API_KEY   (আবশ্যক)   — OpenAI-সামঞ্জস্যপূর্ণ API কী
 *   AI_BASE_URL  (ঐচ্ছিক)   — ডিফল্ট https://api.openai.com/v1
 *   AI_MODEL     (ঐচ্ছিক)   — ডিফল্ট gpt-4o-mini
 */

const hits = new Map<string, { n: number; reset: number }>();
const GLOBAL_PER_MIN = 120; // X-Forwarded-For নকল করে প্রতি-IP সীমা এড়ানো গেলেও মোট খরচ সীমিত থাকে
let globalHits = { n: 0, reset: 0 };
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (globalHits.reset < now) globalHits = { n: 0, reset: now + 60_000 };
  globalHits.n += 1;
  if (globalHits.n > GLOBAL_PER_MIN) return true;
  // মেমরি যেন অনির্দিষ্টভাবে না বাড়ে: মেয়াদ-শেষ এন্ট্রি ঝেড়ে ফেলি
  if (hits.size > 500) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const e = hits.get(ip);
  if (!e || e.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  e.n += 1;
  return e.n > 20;
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

async function callModel(messages: { role: string; content: string }[], json: boolean): Promise<string> {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("not_configured");
  const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty");
  return content;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  if (!process.env.AI_API_KEY) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let parsedReq;
  try {
    const raw = await req.text();
    if (raw.length > 60_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
    parsedReq = AiRequestSchema.safeParse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!parsedReq.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const body = parsedReq.data;

  try {
    if (body.mode === "extract") {
      const cats = body.categories.map((c) => `${c.id} | ${c.type} | ${c.name}`).join("\n");
      const system = [
        "You extract personal income/expense transactions from Bengali (or English) text for a bookkeeping app.",
        "Return ONLY a JSON object: {\"items\":[{\"type\":\"income\"|\"expense\",\"title\":string,\"amount\":number,\"categoryId\":string|null,\"date\":\"YYYY-MM-DD\"|null}]}.",
        "Rules:",
        "- Only include amounts that are explicitly written in the text. Never invent, guess or add transactions or amounts.",
        "- amount is a plain positive number in Taka (convert Bengali digits to normal digits). No currency symbols.",
        "- title is a short Bengali label for what the money was for, like \"বাজার\", \"রিকশা ভাড়া\", \"দুপুরের খাবার\".",
        "- type is \"expense\" unless the text clearly says money was received/earned.",
        "- categoryId must be exactly one id from the category list that matches the type, or null if unsure.",
        `- Today is ${body.today} (Asia/Dhaka). Resolve words like আজ/গতকাল to a YYYY-MM-DD date; use null when no date is implied.`,
        "- If there is nothing to extract return {\"items\":[]}.",
        "Categories (id | type | name):",
        cats,
      ].join("\n");
      const content = await callModel(
        [
          { role: "system", content: system },
          { role: "user", content: body.text },
        ],
        true,
      );
      let json: unknown;
      try {
        json = JSON.parse(stripFences(content));
      } catch {
        return NextResponse.json({ error: "bad_output" }, { status: 502 });
      }
      const checked = ExtractResponseSchema.safeParse(json);
      if (!checked.success) return NextResponse.json({ error: "bad_output" }, { status: 502 });
      return NextResponse.json({ items: checked.data.items });
    }

    const system = [
      body.lang === "bn" ? "তুমি 'সহজ হিসাব' অ্যাপের বাংলা আর্থিক সহকারী। সহজ ও ছোট বাংলায় উত্তর দাও।" : "You are the financial assistant of the 'Shohoj Hisab' app. Answer briefly in simple English.",
      "You are given FACTS as JSON, computed by the app from the user's own records. Answer ONLY from these FACTS.",
      "Never invent numbers or transactions. If the FACTS do not contain the answer, say you do not have that data.",
      "Copy money amounts exactly as written in FACTS (they are already formatted). Do not do new arithmetic beyond trivial comparisons.",
      "For budget advice, base suggestions only on the FACTS (spending patterns, category shares, existing budgets) and keep them practical.",
      "You cannot change or save any data; never claim that you did.",
      `FACTS: ${body.facts}`,
    ].join("\n");
    const answer = await callModel(
      [
        { role: "system", content: system },
        { role: "user", content: body.question },
      ],
      false,
    );
    return NextResponse.json({ answer: answer.trim().slice(0, 4000) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_configured") return NextResponse.json({ error: "not_configured" }, { status: 503 });
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return NextResponse.json({ error: "timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
