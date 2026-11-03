# ফোন থেকে চালানো ও লাইভ করা

1. GitHub-এ নতুন repo বানান → "Code" → Codespaces → Create (Chrome-এ Desktop site চালু রাখুন)।
2. Codespace-এ জিপ আপলোড করে টার্মিনালে:
   unzip -o shohoj-hisab-fixed.zip && rm shohoj-hisab-fixed.zip
   npm install
   npm run typecheck && npm run build
   npm run dev      # PORTS ট্যাবে 3000 খুলে দেখুন
3. কমিট ও পুশ:
   git add . && git commit -m "Shohoj Hisab" && git push
4. vercel.com → GitHub দিয়ে লগইন → Add New Project → repo বেছে Deploy।
   (AI চাইলে Settings → Environment Variables-এ AI_API_KEY দিন, তারপর Redeploy)
5. Vercel-এর লিংক Chrome-এ খুলে ⋮ → "Install app"।
