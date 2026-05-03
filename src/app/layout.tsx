import type { Metadata } from "next";
import ThemeBootstrap from "./ThemeBootstrap";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className="antialiased"
      >
        <ThemeBootstrap />
        {children}
      </body>
    </html>
  );
}
