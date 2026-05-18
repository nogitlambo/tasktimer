import type { Metadata } from "next";

import { buildPageMetadata } from "../seo";
import UnsubscribeClient from "./UnsubscribeClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Early Access Email Preferences",
  description: "Manage TaskLaunch early access email preferences.",
  path: "/unsubscribe/",
});

export default function UnsubscribePage() {
  return <UnsubscribeClient />;
}
