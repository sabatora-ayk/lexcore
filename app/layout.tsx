import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LexCore",
  description: "一次情報を、あなたが判断できる形に。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
