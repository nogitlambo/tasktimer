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

export const metadata: Metadata = {
  metadataBase: new URL("https://tasklaunch.app"),
  title: {
    default: "TaskLaunch",
    template: "%s | TaskLaunch",
  },
  description: "TaskLaunch helps you track tasks, focus time, progress history, and productivity in one place.",
  applicationName: "TaskLaunch",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "TaskLaunch",
    description: "TaskLaunch helps you track tasks, focus time, progress history, and productivity in one place.",
    url: "https://tasklaunch.app",
    siteName: "TaskLaunch",
    type: "website",
    images: [
      {
        url: "/logo/tasklaunch-logo-v2.png",
        width: 1868,
        height: 422,
        alt: "TaskLaunch",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TaskLaunch",
    description: "TaskLaunch helps you track tasks, focus time, progress history, and productivity in one place.",
    images: ["/logo/tasklaunch-logo-v2.png"],
  },
  icons: {
    icon: "/favicon.png",
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
