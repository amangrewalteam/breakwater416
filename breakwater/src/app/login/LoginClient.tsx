"use client";

import { useSearchParams } from "next/navigation";

export default function LoginClient() {
  const searchParams = useSearchParams();

  const error = searchParams.get("error");
  const next = searchParams.get("next") ?? "/dashboard";

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Login</h1>

      {error ? (
        <p style={{ marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      {/* TODO: Replace this placeholder with your actual login UI */}
      <p style={{ marginBottom: 12 }}>
        After login, redirect to: <code>{next}</code>
      </p>
    </div>
  );
}
