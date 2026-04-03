import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaskLaunch",
  description: "A smarter task management app",
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
