"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import AppImg from "@/components/AppImg";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { AVATAR_CATALOG } from "../lib/avatarCatalog";
import {
  readTaskTimerPlanFromStorage,
  TASKTIMER_PLAN_CHANGED_EVENT,
  type TaskTimerPlan,
} from "../lib/entitlements";
import { syncCurrentUserPlanCache } from "../lib/planFunctions";
import { saveUserRootPatch } from "../lib/cloudStore";
import {
  ACCOUNT_AVATAR_UPDATED_EVENT,
  ACCOUNT_PROFILE_UPDATED_EVENT,
  customAvatarIdForUid,
  googleAvatarIdForUid,
  readStoredAvatarId,
  readStoredCustomAvatarSrc,
} from "../lib/accountProfileStorage";
import { onboardingModuleStepFromNavPage } from "../lib/onboarding";
import ArchieAssistantWidget, { type ArchieOnboardingUiState } from "./ArchieAssistantWidget";

type DesktopRailPage = "dashboard" | "tasks" | "friends" | "leaderboard" | "history" | "settings" | "none";

type DesktopAppRailProps = {
  activePage: DesktopRailPage;
  useClientNavButtons?: boolean;
  showDesktopRail?: boolean;
  showMobileFooter?: boolean;
};

type NavItem = {
  page: DesktopRailPage;
  label: string;
  ariaLabel: string;
  iconSrc: string;
  desktopId: string;
  mobileId: string;
  href: string;
  showInMobileFooter?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    page: "dashboard",
    label: "Dashboard",
    ariaLabel: "Dashboard",
    iconSrc: "/icons/icons_default/dashboard.png",
    desktopId: "commandCenterDashboardBtn",
    mobileId: "footerDashboardBtn",
    href: "/dashboard",
  },
  {
    page: "tasks",
    label: "Tasks",
    ariaLabel: "Tasks",
    iconSrc: "/icons/icons_default/tasks.png",
    desktopId: "commandCenterTasksBtn",
    mobileId: "footerTasksBtn",
    href: "/tasklaunch",
  },
  {
    page: "friends",
    label: "Friends",
    ariaLabel: "Friends",
    iconSrc: "/icons/icons_default/friends.png",
    desktopId: "commandCenterGroupsBtn",
    mobileId: "footerTest2Btn",
    href: "/friends",
  },
  {
    page: "leaderboard",
    label: "Leaderboard",
    ariaLabel: "Leaderboard",
    iconSrc: "/icons/icons_default/leaderboard.png",
    desktopId: "commandCenterLeaderboardBtn",
    mobileId: "footerLeaderboardBtn",
    href: "/leaderboard",
    showInMobileFooter: false,
  },
  {
    page: "history",
    label: "History",
    ariaLabel: "History Manager",
    iconSrc: "/icons/icons_default/history.png",
    desktopId: "commandCenterHistoryBtn",
    mobileId: "footerHistoryBtn",
    href: "/history-manager",
    showInMobileFooter: false,
  },
  {
    page: "settings",
    label: "Settings",
    ariaLabel: "Settings",
    iconSrc: "/Settings.svg",
    desktopId: "commandCenterSettingsBtn",
    mobileId: "footerSettingsBtn",
    href: "/settings",
  },
];

const DESKTOP_NAV_ITEMS = NAV_ITEMS.filter((item) => item.page !== "settings");

const RAIL_TRANSITION_STORAGE_KEY = "tasktimer:railSlideTransition";
const DESKTOP_ARCHIE_MEDIA_QUERY = "(min-width: 981px)";

function shouldEnableDesktopWebArchie() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (isNativeOrFileRuntime()) return false;
  return window.matchMedia(DESKTOP_ARCHIE_MEDIA_QUERY).matches;
}

function railPageOrder(page: DesktopRailPage) {
  if (page === "dashboard") return 0;
  if (page === "tasks") return 1;
  if (page === "friends") return 2;
  if (page === "leaderboard") return 3;
  if (page === "history") return 4;
  if (page === "settings") return 5;
  return -1;
}

