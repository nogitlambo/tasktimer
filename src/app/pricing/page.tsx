import type { Metadata } from "next";
import Link from "next/link";
import AppImg from "@/components/AppImg";
import { buildPageMetadata, jsonLdScript, pricingProductJsonLd, softwareApplicationJsonLd } from "../seo";
import PricingSection from "./PricingSection";

export const metadata: Metadata = buildPageMetadata({
  title: "Pricing",
  description:
    "Compare TaskLaunch Free and Pro plans for neurodivergent-friendly task tracking, flexible productivity, AI-guided workflow insights, and advanced history.",
  path: "/pricing/",
});

export default function PricingPage() {
  return (
    <main className="landingV2 pricingPageV2">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([softwareApplicationJsonLd(), pricingProductJsonLd()])}
      />
      <div className="landingV2Shell">
        <header className="landingV2Header isVisible">
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/tasklaunch-logo.webp" alt="" className="landingHeaderLogo" />
          </Link>

          <nav className="landingV2Nav" aria-label="Pricing navigation" />

          <div className="landingV2HeaderActions">
            <Link href="/" className="landingV2HeaderLink">
              Home
            </Link>
            <Link href="/login" className="landingV2LoginLink">
              Login
            </Link>
          </div>
        </header>

        <div className="pricingPageV2Main">
          <PricingSection mode="page" />
        </div>
      </div>
    </main>
  );
}
