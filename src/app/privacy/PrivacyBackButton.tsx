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
      className="displayFont border border-[#79e2ff]/26 bg-white/[0.04] px-3 py-1.5 text-[0.72rem] font-medium uppercase tracking-[0.1em] text-[#dff8ff] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-colors hover:border-[#79e2ff]/44 hover:bg-[#35e8ff]/10 hover:text-white"
      style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
    >
      Back
    </button>
  );
}
