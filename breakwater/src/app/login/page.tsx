import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-serif">Breakwater</h1>
        <p className="mt-2 opacity-80">
          We’ll email you a quiet link. No passwords.
        </p>

        <div className="mt-10">
          <LoginClient />
        </div>
      </div>
    </main>
  );
}
