import type { MetadataRoute } from "next";
import { absoluteUrl, seoConfig } from "./seo";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: seoConfig.defaultTitle,
    short_name: seoConfig.appName,
    description: seoConfig.defaultDescription,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0d0f13",
    theme_color: "#00e5ff",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: seoConfig.appIconPath,
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: absoluteUrl("/landing_feature_wide-1440.webp"),
        sizes: "1440x810",
        type: "image/webp",
        form_factor: "wide",
        label: "TaskLaunch productivity dashboard preview",
      },
    ],
  };
}
