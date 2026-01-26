import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/store/store";
import ReminderProvider from "@/components/ReminderProvider";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcuts";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jaime's Dashboard",
  description: "Your personal command center for focused productivity",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <AppProvider>
            <KeyboardShortcutsProvider>
              <ReminderProvider>{children}</ReminderProvider>
            </KeyboardShortcutsProvider>
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
