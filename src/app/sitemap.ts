import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const siteUrl = "https://tasklaunch.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date("2026-03-20"),
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/about`,
      lastModified: new Date("2026-05-16"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
