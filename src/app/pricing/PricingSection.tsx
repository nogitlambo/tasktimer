"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readApiJson } from "@/lib/apiJson";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { recordNonFatal } from "@/lib/firebaseTelemetry";
import type { TaskTimerPaidOffer } from "../tasktimer/lib/entitlements";

type PricingTier = {
  name: string;
  price: string;
  cta: string;
  href: string | null;
  checkoutOffer: TaskTimerPaidOffer | null;
  badge: string | null;
  description: string;
  billingLabel: string;
  features: string[];
  finePrint: string | null;
};

const pricingTiers: PricingTier[] = [
  {
    name: "Free",
    price: "$0",
    cta: "Get Started",
    href: null,
    checkoutOffer: null,
    badge: null,
    description: "Complete solo tracking essentials",
    billingLabel: "Per month",
    features: [
      "Unlimited tasks",
      "Session history up to 90 days",
      "Dashboard panels for goals, tasks, and streaks",
      "Secure Cloud Storage",
    ],
    finePrint: null,
  },
  {
    name: "PLUS",
    price: "$6.99",
    cta: "14-Day Free Trial",
    href: "/login?checkout=pro",
    checkoutOffer: "plus_monthly",
    badge: "14-Day Free Trial",
    description: "Advanced tools for power users",
    billingLabel: "Per month",
    features: [
      "Everything in Free, plus:",
      "Unlock AI-guided workflow optimisation",
      "Richer dashboard analytics and insights",
      "XP award boosters",
      "Unlimited session history",
      "Manual history entry",
      "Add Friends and task sharing",
      "Backup Import/Export",
    ],
    finePrint: null,
  },
  {
    name: "PLUS Lifetime",
    price: "$99.00",
    cta: "Get PLUS Lifetime",
    href: "/login?checkout=plus_lifetime",
    checkoutOffer: "plus_lifetime",
    badge: "One-time",
    description: "All PLUS features without a renewal",
    billingLabel: "One-off payment",
    features: [
      "Everything in PLUS",
      "Lifetime access to PLUS features",
      "No monthly renewal",
      "Unlock AI-guided workflow optimisation",
      "Richer dashboard analytics and insights",
      "Unlimited session history",
      "Add Friends and task sharing",
      "Backup Import/Export",
    ],
    finePrint: null,
  },
];

type PricingSectionProps = {
  mode?: "landing" | "page";
};

export default function PricingSection({ mode = "landing" }: PricingSectionProps) {
  const router = useRouter();
  const isPage = mode === "page";
  const analyticsSourcePage = isPage ? "pricing" : "landing";
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const handleStartProCheckout = async (offer: TaskTimerPaidOffer) => {
    if (checkoutBusy) return;
    setCheckoutError("");

    const auth = getFirebaseAuthClient();
    const user = auth?.currentUser || null;
    const uid = String(user?.uid || "").trim();
    if (!uid || !user) {
      router.push(offer === "plus_lifetime" ? "/login?checkout=plus_lifetime" : "/login?checkout=pro");
      return;
    }

    setCheckoutBusy(true);
    try {
      const idToken = await user.getIdToken();
      if (!idToken) {
        throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      }
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({ uid, offer }),
      });
      const data = await readApiJson<{ url?: string; error?: string }>(res, "Could not start checkout.");
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }
      window.location.assign(data.url);
    } catch (error: unknown) {
      void recordNonFatal(error, {
        flow: "billing_checkout",
        source_page: analyticsSourcePage,
      });
      setCheckoutError(error instanceof Error && error.message ? error.message : "Could not start checkout.");
      setCheckoutBusy(false);
    }
  };

  return (
    <section className={`pricingSectionV2 ${isPage ? "isPage" : "isEmbedded"}`}>
      <section className="landingV2Section isVisible" id="plans">
        {checkoutError ? (
          <div className="pricingV2Error pricingV2ErrorBlock">{checkoutError}</div>
        ) : null}
        <h1 className="pricingV2SectionTitle displayFont">Plans</h1>

        <div className="pricingV2CardGrid">
          {pricingTiers.map((tier) => {
            const checkoutOffer = tier.checkoutOffer;
            return (
              <article
                key={tier.name}
                className={`pricingV2Card${tier.badge ? " isFeatured" : ""}`}
              >
                <div className="pricingV2CardIntro">
                  <div className="pricingV2PlanNameRow">
                    <h2 className="pricingV2PlanName displayFont">{tier.name}</h2>
                    {tier.badge ? <span className="pricingV2Badge displayFont">{tier.badge}</span> : null}
                  </div>
                  <p className="pricingV2PlanDescription">{tier.description}</p>
                  <div className={`pricingV2PriceRow${tier.checkoutOffer ? "" : " isHidden"}`} aria-hidden={tier.checkoutOffer ? undefined : "true"}>
                    <strong className="pricingV2Price displayFont">{tier.price}</strong>
                    <span className="pricingV2Billing">{tier.billingLabel}</span>
                  </div>
                  {tier.finePrint ? <p className="pricingV2FinePrint">{tier.finePrint}</p> : null}
                </div>

                <div className="pricingV2Divider" />

                <ul className="pricingV2FeatureList">
                  {tier.features.map((feature) => (
                    <li key={feature}>
                      <span className="pricingV2FeatureIcon displayFont" aria-hidden="true">{">"}</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="pricingV2ActionRow">
                  {checkoutOffer ? (
                    <button
                      type="button"
                      onClick={() => void handleStartProCheckout(checkoutOffer)}
                      disabled={checkoutBusy}
                      className={`landingV2PrimaryBtn displayFont pricingV2Button pricingV2ProButton${checkoutBusy ? " isBusy" : ""}`}
                    >
                      {checkoutBusy ? "Starting Checkout..." : tier.cta}
                    </button>
                  ) : tier.href ? (
                    <a href={tier.href} className="landingV2SecondaryBtn displayFont pricingV2Button">
                      {tier.cta}
                    </a>
                  ) : (
                    <button type="button" className="landingV2SecondaryBtn displayFont pricingV2Button">
                      {tier.cta}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
