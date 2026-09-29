import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdelTe — by AdelTe Industries",
  description: "AdelTe: flagship online-first intelligent assistant. Search intelligently. Analyze carefully. Act safely."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
