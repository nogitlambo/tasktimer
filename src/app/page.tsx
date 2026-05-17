import type { Metadata } from "next";
import HomePageClient from "./HomePageClient";
import {
  buildPageMetadata,
  jsonLdScript,
  organizationJsonLd,
  seoConfig,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "./seo";

export const metadata: Metadata = buildPageMetadata({
  title: seoConfig.defaultTitle,
  description: seoConfig.defaultDescription,
  path: "/",
  absoluteTitle: true,
});

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          organizationJsonLd(),
          websiteJsonLd(),
          softwareApplicationJsonLd(),
        ])}
      />
      <HomePageClient />
    </>
  );
}
