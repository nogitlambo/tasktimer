"use client";

import { useRouter } from "next/navigation";

export default function PrivacyBackButton() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    router.push("/settings");
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
