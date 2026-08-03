import type { Metadata } from "next";
import Landing from "./landing";
import {
  buildPageMetadata,
  jsonLdScript,
  organizationJsonLd,
  pricingProductJsonLd,
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
          pricingProductJsonLd(),
        ])}
      />
      <Landing showTitlePhase={false} showActions={false} />
    </>
  );
}
