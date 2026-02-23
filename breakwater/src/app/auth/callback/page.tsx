"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = React.useState("Completing sign-in…");

  React.useEffect(() => {
    const supabase = supabaseBrowser();

    async function run() {
      // Supabase may return info in the URL hash fragment (#...)
      const hash = window.location.hash?.startsWith("#")
        ? window.location.hash.slice(1)
        : "";

      const hashParams = new URLSearchParams(hash);

      const error = hashParams.get("error");
      const errorCode = hashParams.get("error_code");
      const errorDescription = hashParams.get("error_description");

      if (error) {
        setMessage(
          `Auth error: ${errorCode ?? error}\n${decodeURIComponent(
            errorDescription ?? ""
          )}`
        );
        return;
      }

      // If Supabase returns tokens in the hash, set the session client-side
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");

      if (access_token && refresh_token) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (setErr) {
          setMessage(`Auth error: ${setErr.message}`);
          return;
        }

        router.replace("/onboarding");
        return;
      }

      // If not hash tokens, try normal session (code flow handled by route.ts)
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/onboarding");
        return;
      }

      setMessage("Auth error: missing params (please request a new link).");
    }

    run();
  }, [router]);

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-serif">Breakwater</h1>
        <p className="mt-4 whitespace-pre-wrap opacity-80">{message}</p>
      </div>
    </main>
  );
}
