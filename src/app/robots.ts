import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/privacy"],
        disallow: [
          "/dashboard",
          "/feedback",
          "/friends",
          "/history-manager",
          "/leaderboard",
          "/playwright-auth-helper",
          "/settings",
          "/signed-out",
          "/tasklaunch",
          "/web-sign-in",
          "/api",
        ],
      },
    ],
    sitemap: "https://tasklaunch.app/sitemap.xml",
    host: "https://tasklaunch.app",
  };
}
