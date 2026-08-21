"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import AppImg from "@/components/AppImg";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { readApiJson } from "@/lib/apiJson";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { recordNonFatal } from "@/lib/firebaseTelemetry";
import { AVATAR_CATALOG, normalizeBundledAvatarWebpSrc } from "../lib/avatarCatalog";
import { playDropdownClickAudio, playTaskFlipClickAudio } from "../client/secondary-click-audio";
import { getApiUrl } from "../lib/apiClient";
import {
  readTaskTimerPlanCacheFromStorage,
  TASKTIMER_PLAN_CHANGED_EVENT,
  type TaskTimerPlan,
} from "../lib/entitlements";
import { syncCurrentUserPlanCache } from "../lib/planFunctions";
import { loadUserRootPlan, saveUserRootPatch } from "../lib/cloudStore";
import {
  ACCOUNT_AVATAR_UPDATED_EVENT,
  ACCOUNT_PROFILE_UPDATED_EVENT,
  googleAvatarIdForUid,
  isCustomAvatarIdForUid,
  readStoredAvatarId,
  readStoredCustomAvatarSrc,
} from "../lib/accountProfileStorage";
import { getErrorMessage } from "./settings/settingsAccountService";
import { useSharedProfileSessionActions } from "./settings/useSharedProfileSessionActions";
import SignOutConfirmModal from "./SignOutConfirmModal";
import { resolveTaskTimerRouteHref } from "../lib/routeHref";
import {
  getMobileSwipeCloseDragY,
  getResetMobileSwipeCloseState,
  getStartMobileSwipeCloseState,
  getUpdatedMobileSwipeCloseState,
  shouldCloseFromMobileSwipe,
  type MobileSwipeCloseState,
} from "./mobileSwipeClose";

type DesktopRailPage =
  | "dashboard"
  | "tasks"
  | "notes"
  | "executive"
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

type NavItem = {
  page: DesktopRailPage;
  label: string;
  ariaLabel: string;
  iconSrc: string;
  desktopId: string;
  mobileId: string;
  href: string;
  showInMobileFooter?: boolean;
  mobileFooterOrder?: number;
};

function isPlusSubscriptionPlan(plan: TaskTimerPlan) {
  return plan === "plus" || plan === "plus_monthly" || plan === "plus_yearly" || plan === "pro";
}

