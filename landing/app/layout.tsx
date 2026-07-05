import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";
import { MessagesProvider } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const m = getMessages(locale);
  const title = `${SITE_NAME} — ${m.meta.tagline}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s · ${SITE_NAME}`,
    },
    description: m.meta.description,
    applicationName: SITE_NAME,
    keywords: [
      "App Builder",
      "KI App Builder",
      "Webseite erstellen mit KI",
      "Web-App generieren",
      "No-Code",
      "AI website builder",
      "Lovable Alternative",
      "self-hosted",
    ],
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: m.meta.ogLocale,
      url: SITE_URL,
      siteName: SITE_NAME,
      title,
      description: m.meta.description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: m.meta.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    category: "technology",
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Structured data (GEO/SEO): lets search and AI answer engines understand the
// product, the brand, and the site as connected entities.
function buildJsonLd(locale: Locale, description: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        inLanguage: locale,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const jsonLd = buildJsonLd(locale, messages.meta.description);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <script
          // Set the theme class before paint to avoid a flash. Honours an explicit
          // choice in localStorage, else falls back to the OS preference.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <MessagesProvider locale={locale} messages={messages}>
          {children}
        </MessagesProvider>
      </body>
    </html>
  );
}
