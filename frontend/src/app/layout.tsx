import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { ThemeInit } from "@/components/theme-init";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Nexus Gateway LLM Shield",
  description: "Enterprise SaaS for LLM Prompt Injection detection and secure document gateway.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} h-full`}>
      <body className="min-h-full antialiased">
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}

