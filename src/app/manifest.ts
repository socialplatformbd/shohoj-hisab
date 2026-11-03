import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "সহজ হিসাব",
    short_name: "সহজ হিসাব",
    description: "বাংলায় ব্যক্তিগত আয়-ব্যয়, বাজেট ও ধার-দেনার হিসাব — অফলাইনে চলে।",
    lang: "bn",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ecfdf5",
    theme_color: "#047857",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "খরচ যোগ করুন", url: "/transactions?add=expense", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "AI হিসাব সহকারী", url: "/ai", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
