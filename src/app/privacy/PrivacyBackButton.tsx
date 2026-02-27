"use client";

import { useRouter } from "next/navigation";

export default function PrivacyBackButton() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    router.push("/tasktimer/settings");
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="border border-white/15 bg-black/30 px-3 py-2 text-sm font-semibold hover:border-[#35e8ff]/35"
      style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
    >
      Back
    </button>
  );
}
