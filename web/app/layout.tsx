import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Browser Eval — 浏览器评测结果",
  description: "真实数据，透明比较。查看浏览器在网页获取与正文提取上的表现。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
