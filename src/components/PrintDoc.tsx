"use client";

import { Printer } from "lucide-react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useApp } from "./AppProvider";

export type PrintBlock =
  | { type: "kv"; heading?: string; rows: [string, string][] }
  | { type: "table"; heading?: string; head: string[]; rows: string[][]; right?: number[] };

const noop = () => () => {};

/**
 * ছাপার (PDF) জন্য রিপোর্ট। পর্দায় দেখা যায় না; "প্রিন্ট" চাপলে শুধু এটিই ছাপা হয় (globals.css-এর @media print)।
 * অ্যান্ড্রয়েডে প্রিন্ট পর্দায় "PDF হিসেবে সেভ" বেছে নিলেই PDF হয়।
 */
export function PrintDoc({ title, subtitle, blocks }: { title: string; subtitle?: string; blocks: PrintBlock[] }) {
  const { t, date } = useApp();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div className="print-root">
      <h1>{title}</h1>
      {subtitle && <p className="print-sub">{subtitle}</p>}
      {blocks.map((b, i) => (
        <section key={i}>
          {b.heading && <h2>{b.heading}</h2>}
          {b.type === "kv" ? (
            <table className="print-kv">
              <tbody>
                {b.rows.map(([k, v], j) => (
                  <tr key={j}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  {b.head.map((h, j) => (
                    <th key={j} className={b.right?.includes(j) ? "r" : undefined}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k} className={b.right?.includes(k) ? "r" : undefined}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
      <p className="print-foot">{t("printedOn", { d: date(new Date().toISOString().slice(0, 10)) })}</p>
    </div>,
    document.body,
  );
}

export function PrintButton() {
  const { t, toast } = useApp();
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => {
        toast(t("printToast"), "info");
        window.setTimeout(() => window.print(), 400);
      }}
    >
      <Printer className="h-4 w-4" />
      {t("printPdf")}
    </button>
  );
}
