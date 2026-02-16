import Link from "next/link";
import Shell from "@/components/Shell";
import { ink, inkSoft, line } from "@/lib/style";

export default function Home() {
  return (
    <Shell
      title="Breakwater"
      subtitle="A quiet ledger for recurring spend. Connect once, see what returns."
      right={
        <Link
          href="/login"
          style={{
            color: ink,
            textDecoration: "none",
            border: `1px solid ${line}`,
            padding: "10px 14px",
            borderRadius: 999,
          }}
        >
          Enter
        </Link>
      }
    >
      <div style={{ display: "grid", gap: 12, maxWidth: 680 }}>
        <div style={{ color: inkSoft }}>
          V1 focuses on one thing: find recurring charges and let you mark them:
          <span style={{ color: ink }}> Track</span>,{" "}
          <span style={{ color: ink }}>Cancel</span>,{" "}
          <span style={{ color: ink }}>Move</span>.
        </div>
        <div style={{ color: inkSoft }}>
          No noise. No gamification. Just the tide line of what keeps coming back.
        </div>
      </div>
    </Shell>
  );
}
