import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TweetQuote",
  description: "把 Twitter / X 的引用链一键抓取、翻译注释、导出为高清长图。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
