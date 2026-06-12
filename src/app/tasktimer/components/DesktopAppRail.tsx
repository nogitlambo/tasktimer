"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from "react";
import AppImg from "@/components/AppImg";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { recordNonFatal } from "@/lib/firebaseTelemetry";
import { AVATAR_CATALOG, normalizeBundledAvatarWebpSrc } from "../lib/avatarCatalog";
import { TASKTIMER_OPEN_ONBOARDING_EVENT } from "../client/onboarding-events";
import { playDropdownClickAudio, playTaskFlipClickAudio } from "../client/secondary-click-audio";
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
  googleAvatarIdForUid,
  isCustomAvatarIdForUid,
  readStoredAvatarId,
  readStoredCustomAvatarSrc,
} from "../lib/accountProfileStorage";
import { getErrorMessage, handleSignOutFlow } from "./settings/settingsAccountService";
import SignOutConfirmModal from "./SignOutConfirmModal";

type DesktopRailPage =
  | "dashboard"
  | "tasks"
  | "session-notes"
  | "friends"
  | "leaderboard"
  | "account"
  | "history"
  | "settings"
  | "userGuide"
  | "feedback"
  | "none";

type DesktopAppRailProps = {
  activePage: DesktopRailPage;
  useClientNavButtons?: boolean;
  showDesktopRail?: boolean;
  showMobileFooter?: boolean;
};

type DesktopRailDevEnvInput = {
  hostname?: string;
  protocol?: string;
  nodeEnv?: string;
  flag?: string;
};

const DESKTOP_RAIL_DEV_ENV_DISABLED_VALUES = new Set(["false", "0", "off"]);

export function shouldShowDesktopRailDevEnv(input: DesktopRailDevEnvInput = {}) {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === "production") return false;

  const flag = (input.flag ?? process.env.NEXT_PUBLIC_SHOW_DESKTOP_RAIL_DEV_ENV ?? "").trim().toLowerCase();
  if (DESKTOP_RAIL_DEV_ENV_DISABLED_VALUES.has(flag)) return false;

  const protocol = String(input.protocol || "").trim().toLowerCase();
  if (protocol && protocol !== "http:" && protocol !== "https:") return false;

  const hostname = String(input.hostname || "").trim().toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function subscribeToDesktopRailDevEnvSnapshot() {
  return () => {};
}

function getDesktopRailDevEnvSnapshot() {
  return shouldShowDesktopRailDevEnv({
    hostname: window.location.hostname,
    protocol: window.location.protocol,
  });
}

function getDesktopRailDevEnvServerSnapshot() {
  return false;
}

export function openTaskLaunchOnboarding(target: Pick<EventTarget, "dispatchEvent"> | null = typeof window !== "undefined" ? window : null) {
  if (!target) return false;
  return target.dispatchEvent(new Event(TASKTIMER_OPEN_ONBOARDING_EVENT));
}

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
    iconSrc: "/icons/icons_default/dashboard.webp",
    desktopId: "commandCenterDashboardBtn",
    mobileId: "footerDashboardBtn",
    href: "/dashboard",
  },
  {
    page: "tasks",
    label: "Tasks",
    ariaLabel: "Tasks",
    iconSrc: "/icons/icons_default/task.webp",
    desktopId: "commandCenterTasksBtn",
    mobileId: "footerTasksBtn",
    href: "/tasklaunch",
  },
  {
    page: "session-notes",
    label: "Session Notes",
    ariaLabel: "Session Notes",
    iconSrc: "/icons/icons_default/notes.webp",
    desktopId: "commandCenterSessionNotesBtn",
    mobileId: "footerSessionNotesBtn",
    href: "/session-notes",
  },
  {
    page: "friends",
    label: "Friends",
    ariaLabel: "Friends",
    iconSrc: "/icons/icons_default/friends.webp",
    desktopId: "commandCenterGroupsBtn",
    mobileId: "footerTest2Btn",
    href: "/friends",
  },
  {
    page: "leaderboard",
    label: "Leaderboards",
    ariaLabel: "Leaderboards",
    iconSrc: "/icons/icons_default/leaderboards.webp",
    desktopId: "commandCenterLeaderboardBtn",
    mobileId: "footerLeaderboardBtn",
    href: "/leaderboards",
  },
  {
    page: "history",
    label: "History",
    ariaLabel: "History Manager",
    iconSrc: "/icons/icons_default/history.webp",
    desktopId: "commandCenterHistoryBtn",
    mobileId: "footerHistoryBtn",
    href: "/history-manager",
    showInMobileFooter: false,
  },
  {
    page: "account",
    label: "Account",
    ariaLabel: "Account",
    iconSrc: "/Settings.svg",
    desktopId: "commandCenterAccountBtn",
    mobileId: "footerAccountBtn",
    href: "/account",
    showInMobileFooter: false,
  },
  {
    page: "settings",
    label: "Settings",
    ariaLabel: "Settings",
    iconSrc: "/icons/icons_default/settings.webp",
    desktopId: "commandCenterSettingsBtn",
    mobileId: "footerSettingsBtn",
    href: "/settings",
    showInMobileFooter: false,
  },
  {
    page: "userGuide",
    label: "User Guide",
    ariaLabel: "User Guide",
    iconSrc: "/User_Guide.svg",
    desktopId: "commandCenterUserGuideBtn",
    mobileId: "footerUserGuideBtn",
    href: "/user-guide",
    showInMobileFooter: false,
  },
  {
    page: "feedback",
    label: "Feedback",
    ariaLabel: "Feedback",
    iconSrc: "/Feedback.svg",
    desktopId: "commandCenterFeedbackBtn",
    mobileId: "footerFeedbackBtn",
    href: "/feedback",
    showInMobileFooter: false,
  },
];

