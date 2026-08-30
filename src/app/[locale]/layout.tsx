import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Source_Code_Pro,
  Roboto,
  Open_Sans,
  Noto_Sans,
  Montserrat,
  Lato,
  Poppins,
  Roboto_Condensed,
  Source_Sans_3,
  Oswald,
  Raleway,
} from "next/font/google";
import AppearanceSync from "@/components/AppearanceSync";
import ErrorBoundary from "@/components/ErrorBoundary";
import Toaster from "@/components/Toast";
import { PALETTES } from "@/lib/palettes";
import { routing } from "@/i18n/routing";
import "../globals.css";

const sourceCodePro = Source_Code_Pro({ subsets: ["latin"], variable: "--font-source-code-pro", display: "swap" });
const roboto = Roboto({ subsets: ["latin", "vietnamese"], weight: ["400", "700"], variable: "--font-roboto", display: "swap" });
const openSans = Open_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "700"], variable: "--font-open-sans", display: "swap" });
const notoSans = Noto_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "700"], variable: "--font-noto-sans", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin", "vietnamese"], weight: ["400", "700"], variable: "--font-montserrat", display: "swap" });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-lato", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-poppins", display: "swap" });
const robotoCondensed = Roboto_Condensed({ subsets: ["latin", "vietnamese"], weight: ["400", "700"], variable: "--font-roboto-condensed", display: "swap" });
const sourceSans3 = Source_Sans_3({ subsets: ["latin", "vietnamese"], weight: ["400", "700"], variable: "--font-source-sans-3", display: "swap" });
const oswald = Oswald({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-oswald", display: "swap" });
const raleway = Raleway({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-raleway", display: "swap" });

const fontVariables = [
  sourceCodePro, roboto, openSans, notoSans, montserrat, lato,
  poppins, robotoCondensed, sourceSans3, oswald, raleway,
].map(f => f.variable).join(" ");

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("title"),
    description: t("description"),
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
      shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    },
  };
}

const themeInitScript = `
(function(){try{
  var P = ${JSON.stringify(PALETTES)};
  var t = localStorage.getItem('notes-theme');
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  var pid = localStorage.getItem('notes-palette') || 'default';
  var pal = P.find(function(p){ return p.id === pid; }) || P[0];
  var tokens = pal[t];
  var root = document.documentElement;
  root.setAttribute('data-theme', t);
  root.setAttribute('data-palette', pal.id);
  for (var k in tokens) { root.style.setProperty('--' + k, tokens[k]); }
}catch(e){
  document.documentElement.setAttribute('data-theme', 'dark');
}})();
`;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <AppearanceSync locale={locale} />
        <NextIntlClientProvider>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
