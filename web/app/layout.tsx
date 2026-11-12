import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Webstone",
  description: "Compare browser and search performance across web retrieval, content extraction and trajectory replay benchmarks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
