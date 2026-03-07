"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { ensureUserProfileIndex } from "../lib/cloudStore";
import { buildRewardsHeaderViewModel, DEFAULT_REWARD_PROGRESS, normalizeRewardProgress } from "../lib/rewards";
import { subscribeCachedPreferences } from "../lib/storage";

type SignedInHeaderBadgeProps = {
  href?: string;
};

export default function SignedInHeaderBadge({ href = "/tasktimer/settings?pane=general" }: SignedInHeaderBadgeProps) {
  const [signedInUserLabel, setSignedInUserLabel] = useState<string | null>(null);
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));
  const [headerView, setHeaderView] = useState<"welcome" | "xp">("welcome");

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      const displayName = String(user?.displayName || "").trim();
      const email = String(user?.email || "").trim();
      setSignedInUserLabel(displayName || email || null);
      setHeaderView("welcome");
      const uid = String(user?.uid || "").trim();
      if (uid) void ensureUserProfileIndex(uid);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeCachedPreferences((prefs) => {
      setRewardProgress(normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedInUserLabel) return;
    if (headerView === "xp") return;
    const timer = window.setTimeout(() => {
      setHeaderView("xp");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [headerView, signedInUserLabel]);

  if (!signedInUserLabel) return null;

  const rewardsHeader = buildRewardsHeaderViewModel(rewardProgress);
  const headerBadgeLabel =
    headerView === "xp"
      ? `${rewardsHeader.rankLabel}. ${rewardsHeader.progressLabel}${rewardsHeader.xpToNext != null ? `. ${rewardsHeader.xpToNext} XP to next rank.` : "."}`
      : `Welcome ${signedInUserLabel}`;

  return (
    <a
      id="signedInHeaderBadge"
      href={href}
      className={`signedInHeaderBadge${headerView === "xp" ? " isXpView" : ""}`}
      aria-label={headerBadgeLabel}
      title="Open Account settings"
    >
      <span aria-hidden="true" className="signedInHeaderBadgeInitial">
        {signedInUserLabel.slice(0, 1).toUpperCase()}
      </span>
      <span className="signedInHeaderBadgeBody">
        <span className={`signedInHeaderBadgePane${headerView === "welcome" ? " isOn" : ""}`} title={signedInUserLabel}>
          <span className="signedInHeaderBadgeTitle">Welcome {signedInUserLabel}</span>
        </span>
        <span className={`signedInHeaderBadgePane signedInHeaderBadgePaneXp${headerView === "xp" ? " isOn" : ""}`}>
          <span className="signedInHeaderBadgeXpMeta">
            <span className="signedInHeaderBadgeTitle">
              {rewardsHeader.rankLabel} - {rewardsHeader.totalXp} XP
            </span>
            <span className="signedInHeaderBadgeMeta">
              {rewardsHeader.xpToNext != null ? `${rewardsHeader.xpToNext} XP to next rank` : "Max rank reached"}
            </span>
          </span>
          <span className="signedInHeaderBadgeTrack" aria-hidden="true">
            <span className="signedInHeaderBadgeFill" style={{ width: `${rewardsHeader.progressPct}%` }} />
          </span>
        </span>
      </span>
    </a>
  );
}
