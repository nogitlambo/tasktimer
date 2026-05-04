"use client";

import { useRouter } from "next/navigation";
import { resolveStandaloneRouteBackTarget } from "../tasktimer/lib/routeBack";

export default function PrivacyBackButton() {
  const router = useRouter();

  const handleBack = () => {
    router.push(resolveStandaloneRouteBackTarget("/settings"));
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="landingV2HeaderBack displayFont"
    >
      Back
    </button>
  );
}
