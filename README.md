This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000/tasklaunch](http://localhost:3000/tasklaunch) for Tasks, or [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for Dashboard.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Docs Automation

This repo keeps `AGENTS.md` and `architecture.md` in sync with code using generated docs scripts.

```bash
npm run docs:update
npm run docs:check
npm run hooks:install
```

- `docs:update` regenerates the managed docs files.
- `docs:check` fails when generated docs are stale.
- `hooks:install` configures Git to use the repo-managed `.githooks/pre-commit` hook so docs update automatically before commits.

## Stripe Environments

Local development should stay on Stripe test mode.

- `.env.example` uses test placeholders for local setup:
  - `STRIPE_SECRET_KEY=sk_test_...`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`
  - `STRIPE_WEBHOOK_SECRET=whsec_...`
  - `STRIPE_PRICE_ID_PRO_MONTHLY=price_...`
- Production must use live values for:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PRICE_ID_PRO_MONTHLY`
  - `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_APP_URL`
- The deployed Stripe webhook endpoint must include the trailing slash:
  - `/api/stripe/webhook/`

### Production Live Stripe Checklist

1. Verify the correct live Stripe account/workspace is selected.
2. Confirm the live recurring Pro monthly `price_...` exists.
3. Confirm the Stripe Billing Portal is enabled in the live account.
4. Set production env vars to live values only. Do not replace local test values unless you intentionally want local live testing.
5. Register the live webhook endpoint as `https://<your-domain>/api/stripe/webhook/`.
6. Subscribe the webhook to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
7. Deploy the latest Firestore rules so `users/{uid}` allows the Stripe billing fields written by the webhook.
8. Run a live purchase validation and confirm Firestore updates:
   - `plan`
   - `stripeCustomerId`
   - `stripeSubscriptionId`
   - `stripePriceId`
   - `stripeSubscriptionStatus`
   - `stripeSyncedAt`
9. Validate `Manage Billing` opens the Stripe billing portal for a Pro user.
10. Validate cancellation or downgrade webhooks return the user to `free` when appropriate.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
