import "./globals.css";
import { serifStack, IVORY, inkSoft } from "@/lib/style";

export const metadata = {
  title: "Breakwater",
  description: "A quiet ledger for recurring spend.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          background: IVORY,
          fontFamily: serifStack,
          color: inkSoft,
        }}
      >
        {children}
      </body>
    </html>
  );
}
