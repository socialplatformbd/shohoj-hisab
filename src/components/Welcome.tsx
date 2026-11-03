"use client";

import { MessageCircle, Send, ShieldCheck, WifiOff, Languages } from "lucide-react";
import { COMMUNITY_LINKS } from "@/lib/links";
import { useApp } from "./AppProvider";
import { Logo } from "./Logo";

export function Welcome() {
  const { t, updateSetting, lang, toast } = useApp();

  async function cont() {
    try {
      await updateSetting("welcomeDone", true);
    } catch {
      toast(t("dbError"), "error");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-between px-6 py-8 text-center">
      <div className="flex w-full justify-end">
        <button className="chip" onClick={() => updateSetting("language", lang === "bn" ? "en" : "bn")} aria-label={t("language")}>
          <Languages className="mr-1.5 h-4 w-4" />
          {lang === "bn" ? "English" : "বাংলা"}
        </button>
      </div>

      <div className="flex flex-col items-center gap-4">
        <Logo size={112} className="drop-shadow-lg" />
        <h1 className="text-4xl font-extrabold text-emerald-700 dark:text-emerald-400">{t("appName")}</h1>
        <p className="text-base leading-relaxed text-muted">{t("welcomeIntro")}</p>
        <div className="flex flex-wrap justify-center gap-2 text-xs font-medium">
          <span className="flex items-center gap-1 rounded-full bg-soft px-3 py-1.5"><WifiOff className="h-3.5 w-3.5" />{t("welcomeOffline")}</span>
          <span className="flex items-center gap-1 rounded-full bg-soft px-3 py-1.5"><ShieldCheck className="h-3.5 w-3.5" />{t("welcomePrivate")}</span>
          <span className="flex items-center gap-1 rounded-full bg-soft px-3 py-1.5"><Languages className="h-3.5 w-3.5" />{t("welcomeBangla")}</span>
        </div>
      </div>

      <div className="mt-8 flex w-full flex-col gap-3">
        <a href={COMMUNITY_LINKS.whatsapp} target="_blank" rel="noopener noreferrer" className="btn w-full bg-[#25D366] text-black hover:brightness-95">
          <MessageCircle className="h-5 w-5" />
          {t("joinWhatsapp")}
        </a>
        <a href={COMMUNITY_LINKS.telegram} target="_blank" rel="noopener noreferrer" className="btn w-full bg-[#229ED9] text-white hover:brightness-95">
          <Send className="h-5 w-5" />
          {t("joinTelegram")}
        </a>
        <p className="text-xs text-muted">{t("welcomeOptional")}</p>
        <button className="btn btn-primary mt-1 w-full text-lg" onClick={cont}>
          {t("continueToApp")}
        </button>
        <p className="mt-2 text-sm font-semibold text-muted">{t("madeBy")}</p>
      </div>
    </main>
  );
}
