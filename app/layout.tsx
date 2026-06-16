import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { TRPCProvider } from "@/components/trpc-provider";
import { Toaster } from "sonner";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: "Aethra",
  description: "AI-powered Gmail + Calendar client built on Corsair",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={[
        instrumentSans.variable,
        jetbrainsMono.variable,
        'font-sans antialiased bg-background text-foreground',
      ].join(' ')}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          <TRPCProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </TRPCProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
