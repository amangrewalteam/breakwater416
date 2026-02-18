import React from "react";
import { serifStack, IVORY, inkSoft } from "@/lib/style";

export const metadata = {
  title: "Breakwater",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: IVORY,
          color: inkSoft,
          fontFamily: serifStack,
        }}
      >
        {children}
      </body>
    </html>
  );
}
