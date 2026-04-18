import type { Metadata } from "next";
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
  const preHydrationThemeScript = `
    (function() {
      try {
        var keyBase = "taskticker_tasks_v1";
        var theme = String(localStorage.getItem(keyBase + ":theme") || "").trim().toLowerCase();
        var style = String(localStorage.getItem(keyBase + ":menuButtonStyle") || "").trim().toLowerCase();
        var body = document.body;
        if (!body) return;
        if (theme === "purple" || theme === "cyan") {
          body.setAttribute("data-theme", theme);
        } else if (theme === "dark") {
          body.setAttribute("data-theme", "purple");
        } else if (theme === "command") {
          body.setAttribute("data-theme", "cyan");
        }
        if (style === "square" || style === "parallelogram") {
          body.setAttribute("data-control-style", style);
        }
      } catch (_) {}
    })();
  `;

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: preHydrationThemeScript }} />
      </head>
      <body
        suppressHydrationWarning
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
