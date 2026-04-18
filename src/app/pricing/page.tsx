import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PricingSection from "./PricingSection";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Compare TaskLaunch plans and pricing for solo task tracking and advanced productivity features.",
  alternates: {
    canonical: "/pricing",
  },
};

export default function PricingPage() {
  return (
    <main className="landingV2 pricingPageV2">
      <div className="landingV2Shell">
        <header className="landingV2Header isVisible">
          <Link href="/" className="landingV2Brand" aria-label="TaskLaunch home">
            <Image
              src="/logo/tasklaunch-logo-v2.png"
              alt="TaskLaunch"
              width={1868}
              height={422}
              priority
              className="landingV2BrandLogo"
            />
          </Link>

          <nav className="landingV2Nav" aria-label="Pricing navigation" />

          <div className="landingV2HeaderActions">
            <Link href="/" className="landingV2HeaderLink">
              Home
            </Link>
            <Link href="/web-sign-in" className="landingV2LoginLink">
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
