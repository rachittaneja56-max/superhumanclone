import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Sans } from "next/font/google";
import { headers } from "next/headers";
import { TRPCProvider } from "@/components/trpc-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tempo",
  description: "AI-powered Gmail + Calendar client built on Corsair",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
