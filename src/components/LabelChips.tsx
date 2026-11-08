"use client";

/** খাতের নামের দ্রুত বাছাই: তৈরি নাম + আগে ব্যবহার করা নিজের লেখা নাম। চাপলে ঘরে বসে যায়, নিজেও লেখা যায়। */
export function LabelChips({ presets, saved, onPick }: { presets: string[]; saved: string[]; onPick: (label: string) => void }) {
  const all = [...presets, ...saved.filter((s) => !presets.includes(s))];
  if (all.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((s) => (
        <button key={s} type="button" onClick={() => onPick(s)} className="min-h-11 rounded-full bg-soft px-4 text-sm font-semibold">
          {s}
        </button>
      ))}
    </div>
  );
}

/** আগের এন্ট্রিগুলো থেকে নিজের লেখা (তৈরি নামের বাইরে) ভিন্ন নাম, নতুনটি আগে, সর্বোচ্চ limit টি */
export function savedLabels(rows: { label?: string; at: number }[], presets: string[], limit = 8): string[] {
  const seen = new Set<string>(presets);
  const out: string[] = [];
  for (const r of [...rows].sort((a, b) => b.at - a.at)) {
    const s = r.label?.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