const NAV_ITEMS: NavItem[] = [
  {
    page: "dashboard",
    label: "Dashboard",
    ariaLabel: "Dashboard",
    iconSrc: "/icons/icons_default/dashboard.webp",
    desktopId: "commandCenterDashboardBtn",
    mobileId: "footerDashboardBtn",
    href: "/dashboard",
    mobileFooterOrder: 0,
  },
  {
    page: "notes",
    label: "Notes",
    ariaLabel: "Notes",
    iconSrc: "/icons/icons_default/notes.webp",
    desktopId: "commandCenterSessionNotesBtn",
    mobileId: "footerSessionNotesBtn",
    href: "/notes",
    showInMobileFooter: false,
  },
  {
    page: "tasks",
    label: "Tasks",
    ariaLabel: "Tasks",
    iconSrc: "/logo/lime-icon-512.webp",
    desktopId: "commandCenterTasksBtn",
    mobileId: "footerTasksBtn",
    href: "/tasklaunch",
    mobileFooterOrder: 2,
  },
  {
    page: "executive",
    label: "Executive",
    ariaLabel: "Executive",
    iconSrc: "/icons/icons_default/executive.webp",
    desktopId: "commandCenterExecutiveBtn",
    mobileId: "footerExecutiveBtn",
    href: "/executive",
    mobileFooterOrder: 1,
  },
  {
    page: "friends",
    label: "Friends",
    ariaLabel: "Friends",
    iconSrc: "/icons/icons_default/friends.webp",
    desktopId: "commandCenterGroupsBtn",
    mobileId: "footerTest2Btn",
    href: "/friends",
    mobileFooterOrder: 3,
  },
  {
    page: "leaderboard",
    label: "Leaderboards",
    ariaLabel: "Leaderboards",
    iconSrc: "/icons/icons_default/leaderboards.webp",
    desktopId: "commandCenterLeaderboardBtn",
    mobileId: "footerLeaderboardBtn",
    href: "/leaderboards",
    mobileFooterOrder: 4,
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
    iconSrc: "/icons/icons_default/user-guide.webp",
    desktopId: "commandCenterUserGuideBtn",
    mobileId: "footerUserGuideBtn",
    href: "/user-guide",
    showInMobileFooter: false,
  },
  {
    page: "feedback",
    label: "Feedback",
    ariaLabel: "Feedback",
    iconSrc: "/icons/icons_default/question.webp",
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
  return NAV_ITEMS
    .filter((item) => item.showInMobileFooter !== false)
    .sort((left, right) => (left.mobileFooterOrder ?? Number.MAX_SAFE_INTEGER) - (right.mobileFooterOrder ?? Number.MAX_SAFE_INTEGER));
}

export function getMobileFooterUtilityItems() {
  return ["account", "settings", "userGuide"]
    .map((page) => NAV_ITEMS.find((item) => item.page === page))
    .filter((item): item is NavItem => !!item);
}

const MOBILE_FOOTER_SWIPE_THRESHOLD_PX = 70;

const RAIL_TRANSITION_STORAGE_KEY = "tasktimer:railSlideTransition";
function railPageOrder(page: DesktopRailPage) {
  if (page === "dashboard") return 0;
  if (page === "notes") return 1;
  if (page === "tasks") return 2;
  if (page === "executive") return 3;
  if (page === "friends") return 4;
  if (page === "leaderboard") return 5;
  if (page === "account") return 6;
  if (page === "settings") return 7;
  if (page === "userGuide") return 8;
  if (page === "feedback") return 9;
  if (page === "history") return 10;
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
      href={resolveTaskTimerRouteHref(item.href)}
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
    "data-nav-page": item.page,
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
    <a key={item.mobileId} {...commonProps} id={item.mobileId} href={resolveTaskTimerRouteHref(item.href)} onClick={() => rememberRailTransition(activePage, item.page)}>
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
      href={resolveTaskTimerRouteHref(item.href)}
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
      href={resolveTaskTimerRouteHref(item.href)}
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

function readDisplayPlanFromStorage(): TaskTimerPlan {
  return readTaskTimerPlanCacheFromStorage().plan;
}

export function shouldCloseDesktopRailProfileMenuOnPointerDown(
  profileMenu: Pick<Node, "contains"> | null,
  target: Node | null
) {
  return !!profileMenu && !!target && !profileMenu.contains(target);
}

function renderProfileSignOutButton(signOutBusy: boolean, disabled: boolean, onSignOut: () => void) {
  const label = getDesktopRailProfileSignOutLabel(signOutBusy);
  return (
    <button
      key="profile-sign-out"
      className="btn btn-ghost small dashboardRailMenuBtn desktopRailProfileMenuBtn desktopRailProfileSignOutBtn"
      type="button"
      role="menuitem"
      aria-label="Sign Out"
      onClick={onSignOut}
      disabled={disabled}
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
  const [profileSessionNotice, setProfileSessionNotice] = useState("");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileMenuClosing, setProfileMenuClosing] = useState(false);
  const [helpCenterMenuOpen, setHelpCenterMenuOpen] = useState(false);
  const [temporaryModalOpen, setTemporaryModalOpen] = useState(false);
  const [mobileFooterSheetOpen, setMobileFooterSheetOpen] = useState(false);
  const [mobileFooterSheetDragY, setMobileFooterSheetDragY] = useState(0);
  const [isMobileFooterSheetDragging, setIsMobileFooterSheetDragging] = useState(false);
  const profileMenuCloseTimerRef = useRef<number | null>(null);
  const profileMenuRef = useRef<HTMLDetailsElement | null>(null);
  const mobileFooterSwipeRef = useRef<MobileSwipeCloseState>(getResetMobileSwipeCloseState());
  const { signOutBusy, actionBusy, runSignOut } = useSharedProfileSessionActions();

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
      if (googlePhotoUrl && remoteGooglePhotoUrl !== googlePhotoUrl) {
        void saveUserRootPatch(uid, { googlePhotoUrl }).catch(() => {
          // Keep rendering from local auth state when cloud sync is unavailable.
        });
      }
      setProfileEmail(email || remoteEmail);
      setProfileLabel(username || fallbackLabel);
      setProfileAvatarSrc(resolveAvatarSrc(uid, avatarId, avatarCustomSrc, remoteGooglePhotoUrl || googlePhotoUrl));
      const remotePlan = await loadUserRootPlan(uid).catch(() => null);
      if (
        remotePlan === "free" ||
        remotePlan === "pro" ||
        remotePlan === "plus" ||
        remotePlan === "plus_monthly" ||
        remotePlan === "plus_yearly" ||
        remotePlan === "plus_lifetime"
      ) {
        setCurrentPlan(remotePlan);
      }
    } catch {
      // Keep local/auth profile state if user-doc enrichment fails.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncStoredPlan = () => setCurrentPlan(readDisplayPlanFromStorage());
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

  const currentPlanIsPlusSubscription = isPlusSubscriptionPlan(currentPlan);
  const currentPlanLabel = currentPlan === "plus_lifetime" ? "PLUS Lifetime" : currentPlanIsPlusSubscription ? "PLUS" : "Free";
  const currentPlanBadgeLabel = currentPlan === "plus_lifetime" ? "PLUS Lifetime" : currentPlanIsPlusSubscription ? "PLUS" : "FREE";
  const profileInitials = useMemo(() => initialsFromLabel(profileLabel), [profileLabel]);
  const mockNextPaymentDateLabel = useMemo(() => {
    if (currentPlan === "plus_lifetime") return "No renewal. Lifetime access is active.";
    if (!currentPlanIsPlusSubscription) return "No upcoming charge while on Free.";
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 14);
    return nextDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [currentPlan, currentPlanIsPlusSubscription]);

  const handleOpenPricingPage = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open("/#plans", "_blank", "noopener,noreferrer");
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

  useEffect(() => {
    if (!profileMenuOpen || profileMenuClosing || typeof document === "undefined") return undefined;

    const handleProfileMenuOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!shouldCloseDesktopRailProfileMenuOnPointerDown(profileMenuRef.current, target)) return;
      closeProfileMenu();
    };

    document.addEventListener("pointerdown", handleProfileMenuOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleProfileMenuOutsidePointerDown);
    };
  }, [closeProfileMenu, profileMenuClosing, profileMenuOpen]);

  const toggleHelpCenterMenu = useCallback(() => {
    playDropdownClickAudio();
    setHelpCenterMenuOpen((open) => !open);
  }, []);

  const handleProfileSignOut = useCallback(async () => {
    if (actionBusy) return;
    setProfileSessionNotice("");
    try {
      await runSignOut();
    } catch (error: unknown) {
      setShowSignOutConfirm(false);
      setProfileSessionNotice(getErrorMessage(error, "Could not sign out."));
    }
  }, [actionBusy, runSignOut]);

  const resetMobileFooterSheetDrag = useCallback(() => {
    mobileFooterSwipeRef.current = getResetMobileSwipeCloseState();
    setMobileFooterSheetDragY(0);
    setIsMobileFooterSheetDragging(false);
  }, []);

  const closeMobileFooterSheet = useCallback(() => {
    resetMobileFooterSheetDrag();
    setMobileFooterSheetOpen(false);
  }, [resetMobileFooterSheetDrag]);

  const toggleMobileFooterSheetFromKeyboard = useCallback(() => {
    resetMobileFooterSheetDrag();
    setMobileFooterSheetOpen((open) => !open);
  }, [resetMobileFooterSheetDrag]);

  const handleMobileFooterHandlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    mobileFooterSwipeRef.current = getStartMobileSwipeCloseState(event.pointerId, event.clientX, event.clientY);
    setMobileFooterSheetDragY(0);
    setIsMobileFooterSheetDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional in embedded browsers.
    }
  }, []);

  const handleMobileFooterHandlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const swipe = mobileFooterSwipeRef.current;
    if (!swipe.active || swipe.consumed || swipe.pointerId !== event.pointerId) return;
    const nextSwipe = getUpdatedMobileSwipeCloseState(swipe, event.pointerId, event.clientX, event.clientY);
    mobileFooterSwipeRef.current = nextSwipe;
    const direction = mobileFooterSheetOpen ? "down" : "up";
    const dragY = getMobileSwipeCloseDragY(nextSwipe, direction);
    if (dragY <= 0) return;
    event.preventDefault();
    setMobileFooterSheetDragY(mobileFooterSheetOpen ? dragY : -dragY);
  }, [mobileFooterSheetOpen]);

  const handleMobileFooterHandlePointerEnd = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const swipe = mobileFooterSwipeRef.current;
    if (swipe.pointerId !== event.pointerId) return;
    const direction = mobileFooterSheetOpen ? "down" : "up";
    if (shouldCloseFromMobileSwipe(swipe, MOBILE_FOOTER_SWIPE_THRESHOLD_PX, direction)) {
      mobileFooterSwipeRef.current.consumed = true;
      playTaskFlipClickAudio();
      setMobileFooterSheetOpen((open) => !open);
    }
    resetMobileFooterSheetDrag();
  }, [mobileFooterSheetOpen, resetMobileFooterSheetDrag]);

  useEffect(() => {
    if (!mobileFooterSheetOpen || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      playTaskFlipClickAudio();
      closeMobileFooterSheet();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeMobileFooterSheet, mobileFooterSheetOpen]);

  useEffect(() => {
    document.body.classList.toggle("taskLaunchMobileFooterSheetOpen", mobileFooterSheetOpen);
    return () => document.body.classList.remove("taskLaunchMobileFooterSheetOpen");
  }, [mobileFooterSheetOpen]);

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
      const res = await fetch(getApiUrl("/api/stripe/create-billing-portal-session/"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({
          uid,
          returnPath: "/account",
        }),
      });
      const data = await readApiJson<{ url?: string; error?: string }>(res, "Could not open billing management.");
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
                src="/logo/logo_main.png"
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
            </nav>
          </div>

          <div className="desktopRailMiddleSection" aria-hidden="true" />

          <div className="desktopRailBottomSection">
            <details
              ref={profileMenuRef}
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
                    <span className="dashboardProfileName dashboardRailProfileNameRow">
                      <span className="dashboardRailProfileNameText">{profileLabel.toLocaleLowerCase()}</span>
                      <strong className="dashboardRailPlanText" aria-label={`${currentPlanBadgeLabel} plan`}>
                        {currentPlanBadgeLabel}
                      </strong>
                      <span className={`dashboardRailPlanPill dashboardRailPlanPill-${currentPlan}`} aria-label={`${currentPlanBadgeLabel} plan`}>
                        {currentPlanBadgeLabel}
                      </span>
                    </span>
                    {profileEmail ? <span className="dashboardProfileMeta dashboardRailProfileEmail">{profileEmail}</span> : null}
                  </span>
                </span>
              </summary>
              <div className="desktopRailProfileMenuDropdown" role="menu" aria-label="Profile menu">
                <details
                  className="desktopRailProfileSubmenu"
                  open={helpCenterMenuOpen}
                  onPointerEnter={() => setHelpCenterMenuOpen(true)}
                  onPointerLeave={() => setHelpCenterMenuOpen(false)}
                >
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
                      src="/icons/icons_default/headset-help.webp"
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
                {renderProfileSignOutButton(signOutBusy, actionBusy, () => setShowSignOutConfirm(true))}
                {profileSessionNotice ? (
                  <div className="settingsDetailNote desktopRailProfileMenuError" role="alert" aria-live="polite">
                    {profileSessionNotice}
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
        <div className={`appFooterSheet${mobileFooterSheetOpen ? " isOpen" : ""}${isMobileFooterSheetDragging ? " isDragging" : ""}`}>
          <button
            className="appFooterSheetBackdrop"
            type="button"
            tabIndex={mobileFooterSheetOpen ? 0 : -1}
            aria-label="Close navigation utilities"
            onClick={() => {
              playTaskFlipClickAudio();
              closeMobileFooterSheet();
            }}
          />
          <section
            className="appFooterSheetPanel"
            id="mobileFooterUtilities"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation utilities"
            aria-hidden={mobileFooterSheetOpen ? "false" : "true"}
            style={{ "--mobile-footer-sheet-drag-y": `${mobileFooterSheetDragY}px` } as CSSProperties}
          >
            <div className="appFooterSheetUtilities" role="menu" aria-label="Navigation utilities">
              {getMobileFooterUtilityItems().map((item) => (
                <a
                  key={item.mobileId}
                  className="appFooterSheetUtility"
                  href={resolveTaskTimerRouteHref(item.href)}
                  role="menuitem"
                  onClick={closeMobileFooterSheet}
                >
                  <AppImg className="appFooterSheetUtilityIcon" src={item.iconSrc} alt="" aria-hidden="true" />
                  <span>{item.label === "Account" ? "Profile" : item.label}</span>
                </a>
              ))}
              <button
                className="appFooterSheetUtility"
                type="button"
                role="menuitem"
                disabled={actionBusy}
                onClick={() => {
                  closeMobileFooterSheet();
                  setShowSignOutConfirm(true);
                }}
              >
                <AppImg className="appFooterSheetUtilityIcon" src="/icons/icons_default/signout.webp" alt="" aria-hidden="true" />
                <span>{getDesktopRailProfileSignOutLabel(signOutBusy)}</span>
              </button>
            </div>
          </section>
          <div className="appFooterNav" aria-label="App pages">
            <button
              className="appFooterSheetHandle"
              type="button"
              aria-label={mobileFooterSheetOpen ? "Drag down to close navigation utilities" : "Drag up to open navigation utilities"}
              aria-controls="mobileFooterUtilities"
              aria-expanded={mobileFooterSheetOpen}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                toggleMobileFooterSheetFromKeyboard();
              }}
              onPointerDown={handleMobileFooterHandlePointerDown}
              onPointerMove={handleMobileFooterHandlePointerMove}
              onPointerUp={handleMobileFooterHandlePointerEnd}
              onPointerCancel={handleMobileFooterHandlePointerEnd}
            >
              <span aria-hidden="true" />
            </button>
            {getMobileFooterNavItems().map((item) =>
              renderMobileNavItem(item, navActivePage, useClientNavButtons)
            )}
          </div>
        </div>
      ) : null}
      <div className="overlay" id="rewardsInfoOverlay">
        <div className="modal rewardsInfoModal" role="dialog" aria-modal="true" aria-label="Subscription details">
          <h2>{currentPlanLabel} Subscription</h2>
          <p className="modalSubtext">
            {currentPlanIsPlusSubscription
              ? "Manage billing, payment methods, invoices, and cancellation in Stripe's secure customer portal."
              : currentPlan === "plus_lifetime"
                ? "Your lifetime access includes the full PLUS feature set with no renewal date."
                : "Upgrade to PLUS to unlock advanced history, analytics, task setup, backup tools, and social features."}
          </p>
          <div className="rewardsInfoDetailGrid" aria-label="Subscription summary">
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Plan</span>
              <strong className="rewardsInfoDetailValue">{currentPlanLabel}</strong>
            </div>
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Status</span>
              <strong className="rewardsInfoDetailValue">
                {currentPlan === "free" ? "Available" : "Active"}
              </strong>
            </div>
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Billing Cycle</span>
              <strong className="rewardsInfoDetailValue">
                {currentPlan === "plus_lifetime" ? "One-time" : currentPlanIsPlusSubscription ? "Subscription" : "No billing on Free"}
              </strong>
            </div>
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Next Payment Date</span>
              <strong className="rewardsInfoDetailValue">{mockNextPaymentDateLabel}</strong>
            </div>
          </div>
          <div className="rewardsInfoText">
            {currentPlanIsPlusSubscription
              ? "Your PLUS subscription includes advanced history, analytics, task setup, full-history backup tools, and connected social features."
              : currentPlan === "plus_lifetime"
                ? "Your PLUS Lifetime plan includes advanced history, analytics, task setup, full-history backup tools, and connected social features."
              : "Free keeps the core solo workflow unlocked. Upgrade whenever you want the advanced workflow and billing-backed account features."}
          </div>
          {billingError ? (
            <div className="settingsDetailNote" role="alert" aria-live="polite">
              {billingError}
            </div>
          ) : null}
          <div className="confirmBtns rewardsInfoActions">
            {currentPlanIsPlusSubscription ? (
              <button className="btn btn-accent" type="button" onClick={() => void handleOpenBillingPortal()} disabled={billingBusy}>
                {billingBusy ? "Opening Billing..." : "Manage Billing"}
              </button>
            ) : currentPlan === "plus_lifetime" ? (
              <button className="btn btn-accent" type="button" disabled>
                Lifetime Active
              </button>
            ) : (
              <button className="btn btn-accent" type="button" onClick={handleOpenPricingPage}>
                Upgrade to PLUS
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
