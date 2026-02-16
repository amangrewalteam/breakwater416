import { IVORY, ink, inkSoft, line } from "@/lib/style";

export default function Shell({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: IVORY }}>
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "48px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: ink, fontSize: 28, letterSpacing: -0.2 }}>
              {title}
            </div>
            {subtitle ? (
              <div style={{ color: inkSoft, marginTop: 6, maxWidth: 560 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          {right}
        </div>

        <div
          style={{
            marginTop: 24,
            borderTop: `1px solid ${line}`,
            paddingTop: 20,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
