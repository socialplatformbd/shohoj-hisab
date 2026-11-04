import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * কনটেন্ট সিকিউরিটি পলিসি (শুধু প্রোডাকশনে — ডেভ মোডে Next.js-এর `eval` লাগে)।
 * অ্যাপ শুধু নিজের ডোমেইন থেকে স্ক্রিপ্ট/ডেটা নেয়; অন্য সাইটে ডেটা পাঠানো, ফ্রেমে ঢোকানো ও প্লাগইন বন্ধ।
 * 'unsafe-inline' Next.js-এর নিজস্ব ইনলাইন স্ক্রিপ্টের জন্য দরকার।
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
