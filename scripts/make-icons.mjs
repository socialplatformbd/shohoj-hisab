// আইকন তৈরি: node scripts/make-icons.mjs  (sharp ব্যবহার করে SVG → PNG)
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#047857"/></linearGradient></defs>`;
const art = `
<rect x="96" y="168" width="320" height="226" rx="40" fill="#fff"/>
<path d="M96 208c0-22 18-40 40-40h200c22 0 40 18 40 40v14H96z" fill="#a7f3d0"/>
<rect x="318" y="262" width="126" height="76" rx="38" fill="#047857"/>
<circle cx="356" cy="300" r="14" fill="#fde68a"/>
<rect x="140" y="258" width="26" height="86" rx="8" fill="#10b981"/>
<rect x="182" y="232" width="26" height="112" rx="8" fill="#059669"/>
<rect x="224" y="282" width="26" height="62" rx="8" fill="#34d399"/>
<circle cx="400" cy="152" r="52" fill="#fbbf24"/>
<circle cx="400" cy="152" r="38" fill="none" stroke="#b45309" stroke-width="8"/>
<path d="M382 152l12 13 24-28" fill="none" stroke="#b45309" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`;

const standard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<rect width="512" height="512" rx="112" fill="url(#g)"/>${art}</svg>`;
// maskable: পুরো বর্গ ভরা ব্যাকগ্রাউন্ড, ছবি মাঝখানে ~৭০% (safe zone-এর ভেতরে)
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<rect width="512" height="512" fill="url(#g)"/><g transform="translate(256 256) scale(0.68) translate(-256 -256)">${art}</g></svg>`;

writeFileSync("public/icon.svg", standard);
const jobs = [
  [standard, 192, "public/icon-192.png"],
  [standard, 512, "public/icon-512.png"],
  [standard, 180, "public/apple-touch-icon.png"],
  [maskable, 512, "public/icon-maskable-512.png"],
];
for (const [svg, size, out] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log("wrote", out);
}
