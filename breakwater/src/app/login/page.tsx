import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-4xl font-serif">Breakwater</h1>
            <p className="mt-2 opacity-80">
              A quiet ledger for recurring spend. Connect once, see what returns.
            </p>
          </div>
        </div>

        <div className="mt-10">
          <LoginClient />
        </div>
      </div>
    </main>
  );
}
