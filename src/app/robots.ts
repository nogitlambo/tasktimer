import type { MetadataRoute } from "next";
import { absoluteUrl } from "./seo";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/privacy", "/about"],
        disallow: [
          "/account",
          "/arcade",
          "/dashboard",
          "/feedback",
          "/firebase-messaging-sw.js",
          "/friends",
          "/history-manager",
          "/leaderboard",
          "/leaderboards",
          "/settings",
          "/signed-out",
          "/tasklaunch",
          "/web-sign-in",
          "/api",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
