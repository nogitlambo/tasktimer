import type { Metadata } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

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
        className={`${orbitron.className} ${geistSans.variable} ${geistMono.variable} ${orbitron.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