function rememberRailTransition(fromPage: DesktopRailPage, toPage: DesktopRailPage) {
  if (typeof window === "undefined") return;
  const fromIndex = railPageOrder(fromPage);
  const toIndex = railPageOrder(toPage);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
  try {
    window.sessionStorage.setItem(
      RAIL_TRANSITION_STORAGE_KEY,
      JSON.stringify({ toPage, direction: toIndex > fromIndex ? "forward" : "backward", at: Date.now() })
    );
  } catch {
    // ignore sessionStorage failures
  }
}

function labelFromUser(user: User | null) {
  const displayName = String(user?.displayName || "").trim();
  if (displayName) return displayName;
  const email = String(user?.email || "").trim();
  if (email) return email.split("@")[0] || email;
  return "TaskLaunch User";
}

function resolveAvatarSrc(uid: string, avatarId: string, avatarCustomSrc: string, googlePhotoUrl: string) {
  const normalizedAvatarId = String(avatarId || "").trim();
  if (normalizedAvatarId && normalizedAvatarId === customAvatarIdForUid(uid) && avatarCustomSrc) return avatarCustomSrc;
  if (normalizedAvatarId && normalizedAvatarId === googleAvatarIdForUid(uid) && googlePhotoUrl) return googlePhotoUrl;
  if (normalizedAvatarId) {
    const match = AVATAR_CATALOG.find((avatar) => avatar.id === normalizedAvatarId);
    if (match?.src) return match.src;
  }
  return googlePhotoUrl;
}

