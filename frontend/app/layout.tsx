import type { Metadata } from "next";
import { Black_Ops_One, Saira } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const blackOpsOne = Black_Ops_One({
  weight: "400",
  variable: "--font-black-ops-one",
  subsets: ["latin"],
});

const saira = Saira({
  variable: "--font-saira",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AURA — Automated Unit Resource Allocation",
  description:
    "Privacy-first federated learning across 30 decentralized hospital nodes for ICU capacity forecasting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${blackOpsOne.variable} ${saira.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
