import type { MetadataRoute } from "next";
import { canonicalUrl, seoConfig } from "./seo";

export const dynamic = "force-static";

const lastModifiedByPath: Record<string, Date> = {
  "/": new Date(),
  "/pricing/": new Date(),
  "/about/": new Date("2026-05-16"),
  "/privacy/": new Date("2026-04-21"),
};

export default function sitemap(): MetadataRoute.Sitemap {
  return seoConfig.publicRoutes.map((route) => ({
    url: canonicalUrl(route.path),
    lastModified: lastModifiedByPath[route.path] || new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
