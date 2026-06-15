import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PersonFinder AI — Attribute-Based Person Retrieval",
  description: "Upload surveillance footage, describe a person by visual attributes, and find where they appear.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}