const DESKTOP_NAV_ITEMS = NAV_ITEMS.filter(
  (item) =>
    item.page !== "account" &&
    item.page !== "history" &&
    item.page !== "settings" &&
    item.page !== "userGuide" &&
    item.page !== "feedback"
);
const PROFILE_MENU_PAGES = ["settings"] as const;
const HELP_CENTER_MENU_PAGES = ["userGuide", "feedback"] as const;

export function getDesktopRailProfileMenuItems() {
  return PROFILE_MENU_PAGES.map((page) => NAV_ITEMS.find((item) => item.page === page)).filter((item): item is NavItem => !!item);
}

export function getDesktopRailHelpCenterMenuItems() {
  return HELP_CENTER_MENU_PAGES.map((page) => NAV_ITEMS.find((item) => item.page === page)).filter((item): item is NavItem => !!item);
}

export function getDesktopRailPrimaryNavItems() {
  return DESKTOP_NAV_ITEMS.slice();
}

export function getMobileFooterNavItems() {
  return NAV_ITEMS.filter((item) => item.showInMobileFooter !== false);
}

const RAIL_TRANSITION_STORAGE_KEY = "tasktimer:railSlideTransition";
function railPageOrder(page: DesktopRailPage) {
  if (page === "dashboard") return 0;
  if (page === "tasks") return 1;
  if (page === "session-notes") return 2;
  if (page === "friends") return 3;
  if (page === "leaderboard") return 4;
  if (page === "account") return 5;
  if (page === "settings") return 6;
  if (page === "userGuide") return 7;
  if (page === "feedback") return 8;
  if (page === "history") return 9;
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
  const email = emailFromUser(user);
  if (email) return email.split("@")[0] || email;
  return "TaskLaunch User";
}

function emailFromUser(user: User | null) {
  const authEmail = String(user?.email || "").trim();
  if (authEmail) return authEmail;
  const providerEmail = user?.providerData
    ?.map((provider) => String(provider.email || "").trim())
    .find(Boolean);
  return providerEmail || "";
}

