import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";
import { MessagesProvider } from "@/lib/i18n/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const m = getMessages(await resolveLocale());
  return {
    title: m.meta.title,
    description: m.meta.description,
    icons: { icon: "/icon.svg" },
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await resolveLocale();
  const messages = getMessages(locale);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <script
          // Set the theme class before paint to avoid a flash, honouring an
          // explicit choice in localStorage, else the OS preference.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
        <MessagesProvider locale={locale} messages={messages}>
          {children}
        </MessagesProvider>
      </body>
    </html>
  );
}
