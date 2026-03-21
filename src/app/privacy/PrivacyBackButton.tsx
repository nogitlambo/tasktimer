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
      className="displayFont border border-[#d5dce6] bg-[#fdfcf9] px-3 py-1.5 text-[0.72rem] font-medium tracking-[0.08em] text-[#7d8b9c] shadow-[0_2px_10px_rgba(77,93,110,0.06)] transition-colors hover:border-[#b8c8dc] hover:text-[#66788c]"
      style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
    >
      Back
    </button>
  );
}
