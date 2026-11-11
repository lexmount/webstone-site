import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Browser Eval — Browser and Search Benchmarks",
  description: "Compare browser and search performance across web retrieval, content extraction and trajectory replay benchmarks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
