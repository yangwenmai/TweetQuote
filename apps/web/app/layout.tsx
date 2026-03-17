import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TweetQuote",
  description: "上下文优先的引用链编辑与成图工具。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
