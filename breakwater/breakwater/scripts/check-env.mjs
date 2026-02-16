const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PLAID_CLIENT_ID",
  "PLAID_SECRET",
  "PLAID_ENV",
  "NEXT_PUBLIC_APP_URL",
];

const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");

if (missing.length) {
  console.error("\n❌ Missing required env vars:");
  for (const k of missing) console.error(" -", k);
  console.error("\nAdd them in Vercel → Settings → Environment Variables (Production + Preview).\n");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^https?:\/\/.+/.test(url)) {
  console.error(`\n❌ NEXT_PUBLIC_SUPABASE_URL must be a valid http(s) URL. Got: ${url}\n`);
  process.exit(1);
}

console.log("✅ Env looks good.");
