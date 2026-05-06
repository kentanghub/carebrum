import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cerebrum — Multi-Agent Research System",
  description:
    "A sophisticated multi-agent research system powered by advanced AI models. Orchestrates collaborative AI agents to perform autonomous deep-dive research and produce publication-quality reports.",
  keywords: [
    "AI research",
    "multi-agent",
    "MiMo",
    "Xiaomi",
    "research automation",
    "chain-of-thought",
  ],
  authors: [{ name: "Cerebrum" }],
  openGraph: {
    title: "Cerebrum — Multi-Agent Research System",
    description:
      "Orchestrate collaborative AI agents for autonomous deep-dive research",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-[#030308] text-gray-200">
        {children}
      </body>
    </html>
  );
}
