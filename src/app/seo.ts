import type { Metadata } from "next";

export const seoConfig = {
  appName: "TaskLaunch",
  siteUrl: "https://tasklaunch.app",
  defaultTitle: "TaskLaunch | Neurodivergent-Friendly Productivity App",
  titleTemplate: "%s | TaskLaunch",
  defaultDescription:
    "TaskLaunch is a neurodivergent-friendly productivity app for ADHD, executive dysfunction, flexible task management, timers, and sustainable momentum.",
  shortDescription:
    "Flexible task management for neurodivergent minds, ADHD workflows, executive dysfunction, and sustainable momentum.",
  logoPath: "/logo/launch-icon-original-transparent.png",
  appIconPath: "/logo/mobile-app-icon-dark-grey-1024.png",
  ogImagePath: "/opengraph-image/",
  twitterImagePath: "/twitter-image/",
  supportEmail: "support@tasklaunch.app",
  publicRoutes: [
    { path: "/", changeFrequency: "weekly" as const, priority: 1 },
    { path: "/pricing/", changeFrequency: "weekly" as const, priority: 0.8 },
    { path: "/about/", changeFrequency: "monthly" as const, priority: 0.6 },
    { path: "/privacy/", changeFrequency: "yearly" as const, priority: 0.4 },
  ],
};

export function absoluteUrl(path = "/") {
  return new URL(path, seoConfig.siteUrl).toString();
}

export function canonicalUrl(path = "/") {
  if (path === "/") return absoluteUrl("/");
  const normalizedPath = path.endsWith("/") ? path : `${path}/`;
  return absoluteUrl(normalizedPath);
}

export function buildPageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
}): Metadata {
  const canonical = canonicalUrl(path);

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: seoConfig.appName,
      type: "website",
      images: [
        {
          url: seoConfig.ogImagePath,
          width: 1200,
          height: 630,
          alt: `${seoConfig.appName} productivity app preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [seoConfig.twitterImagePath],
    },
  };
}

export function jsonLdScript(schema: unknown) {
  return {
    __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${seoConfig.siteUrl}/#organization`,
    name: seoConfig.appName,
    url: seoConfig.siteUrl,
    logo: absoluteUrl(seoConfig.logoPath),
    email: seoConfig.supportEmail,
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${seoConfig.siteUrl}/#website`,
    name: seoConfig.appName,
    url: seoConfig.siteUrl,
    publisher: {
      "@id": `${seoConfig.siteUrl}/#organization`,
    },
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${seoConfig.siteUrl}/#software`,
    name: seoConfig.appName,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, Android",
    url: seoConfig.siteUrl,
    image: absoluteUrl(seoConfig.ogImagePath),
    description: seoConfig.defaultDescription,
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        url: canonicalUrl("/pricing/"),
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "3.99",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "3.99",
          priceCurrency: "USD",
          billingDuration: "P1M",
        },
        url: canonicalUrl("/pricing/"),
      },
    ],
  };
}

export function pricingProductJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${seoConfig.siteUrl}/pricing/#product`,
    name: `${seoConfig.appName} plans`,
    brand: {
      "@type": "Brand",
      name: seoConfig.appName,
    },
    category: "Productivity software",
    description:
      "TaskLaunch plans for flexible task management, session history, dashboards, AI-guided workflow optimisation, manual history entry, friends, and task sharing.",
    image: absoluteUrl(seoConfig.ogImagePath),
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "0",
      highPrice: "3.99",
      priceCurrency: "USD",
      offerCount: 2,
      offers: [
        {
          "@type": "Offer",
          name: "Free",
          price: "0",
          priceCurrency: "USD",
          url: canonicalUrl("/pricing/"),
        },
        {
          "@type": "Offer",
          name: "Pro",
          price: "3.99",
          priceCurrency: "USD",
          url: canonicalUrl("/pricing/"),
          description: "Pro productivity features with a 7-day free trial.",
        },
      ],
    },
  };
}
