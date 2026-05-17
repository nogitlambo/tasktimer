import type { Metadata, Viewport } from "next";
import { Orbitron } from "next/font/google";
import TelemetryBootstrap from "./TelemetryBootstrap";
import ThemeBootstrap from "./ThemeBootstrap";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  display: "swap",
});

const siteTitle = "Flexible Task Management";
const siteDescription = "Break free from guilt-driven productivity systems.";
const launchIcon = "/logo/launch-icon-original-transparent.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://tasklaunch.app"),
  title: {
    default: siteTitle,
    template: "%s | TaskLaunch",
  },
  description: siteDescription,
  applicationName: "TaskLaunch",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "https://tasklaunch.app",
    siteName: "TaskLaunch",
    type: "website",
    images: [
      {
        url: launchIcon,
        width: 485,
        height: 442,
        alt: "TaskLaunch",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
    images: [launchIcon],
  },
  icons: {
    icon: [
      { url: launchIcon, type: "image/png" },
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
