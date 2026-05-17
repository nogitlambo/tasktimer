import type { Metadata, Viewport } from "next";
import { Orbitron } from "next/font/google";
import TelemetryBootstrap from "./TelemetryBootstrap";
import ThemeBootstrap from "./ThemeBootstrap";
import { canonicalUrl, seoConfig } from "./seo";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(seoConfig.siteUrl),
  title: {
    default: seoConfig.defaultTitle,
    template: seoConfig.titleTemplate,
  },
  description: seoConfig.defaultDescription,
  applicationName: seoConfig.appName,
  alternates: {
    canonical: canonicalUrl("/"),
  },
  openGraph: {
    title: seoConfig.defaultTitle,
    description: seoConfig.defaultDescription,
    url: seoConfig.siteUrl,
    siteName: seoConfig.appName,
    type: "website",
    images: [
      {
        url: seoConfig.ogImagePath,
        width: 1200,
        height: 630,
        alt: "TaskLaunch neurodivergent-friendly productivity app preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: seoConfig.defaultTitle,
    description: seoConfig.defaultDescription,
    images: [seoConfig.twitterImagePath],
  },
  icons: {
    icon: [
      { url: seoConfig.logoPath, type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={orbitron.variable}>
      <body
        suppressHydrationWarning
        className="antialiased"
      >
        <ThemeBootstrap />
        <TelemetryBootstrap />
        {children}
      </body>
    </html>
  );
}