function initialsFromLabel(label: string) {
  const parts = String(label || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "TL";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function renderDesktopNavItem(
  item: NavItem,
  activePage: DesktopRailPage,
  useClientNavButtons: boolean,
  opts?: { onClick?: ((event: ReactMouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void) | undefined }
) {
  const isActive = activePage === item.page;
  const commonProps = {
    className: `btn btn-ghost small dashboardRailMenuBtn${isActive ? " isOn" : ""}`,
    "aria-label": item.ariaLabel,
    "data-nav-page": item.page,
    ...(isActive ? { "aria-current": "page" as const } : {}),
  };

  if (useClientNavButtons && item.page !== "settings" && item.page !== "history") {
    return (
      <button key={item.desktopId} {...commonProps} id={item.desktopId} type="button" onClick={opts?.onClick}>
        <AppImg
          className="dashboardRailMenuIconImage"
          src={item.iconSrc}
          alt=""
          aria-hidden="true"
        />
        <span className="dashboardRailMenuLabel">{item.label}</span>
      </button>
    );
  }

  return (
    <a
      key={item.desktopId}
      {...commonProps}
      id={item.desktopId}
      href={item.href}
      onClick={(event) => {
        opts?.onClick?.(event);
        if (event.defaultPrevented) return;
        rememberRailTransition(activePage, item.page);
      }}
    >
      <AppImg
        className="dashboardRailMenuIconImage"
        src={item.iconSrc}
        alt=""
        aria-hidden="true"
      />
      <span className="dashboardRailMenuLabel">{item.label}</span>
    </a>
  );
}

function renderMobileNavItem(item: NavItem, activePage: DesktopRailPage, useClientNavButtons: boolean) {
  const isActive = activePage === item.page;
  const commonProps = {
    className: `btn btn-ghost small appFooterBtn${isActive ? " isOn" : ""}`,
    "aria-label": item.ariaLabel,
  };

  if (useClientNavButtons && item.page !== "settings") {
    return (
      <button key={item.mobileId} {...commonProps} id={item.mobileId} type="button">
        <AppImg
          className="appFooterIconImage"
          src={item.iconSrc}
          alt=""
          aria-hidden="true"
        />
        {item.page === "friends" ? (
          <span
            id="footerTest2AlertBadge"
            className="appFooterAlertBadge"
            aria-live="polite"
            aria-atomic="true"
            style={{ display: "none" }}
          />
        ) : null}
        <span className="appFooterLabel">{item.label}</span>
      </button>
    );
  }

  return (
    <a key={item.mobileId} {...commonProps} id={item.mobileId} href={item.href} onClick={() => rememberRailTransition(activePage, item.page)}>
      <AppImg
        className="appFooterIconImage"
        src={item.iconSrc}
        alt=""
        aria-hidden="true"
      />
      {item.page === "friends" ? (
        <span
          id="footerTest2AlertBadge"
          className="appFooterAlertBadge"
          aria-live="polite"
          aria-atomic="true"
          style={{ display: "none" }}
        />
      ) : null}
      <span className="appFooterLabel">{item.label}</span>
    </a>
  );
}

export default function DesktopAppRail({
  activePage,
  useClientNavButtons = false,
  showDesktopRail = true,
  showMobileFooter = true,
}: DesktopAppRailProps) {
  const archieActivePage = activePage === "history" ? "none" : activePage;
  const [onboardingState, setOnboardingState] = useState<ArchieOnboardingUiState | null>(null);
  const [profileLabel, setProfileLabel] = useState("TaskLaunch User");
  const [profileAvatarSrc, setProfileAvatarSrc] = useState("");
  const [currentPlan, setCurrentPlan] = useState<TaskTimerPlan>("free");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [isDesktopWebArchieEnabled, setIsDesktopWebArchieEnabled] = useState(false);
  const shouldShowDesktopArchie = isDesktopWebArchieEnabled && activePage !== "history";

  const syncProfileFromUser = useCallback(async (user: User | null) => {
    const uid = String(user?.uid || "").trim();
    const fallbackLabel = labelFromUser(user);
    const googlePhotoUrl = String(user?.photoURL || "").trim();

    if (!uid) {
      setProfileLabel(fallbackLabel);
      setProfileAvatarSrc(googlePhotoUrl);
      setCurrentPlan("free");
      return;
    }
    void syncCurrentUserPlanCache(uid).catch(() => {
      // Keep rendering from the cached/default plan if the plan sync is temporarily unavailable.
    });

    const storedAvatarId = readStoredAvatarId(uid);
    const storedCustomAvatarSrc = readStoredCustomAvatarSrc(uid);
    setProfileLabel(fallbackLabel);
    setProfileAvatarSrc(resolveAvatarSrc(uid, storedAvatarId, storedCustomAvatarSrc, googlePhotoUrl));

    const db = getFirebaseFirestoreClient();
    if (!db) return;

    try {
      const snap = await getDoc(doc(db, "users", uid));
      const username = snap.exists() ? String(snap.get("username") || snap.get("alias") || snap.get("displayName") || "").trim() : "";
      const avatarId = String((snap.exists() ? snap.get("avatarId") : "") || storedAvatarId).trim();
      const avatarCustomSrc = String(snap.get("avatarCustomSrc") || storedCustomAvatarSrc).trim();
      const remoteGooglePhotoUrl = String((snap.exists() ? snap.get("googlePhotoUrl") : "") || "").trim();
      const remotePlan = snap.exists() ? String(snap.get("plan") || "").trim().toLowerCase() : "";
      if (googlePhotoUrl && remoteGooglePhotoUrl !== googlePhotoUrl) {
        void saveUserRootPatch(uid, { googlePhotoUrl }).catch(() => {
          // Keep rendering from local auth state when cloud sync is unavailable.
        });
      }
      setProfileLabel(username || fallbackLabel);
      setProfileAvatarSrc(resolveAvatarSrc(uid, avatarId, avatarCustomSrc, remoteGooglePhotoUrl || googlePhotoUrl));
      if (remotePlan === "free" || remotePlan === "pro") {
        setCurrentPlan(remotePlan);
      }
    } catch {
      // Keep local/auth profile state if user-doc enrichment fails.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncStoredPlan = () => setCurrentPlan(readTaskTimerPlanFromStorage());
    syncStoredPlan();
    window.addEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncStoredPlan as EventListener);
    return () => {
      window.removeEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncStoredPlan as EventListener);
    };
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void syncProfileFromUser(user);
    });
    const refreshProfile = () => {
      void syncProfileFromUser(auth.currentUser);
    };
    window.addEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, refreshProfile);
    window.addEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, refreshProfile);
    return () => {
      window.removeEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, refreshProfile);
      window.removeEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, refreshProfile);
      unsubscribe();
    };
  }, [syncProfileFromUser]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setIsDesktopWebArchieEnabled(false);
      return;
    }
    const mediaQuery = window.matchMedia(DESKTOP_ARCHIE_MEDIA_QUERY);
    const syncArchieAvailability = () => {
      setIsDesktopWebArchieEnabled(shouldEnableDesktopWebArchie());
    };
    syncArchieAvailability();
    mediaQuery.addEventListener("change", syncArchieAvailability);
    return () => {
      mediaQuery.removeEventListener("change", syncArchieAvailability);
    };
  }, []);

  useEffect(() => {
    if (showDesktopRail && shouldShowDesktopArchie) return;
    setOnboardingState(null);
  }, [shouldShowDesktopArchie, showDesktopRail]);

  const currentPlanLabel = currentPlan === "pro" ? "Pro" : "Free";
  const currentPlanBadgeLabel = currentPlan === "pro" ? "Pro Plan" : currentPlanLabel;
  const profileInitials = useMemo(() => initialsFromLabel(profileLabel), [profileLabel]);
  const mockNextPaymentDateLabel = useMemo(() => {
    if (currentPlan !== "pro") return "No upcoming charge while on Free.";
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 14);
    return nextDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [currentPlan]);

  const handleOpenPricingPage = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open("/pricing", "_blank", "noopener,noreferrer");
  }, []);

  const handleDesktopNavClick = useCallback(
    (page: DesktopRailPage, event?: { preventDefault?: () => void }) => {
      const onboardingModuleStep = onboardingModuleStepFromNavPage(page);
      if (!onboardingModuleStep) return;
      if (onboardingState?.step === "settings" && onboardingState.awaitingClick && onboardingModuleStep === "settings") {
        event?.preventDefault?.();
      }
    },
    [onboardingState]
  );

  const handleOpenBillingPortal = useCallback(async () => {
    const auth = getFirebaseAuthClient();
    const currentUser = auth?.currentUser || null;
    const uid = String(currentUser?.uid || "").trim();
    if (!uid || billingBusy) return;

    setBillingBusy(true);
    setBillingError("");
    try {
      const idToken = await currentUser?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const res = await fetch("/api/stripe/create-billing-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({
          uid,
          returnPath: "/settings?pane=general",
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not open billing management.");
      }
      window.location.assign(data.url);
    } catch (error: unknown) {
      setBillingError(error instanceof Error && error.message ? error.message : "Could not open billing management.");
      setBillingBusy(false);
    }
  }, [billingBusy]);

  const navActivePage: DesktopRailPage =
    onboardingState &&
    (
      onboardingState.step === "dashboard" ||
      onboardingState.step === "tasks" ||
      onboardingState.step === "friends" ||
      onboardingState.step === "leaderboard" ||
      onboardingState.step === "settings"
    )
      ? "none"
      : activePage;

  return (
    <>
      {showDesktopRail ? (
        <aside
          className="dashboardRail desktopAppRail"
          aria-label="TaskLaunch navigation"
          data-onboarding-step={onboardingState?.step || undefined}
          data-onboarding-awaiting-click={onboardingState?.awaitingClick ? "true" : undefined}
          data-onboarding-dashboard-panel-step={onboardingState?.dashboardPanelStep || undefined}
          data-onboarding-tasks-action-step={onboardingState?.tasksActionStep || undefined}
        >
          <div className="desktopRailTopSection">
            <div className="desktopRailBrandLockup landingV2FooterBrand appBrandLandingReplica displayFont" aria-hidden="true">
              <AppImg
                className="desktopRailBrandIcon landingV2HeaderBrandIcon appBrandLandingReplicaIcon"
                src="/logo/launch-icon-original-transparent.png"
                alt=""
              />
              <span className="appBrandLandingReplicaText">TaskLaunch</span>
            </div>
            <div className="dashboardRailSectionLabel">Modules</div>
            <nav className="dashboardRailNav">
              {DESKTOP_NAV_ITEMS.map((item) =>
                renderDesktopNavItem(item, navActivePage, useClientNavButtons, {
                  onClick: (event) => handleDesktopNavClick(item.page, event),
                })
              )}
            </nav>
          </div>

          <div className="desktopRailMiddleSection">
            {shouldShowDesktopArchie ? (
              <ArchieAssistantWidget activePage={archieActivePage} onOnboardingStepChange={setOnboardingState} />
            ) : null}
          </div>

          <div className="desktopRailBottomSection">
            <div className="desktopRailProfileDock">
              <section
                className="dashboardCard dashboardProfileCard dashboardRailProfileSummary dashboardRailProfileSummarySdCard"
                aria-label="Profile summary"
              >
                <div className="dashboardProfileHead dashboardRailProfileHead">
                  {profileAvatarSrc ? (
                    <div className="dashboardAvatar dashboardRailProfileAvatar" aria-hidden="true">
                      <AppImg className="dashboardAvatarImage dashboardRailProfileAvatarImage" src={profileAvatarSrc} alt="" aria-hidden="true" />
                    </div>
                  ) : (
                    <div className="dashboardAvatar dashboardRailProfileAvatar">{profileInitials}</div>
                  )}
                  <div className="dashboardRailProfileIdentity">
                    <div className="dashboardProfileName">{profileLabel}</div>
                    <div className="dashboardTagRow dashboardRailProfileTags">
                      <a
                        className="dashboardTag dashboardRailProfileTagLink"
                        href="/settings?pane=general"
                        onClick={() => rememberRailTransition(activePage, "settings")}
                      >
                        Settings
                      </a>
                      <button
                        className={`dashboardTag dashboardRailProfileTagLink dashboardRailProfilePlanBadge ${
                          currentPlan === "pro" ? "dashboardRailProfilePlanBadgePro" : "dashboardRailProfilePlanBadgeFree"
                        }`}
                        id="rewardsInfoOpenBtn"
                        type="button"
                        aria-label={`Open ${currentPlanLabel} subscription details`}
                        title={`${currentPlanLabel} subscription details`}
                      >
                        {currentPlanBadgeLabel}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

        </aside>
      ) : null}

      {showMobileFooter ? (
        <>
          <div className="appFooterNav" aria-label="App pages">
            {NAV_ITEMS.filter((item) => item.showInMobileFooter !== false).map((item) =>
              renderMobileNavItem(item, navActivePage, useClientNavButtons)
            )}
          </div>
        </>
      ) : null}
      <div className="overlay" id="rewardsInfoOverlay">
        <div className="modal rewardsInfoModal" role="dialog" aria-modal="true" aria-label="Subscription details">
          <h2>{currentPlanLabel} Subscription</h2>
          <p className="modalSubtext">
            {currentPlan === "pro"
              ? "Manage billing, payment methods, invoices, and cancellation in Stripe's secure customer portal."
              : "Upgrade to Pro to unlock advanced history, analytics, task setup, backup tools, and social features."}
          </p>
          <div className="rewardsInfoDetailGrid" aria-label="Subscription summary">
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Plan</span>
              <strong className="rewardsInfoDetailValue">{currentPlanLabel}</strong>
            </div>
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Status</span>
              <strong className="rewardsInfoDetailValue">
                {currentPlan === "pro" ? "Active" : "Available"}
              </strong>
            </div>
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Billing Cycle</span>
              <strong className="rewardsInfoDetailValue">
                {currentPlan === "pro" ? "Monthly" : "No billing on Free"}
              </strong>
            </div>
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Next Payment Date</span>
              <strong className="rewardsInfoDetailValue">{mockNextPaymentDateLabel}</strong>
            </div>
          </div>
          <div className="rewardsInfoText">
            {currentPlan === "pro"
              ? "Your Pro subscription includes advanced history, analytics, task setup, full-history backup tools, and connected social features."
              : "Free keeps the core solo workflow unlocked. Upgrade whenever you want the advanced workflow and billing-backed account features."}
          </div>
          {billingError ? (
            <div className="settingsDetailNote" role="alert" aria-live="polite">
              {billingError}
            </div>
          ) : null}
          <div className="confirmBtns rewardsInfoActions">
            {currentPlan === "pro" ? (
              <button className="btn btn-accent" type="button" onClick={() => void handleOpenBillingPortal()} disabled={billingBusy}>
                {billingBusy ? "Opening Billing..." : "Manage Billing"}
              </button>
            ) : (
              <button className="btn btn-accent" type="button" onClick={handleOpenPricingPage}>
                Upgrade to Pro
              </button>
            )}
            <button className="btn btn-ghost closePopup" id="rewardsInfoCloseBtn" type="button">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
