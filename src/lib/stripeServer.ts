import Stripe from "stripe";

let stripeClient: Stripe | null = null;
let stripeClientKey = "";

export function getStripeServer() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }
  if (!stripeClient || stripeClientKey !== secretKey) {
    stripeClient = new Stripe(secretKey);
    stripeClientKey = secretKey;
  }
  return stripeClient;
}

export function getAppBaseUrl() {
  const explicitUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (explicitUrl) return explicitUrl.replace(/\/+$/, "");
  return "http://localhost:3000";
}