function resolveAvatarSrc(uid: string, avatarId: string, avatarCustomSrc: string, googlePhotoUrl: string) {
  const normalizedAvatarId = String(avatarId || "").trim();
  if (normalizedAvatarId && isCustomAvatarIdForUid(uid, normalizedAvatarId) && avatarCustomSrc) {
    return normalizeBundledAvatarWebpSrc(avatarCustomSrc);
  }
  if (normalizedAvatarId && normalizedAvatarId === googleAvatarIdForUid(uid) && googlePhotoUrl) return googlePhotoUrl;
  if (normalizedAvatarId) {
    const match = AVATAR_CATALOG.find((avatar) => avatar.id === normalizedAvatarId);
    if (match?.src) return match.src;
    if (/^\/(?:tasklaunch\/)?avatars\//i.test(normalizedAvatarId)) return normalizeBundledAvatarWebpSrc(normalizedAvatarId);
  }
  return normalizeBundledAvatarWebpSrc(googlePhotoUrl);
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
        {item.page === "friends" ? (
          <span
            id="commandCenterGroupsAlertBadge"
            className="appFooterAlertBadge desktopRailAlertBadge"
            aria-live="polite"
            aria-atomic="true"
            style={{ display: "none" }}
          />
        ) : null}
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
      {item.page === "friends" ? (
        <span
          id="commandCenterGroupsAlertBadge"
          className="appFooterAlertBadge desktopRailAlertBadge"
          aria-live="polite"
          aria-atomic="true"
          style={{ display: "none" }}
        />
      ) : null}
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

function ProfileMenuLink({
  item,
  activePage,
  onNavigate,
}: {
  item: NavItem;
  activePage: DesktopRailPage;
  onNavigate?: () => void;
}) {
  const isActive = activePage === item.page;
  const profileLabel = item.page === "history" ? "History Manager" : item.label;
  return (
    <a
      key={`profile-${item.page}`}
      className={`btn btn-ghost small dashboardRailMenuBtn desktopRailProfileMenuBtn${isActive ? " isOn" : ""}`}
      href={item.href}
      aria-label={item.ariaLabel}
      data-nav-page={item.page}
      role="menuitem"
      {...(isActive ? { "aria-current": "page" as const } : {})}
      onClick={() => {
        onNavigate?.();
        rememberRailTransition(activePage, item.page);
      }}
      >
      <AppImg
        className="dashboardRailMenuIconImage"
        src={item.iconSrc}
        alt=""
        aria-hidden="true"
      />
      <span className="dashboardRailMenuLabel">{profileLabel}</span>
    </a>
  );
}

function HelpCenterSubmenuLink({
  item,
  activePage,
  onNavigate,
}: {
  item: NavItem;
  activePage: DesktopRailPage;
  onNavigate?: () => void;
}) {
  const isActive = activePage === item.page;
  return (
    <a
      key={`help-center-${item.page}`}
      className={`btn btn-ghost small dashboardRailMenuBtn desktopRailProfileMenuBtn desktopRailProfileSecondaryMenuBtn${isActive ? " isOn" : ""}`}
      href={item.href}
      aria-label={item.ariaLabel}
      data-nav-page={item.page}
      role="menuitem"
      {...(isActive ? { "aria-current": "page" as const } : {})}
      onClick={() => {
        onNavigate?.();
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

export function getDesktopRailProfileSignOutLabel(signOutBusy: boolean) {
  return signOutBusy ? "Signing Out" : "Sign Out";
}

function renderProfileSignOutButton(signOutBusy: boolean, onSignOut: () => void) {
  const label = getDesktopRailProfileSignOutLabel(signOutBusy);
  return (
    <button
      key="profile-sign-out"
      className="btn btn-ghost small dashboardRailMenuBtn desktopRailProfileMenuBtn desktopRailProfileSignOutBtn"
      type="button"
      role="menuitem"
      aria-label="Sign Out"
      onClick={onSignOut}
      disabled={signOutBusy}
    >
      <AppImg
        className="dashboardRailMenuIconImage"
        src="/icons/icons_default/signout.webp"
        alt=""
        aria-hidden="true"
      />
      <span className="dashboardRailMenuLabel">{label}</span>
    </button>
  );
}

export default function DesktopAppRail({
  activePage,
  useClientNavButtons = false,
  showDesktopRail = true,
  showMobileFooter = true,
}: DesktopAppRailProps) {
  const [profileLabel, setProfileLabel] = useState("TaskLaunch User");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAvatarSrc, setProfileAvatarSrc] = useState("");
  const [currentPlan, setCurrentPlan] = useState<TaskTimerPlan>("free");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileMenuClosing, setProfileMenuClosing] = useState(false);
  const [helpCenterMenuOpen, setHelpCenterMenuOpen] = useState(false);
  const [temporaryModalOpen, setTemporaryModalOpen] = useState(false);
  const showDesktopRailDevEnv = useSyncExternalStore(
    subscribeToDesktopRailDevEnvSnapshot,
    getDesktopRailDevEnvSnapshot,
    getDesktopRailDevEnvServerSnapshot
  );
  const profileMenuCloseTimerRef = useRef<number | null>(null);

  const syncProfileFromUser = useCallback(async (user: User | null) => {
    const uid = String(user?.uid || "").trim();
    const fallbackLabel = labelFromUser(user);
    const email = emailFromUser(user);
    const googlePhotoUrl = String(user?.photoURL || "").trim();
    setProfileEmail(email);

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
      const remoteEmail = snap.exists() ? String(snap.get("email") || "").trim() : "";
      const username = snap.exists() ? String(snap.get("username") || snap.get("alias") || "").trim() : "";
      const avatarId = String((snap.exists() ? snap.get("avatarId") : "") || storedAvatarId).trim();
      const avatarCustomSrc = String(snap.get("avatarCustomSrc") || storedCustomAvatarSrc).trim();
      const remoteGooglePhotoUrl = String((snap.exists() ? snap.get("googlePhotoUrl") : "") || "").trim();
      const remotePlan = snap.exists() ? String(snap.get("plan") || "").trim().toLowerCase() : "";
      if (googlePhotoUrl && remoteGooglePhotoUrl !== googlePhotoUrl) {
        void saveUserRootPatch(uid, { googlePhotoUrl }).catch(() => {
          // Keep rendering from local auth state when cloud sync is unavailable.
        });
      }
      setProfileEmail(email || remoteEmail);
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
    return () => {
      if (profileMenuCloseTimerRef.current != null) {
        window.clearTimeout(profileMenuCloseTimerRef.current);
      }
    };
  }, []);

  const currentPlanLabel = currentPlan === "pro" ? "Pro" : "Free";
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

  const closeTemporaryModal = useCallback(() => {
    setTemporaryModalOpen(false);
  }, []);

  const closeProfileMenu = useCallback(() => {
    if (profileMenuCloseTimerRef.current != null) {
      window.clearTimeout(profileMenuCloseTimerRef.current);
      profileMenuCloseTimerRef.current = null;
    }
    playTaskFlipClickAudio();
    setProfileMenuClosing(true);
    profileMenuCloseTimerRef.current = window.setTimeout(() => {
      setProfileMenuOpen(false);
      setProfileMenuClosing(false);
      setHelpCenterMenuOpen(false);
      profileMenuCloseTimerRef.current = null;
    }, 320);
  }, []);

  const toggleProfileMenu = useCallback(() => {
    if (profileMenuCloseTimerRef.current != null) {
      window.clearTimeout(profileMenuCloseTimerRef.current);
      profileMenuCloseTimerRef.current = null;
    }
    if (profileMenuOpen && !profileMenuClosing) {
      closeProfileMenu();
      return;
    }
    playDropdownClickAudio();
    setProfileMenuOpen(true);
    setProfileMenuClosing(false);
  }, [closeProfileMenu, profileMenuClosing, profileMenuOpen]);

  const toggleHelpCenterMenu = useCallback(() => {
    playDropdownClickAudio();
    setHelpCenterMenuOpen((open) => !open);
  }, []);

  const handleProfileSignOut = useCallback(async () => {
    if (signOutBusy) return;
    setSignOutBusy(true);
    setSignOutError("");
    try {
      await handleSignOutFlow();
    } catch (error: unknown) {
      setSignOutError(getErrorMessage(error, "Could not sign out."));
      setSignOutBusy(false);
      setShowSignOutConfirm(false);
    }
  }, [signOutBusy]);

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
          returnPath: "/account",
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not open billing management.");
      }
      window.location.assign(data.url);
    } catch (error: unknown) {
      void recordNonFatal(error, {
        flow: "billing_portal",
        source_page: "desktop_rail",
      });
      setBillingError(error instanceof Error && error.message ? error.message : "Could not open billing management.");
      setBillingBusy(false);
    }
  }, [billingBusy]);

  const navActivePage: DesktopRailPage = activePage;

  return (
    <>
      {showDesktopRail ? (
        <aside
          className="dashboardRail desktopAppRail"
          id="desktopAppRail"
          aria-label="TaskLaunch navigation"
          data-profile-menu-open={profileMenuOpen && !profileMenuClosing ? "true" : undefined}
        >
          <div className="desktopRailTopSection">
            <div className="desktopRailLogo" aria-hidden="true">
              <AppImg
                className="desktopRailBrandLogo"
                src="/logo/tasklaunch-logo.png"
                alt=""
              />
            </div>
            <div className="desktopRailHeaderDivider" aria-hidden="true" />
            <div className="dashboardRailSectionLabel">Modules</div>
            <nav className="dashboardRailNav">
              {DESKTOP_NAV_ITEMS.map((item) => (
                <Fragment key={item.desktopId}>
                  {renderDesktopNavItem(item, navActivePage, useClientNavButtons, {
                    onClick: undefined,
                  })}
                  {item.page === "leaderboard" ? <div className="desktopRailNavDivider" aria-hidden="true" /> : null}
                </Fragment>
              ))}
              {showDesktopRailDevEnv ? (
                <>
                  <div className="dashboardRailSectionLabel desktopRailDevEnvLabel">Dev env</div>
                  <button
                    className="btn btn-ghost small dashboardRailMenuBtn desktopRailDevEnvMenuBtn"
                    type="button"
                    aria-label="Run onboarding"
                    onClick={() => openTaskLaunchOnboarding()}
                  >
                    <AppImg
                      className="dashboardRailMenuIconImage"
                      src="/icons/icons_default/question.webp"
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="dashboardRailMenuLabel">Onboarding</span>
                  </button>
                </>
              ) : null}
            </nav>
          </div>

          <div className="desktopRailMiddleSection" aria-hidden="true" />

          <div className="desktopRailBottomSection">
            <details
              className="desktopRailProfileDock desktopRailProfileMenu"
              open={profileMenuOpen || profileMenuClosing}
              data-closing={profileMenuClosing ? "true" : undefined}
            >
              <summary
                className="dashboardCard dashboardProfileCard dashboardRailProfileSummary dashboardRailProfileSummarySdCard desktopRailProfileMenuTrigger"
                aria-label="Profile summary menu"
                aria-expanded={profileMenuOpen && !profileMenuClosing}
                onClick={(event) => {
                  event.preventDefault();
                  toggleProfileMenu();
                }}
              >
                <span className="dashboardProfileHead dashboardRailProfileHead">
                  {profileAvatarSrc ? (
                    <span className="dashboardAvatar dashboardRailProfileAvatar" aria-hidden="true">
                      <AppImg
                        className="dashboardAvatarImage dashboardRailProfileAvatarImage"
                        src={profileAvatarSrc}
                        alt=""
                        aria-hidden="true"
                        referrerPolicy={/^https?:\/\//i.test(profileAvatarSrc) ? "no-referrer" : undefined}
                      />
                    </span>
                  ) : (
                    <span className="dashboardAvatar dashboardRailProfileAvatar">{profileInitials}</span>
                  )}
                  <span className="dashboardRailProfileIdentity">
                    <span className="dashboardProfileName">{profileLabel.toLocaleLowerCase()}</span>
                    {profileEmail ? <span className="dashboardProfileMeta dashboardRailProfileEmail">{profileEmail}</span> : null}
                  </span>
                </span>
              </summary>
              <div className="desktopRailProfileMenuDropdown" role="menu" aria-label="Profile menu">
                <details className="desktopRailProfileSubmenu" open={helpCenterMenuOpen}>
                  <summary
                    className="btn btn-ghost small dashboardRailMenuBtn desktopRailProfileMenuBtn desktopRailProfileSubmenuTrigger"
                    aria-label="Help Center"
                    aria-expanded={helpCenterMenuOpen}
                    role="menuitem"
                    onClick={(event) => {
                      event.preventDefault();
                      toggleHelpCenterMenu();
                    }}
                  >
                    <AppImg
                      className="dashboardRailMenuIconImage"
                      src="/icons/icons_default/question.webp"
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="dashboardRailMenuLabel">Help Center</span>
                  </summary>
                  <div className="desktopRailProfileSubmenuList" role="menu" aria-label="Help Center menu">
                    {getDesktopRailHelpCenterMenuItems().map((item) => (
                      <HelpCenterSubmenuLink key={`help-center-${item.page}`} item={item} activePage={navActivePage} onNavigate={closeProfileMenu} />
                    ))}
                  </div>
                </details>
                <div className="desktopRailProfileMenuDivider" role="separator" aria-hidden="true" />
                {getDesktopRailProfileMenuItems().map((item) => (
                  <ProfileMenuLink key={`profile-${item.page}`} item={item} activePage={navActivePage} onNavigate={closeProfileMenu} />
                ))}
                {renderProfileSignOutButton(signOutBusy, () => setShowSignOutConfirm(true))}
                {signOutError ? (
                  <div className="settingsDetailNote desktopRailProfileMenuError" role="alert" aria-live="polite">
                    {signOutError}
                  </div>
                ) : null}
              </div>
            </details>
          </div>

        </aside>
      ) : null}

      <SignOutConfirmModal
        open={showSignOutConfirm}
        busy={signOutBusy}
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={() => void handleProfileSignOut()}
      />

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
      {temporaryModalOpen ? (
        <div
          className="overlay"
          id="temporaryModalOverlay"
          style={{ display: "flex" }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeTemporaryModal();
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Modal preview">
            <h2>Modal Preview</h2>
            <p className="modalSubtext">
              This temporary modal uses the standard TaskLaunch modal styling baseline.
            </p>
            <div className="confirmBtns">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={closeTemporaryModal}
              >
                Secondary
              </button>
              <button
                className="btn btn-accent"
                type="button"
                onClick={closeTemporaryModal}
              >
                Primary
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
