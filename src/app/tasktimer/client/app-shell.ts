/* eslint-disable @typescript-eslint/no-explicit-any */

import { ONBOARDING_MODULE_CLICK_EVENT, onboardingModuleStepFromNavPage } from "../lib/onboarding";
import { readStartupAppPagePreference } from "../lib/startupModule";
import type { TaskTimerAppPageOptions, TaskTimerAppShellContext } from "./context";
import type { AppPage } from "./types";

export function createTaskTimerAppShell(ctx: TaskTimerAppShellContext) {
  let appPageSlideTimerId: number | null = null;
  let initialNativeStartupPageResolved = false;
  let userSelectedAppPageBeforeStartupResolution = false;

  function appPageOrder(page: AppPage) {
    const normalized = page === "schedule" ? "tasks" : page;
    if (normalized === "dashboard") return 0;
    if (normalized === "tasks") return 1;
    if (normalized === "friends") return 2;
    if (normalized === "leaderboard") return 3;
    if (normalized === "history") return 4;
    return -1;
  }

  function applyAppPageSlideDirection(nextPage: AppPage) {
    const currentIndex = appPageOrder(ctx.getCurrentAppPage());
    const nextIndex = appPageOrder(nextPage);
    if (currentIndex < 0 || nextIndex < 0 || currentIndex === nextIndex) return;
    const direction = nextIndex > currentIndex ? "forward" : "backward";
    document.body.setAttribute("data-app-page-slide-direction", direction);
    document.body.classList.add("isAppPageSliding");
    if (appPageSlideTimerId != null) window.clearTimeout(appPageSlideTimerId);
    appPageSlideTimerId = window.setTimeout(() => {
      document.body.classList.remove("isAppPageSliding");
      document.body.removeAttribute("data-app-page-slide-direction");
      appPageSlideTimerId = null;
    }, 220);
  }

  function isKnownAppRoute(path: string) {
    return (
      path === "/tasklaunch" ||
      path === "/dashboard" ||
      path === "/friends" ||
      path === "/leaderboard" ||
      path === "/settings" ||
      path === "/history-manager" ||
      path === "/user-guide" ||
      path === "/feedback"
    );
  }

  function taskTimerRootPath() {
    return "/tasklaunch";
  }

  function taskTimerExportBasePath() {
    return "";
  }

  function appRoute(path: string) {
    const input = String(path || "").trim();
    if (!input) return "/tasklaunch";
    const hashIndex = path.indexOf("#");
    const queryIndex = path.indexOf("?");
    const cutIndex =
      queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
    const rawPath = cutIndex >= 0 ? path.slice(0, cutIndex) : path;
    const trailing = cutIndex >= 0 ? path.slice(cutIndex) : "";
    const normalizedPath = rawPath.replace(/\/+$/, "") || "/";
    const resolvedPath = isKnownAppRoute(normalizedPath) ? normalizedPath : input.startsWith("/tasklaunch") ? "/tasklaunch" : input;
    const resolved = `${resolvedPath}${trailing}`;

    const usesExportedHtmlPaths = isNativeOrExportRuntime();
    if (!usesExportedHtmlPaths) return resolved;

    const resolvedHashIndex = resolved.indexOf("#");
    const resolvedQueryIndex = resolved.indexOf("?");
    const resolvedCutIndex =
      resolvedQueryIndex === -1
        ? resolvedHashIndex
        : resolvedHashIndex === -1
          ? resolvedQueryIndex
          : Math.min(resolvedQueryIndex, resolvedHashIndex);
    const resolvedPathOnly = resolvedCutIndex >= 0 ? resolved.slice(0, resolvedCutIndex) : resolved;
    const resolvedTrailing = resolvedCutIndex >= 0 ? resolved.slice(resolvedCutIndex) : "";
    if (/\/index\.html$/i.test(resolvedPathOnly)) return resolved;
    const noTrailingSlash = resolvedPathOnly.replace(/\/+$/, "");
    return `${noTrailingSlash}/index.html${resolvedTrailing}`;
  }

  function isTaskTimerTasksPath(path: string) {
    return /\/tasklaunch$/i.test(path) || /\/tasklaunch\/index\.html$/i.test(path);
  }

  function isTaskTimerDashboardPath(path: string) {
    return /\/dashboard$/i.test(path) || /\/dashboard\/index\.html$/i.test(path);
  }

  function isTaskTimerFriendsPath(path: string) {
    return /\/friends$/i.test(path) || /\/friends\/index\.html$/i.test(path);
  }

  function isTaskTimerLeaderboardPath(path: string) {
    return /\/leaderboard$/i.test(path) || /\/leaderboard\/index\.html$/i.test(path);
  }

  function isTaskTimerMainAppPath(path: string) {
    return (
      isTaskTimerTasksPath(path) ||
      isTaskTimerDashboardPath(path) ||
      isTaskTimerFriendsPath(path) ||
      isTaskTimerLeaderboardPath(path) ||
      /\/history-manager$/i.test(path) ||
      /\/history-manager\/index\.html$/i.test(path)
    );
  }

  function appPathForPage(page: AppPage) {
    if (page === "dashboard") return appRoute("/dashboard");
    if (page === "friends") return appRoute("/friends");
    if (page === "leaderboard") return appRoute("/leaderboard");
    if (page === "history") return appRoute("/history-manager");
    if (page === "schedule") return appRoute("/tasklaunch?page=schedule");
    return appRoute("/tasklaunch");
  }

  function normalizedPathname() {
    try {
      return (window.location.pathname || "").replace(/\/+$/, "") || "/";
    } catch {
      return "/";
    }
  }

  function isNativeOrExportRuntime() {
    const currentPath = window.location.pathname || "";
    const capacitorApi = (window as any).Capacitor;
    const isNativeCapacitorRuntime = !!(
      capacitorApi &&
      typeof capacitorApi.isNativePlatform === "function" &&
      capacitorApi.isNativePlatform()
    );
    return window.location.protocol === "file:" || /\.html$/i.test(currentPath) || isNativeCapacitorRuntime;
  }

  function getInitialAppPageFromLocation(defaultPage: AppPage = ctx.initialAppPage): AppPage {
    try {
      const isFirstInitialPageResolution = !initialNativeStartupPageResolved;
      initialNativeStartupPageResolved = true;
      const path = normalizedPathname();
      const params = new URLSearchParams(window.location.search || "");
      const page = String(params.get("page") || "").toLowerCase();
      if (page === "dashboard") return "dashboard";
      if (page === "schedule") return "schedule";
      if (page === "friends") return "friends";
      if (page === "leaderboard") return "leaderboard";
      if (page === "history") return "history";
      if (userSelectedAppPageBeforeStartupResolution && isTaskTimerMainAppPath(path)) {
        return ctx.getCurrentAppPage();
      }
      if (isTaskTimerDashboardPath(path)) return "dashboard";
      if (isTaskTimerFriendsPath(path)) return "friends";
      if (isTaskTimerLeaderboardPath(path)) return "leaderboard";
      if (/\/history-manager(?:\/index\.html)?$/i.test(path)) return "history";
      if (isFirstInitialPageResolution && isNativeOrExportRuntime() && isTaskTimerMainAppPath(path)) {
        return readStartupAppPagePreference();
      }
      if (isTaskTimerTasksPath(path)) return readStartupAppPagePreference();
    } catch {
      // ignore
    }
    return isTaskTimerTasksPath(normalizedPathname()) ? readStartupAppPagePreference() : defaultPage;
  }

  function normalizeTaskTimerRoutePath(pathRaw: string) {
    const trimmed = String(pathRaw || "").trim();
    if (!trimmed) return "";
    const withoutQuery = trimmed.split("#")[0]?.split("?")[0] || "";
    let normalized = withoutQuery.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
    normalized = normalized.replace(/\/index\.html$/i, "");
    if (/\/settings(?:\/index)?$/i.test(normalized) || /\/settings\.html$/i.test(normalized)) return "/settings";
    if (/\/history-manager(?:\/index)?$/i.test(normalized) || /\/history-manager\.html$/i.test(normalized)) return "/history-manager";
    if (/\/user-guide(?:\/index)?$/i.test(normalized) || /\/user-guide\.html$/i.test(normalized)) return "/user-guide";
    if (/\/feedback(?:\/index)?$/i.test(normalized) || /\/feedback\.html$/i.test(normalized)) return "/feedback";
    if (/\/dashboard(?:\/index)?$/i.test(normalized)) return "/dashboard";
    if (/\/friends(?:\/index)?$/i.test(normalized)) return "/friends";
    if (/\/leaderboard(?:\/index)?$/i.test(normalized)) return "/leaderboard";
    if (/\/tasklaunch(?:\/index)?$/i.test(normalized)) return "/tasklaunch";
    return normalized;
  }

  function isValidTaskTimerBackRoute(pathRaw: string) {
    const path = normalizeTaskTimerRoutePath(pathRaw);
    return (
      path === "/tasklaunch" ||
      path === "/settings" ||
      path === "/history-manager" ||
      path === "/user-guide" ||
      path === "/feedback"
    );
  }

  function screenTokenForCurrent(pageOverride?: AppPage) {
    const path = normalizedPathname();
    if (isTaskTimerMainAppPath(path)) {
      const page = pageOverride || ctx.getCurrentAppPage() || "tasks";
      return `app:tasktimer|page=${page}`;
    }
    return `route:${path}`;
  }

  function parseAppPageFromToken(token: string | null | undefined): AppPage | null {
    const m = String(token || "").match(/\|page=(tasks|schedule|dashboard|friends|leaderboard|history)$/);
    if (!m) return null;
    const p = m[1];
    if (p === "tasks" || p === "schedule" || p === "dashboard" || p === "friends" || p === "leaderboard" || p === "history") return p;
    return null;
  }

  function normalizeNavStack(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => String(entry || "").trim())
      .filter((entry) => !!entry)
      .slice(-ctx.navStackMax);
  }

  function loadNavStack(): string[] {
    try {
      const raw = localStorage.getItem(ctx.navStackKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const next = normalizeNavStack(parsed);
        ctx.setNavStackMemory(next.slice());
        return next;
      }
    } catch {
      // ignore localStorage/JSON failures
    }
    const fallback = normalizeNavStack(ctx.getNavStackMemory());
    ctx.setNavStackMemory(fallback.slice());
    return fallback;
  }

  function saveNavStack(stack: string[]) {
    const next = normalizeNavStack(stack);
    ctx.setNavStackMemory(next.slice());
    try {
      if (next.length) localStorage.setItem(ctx.navStackKey, JSON.stringify(next));
      else localStorage.removeItem(ctx.navStackKey);
    } catch {
      // ignore localStorage failures
    }
  }

  function pushCurrentScreenToNavStack(pageOverride?: AppPage) {
    if (ctx.getSuppressNavStackPush()) return;
    const token = screenTokenForCurrent(pageOverride);
    const stack = loadNavStack();
    if (stack[stack.length - 1] === token) return;
    stack.push(token);
    saveNavStack(stack);
  }

  function ensureNavStackCurrentScreen() {
    pushCurrentScreenToNavStack();
  }

  function dispatchOnboardingModuleClick(pageRaw: string) {
    const step = onboardingModuleStepFromNavPage(pageRaw);
    if (!step) return;
    window.dispatchEvent(new CustomEvent(ONBOARDING_MODULE_CLICK_EVENT, { detail: { step } }));
  }

  function navigateToAppRoute(path: string) {
    if (ctx.getCurrentAppPage() === "tasks") ctx.resetAllOpenHistoryChartSelections();
    pushCurrentScreenToNavStack();
    window.location.href = appRoute(path);
  }

  function getCapAppPlugin() {
    const cap = (window as any)?.Capacitor;
    if (!cap) return null;
    const direct = cap?.Plugins?.App || cap?.App;
    if (direct) return direct;
    if (typeof cap?.registerPlugin === "function") {
      try {
        return cap.registerPlugin("App");
      } catch {
        return null;
      }
    }
    return null;
  }

  function exitAppNow() {
    try {
      const capApp = getCapAppPlugin();
      if (capApp?.exitApp) {
        capApp.exitApp();
        return;
      }
    } catch {
      // ignore
    }
    try {
      const navApp = (navigator as any)?.app;
      if (navApp?.exitApp) {
        navApp.exitApp();
        return;
      }
    } catch {
      // ignore
    }
    try {
      window.close();
    } catch {
      // ignore
    }
  }

  function canUseBrowserHistoryFallback(currentPath: string) {
    try {
      if ((window.history?.length || 0) <= 1) return false;
      const referrer = String(document.referrer || "").trim();
      if (!referrer) return false;
      const url = new URL(referrer, window.location.href);
      if (url.origin !== window.location.origin) return false;
      const refPath = normalizeTaskTimerRoutePath(url.pathname || "");
      const nowPath = normalizeTaskTimerRoutePath(currentPath);
      return !!refPath && refPath !== nowPath && isValidTaskTimerBackRoute(refPath);
    } catch {
      return false;
    }
  }

  function resolveBackNavigationTarget(token: string, currentToken: string, currentPath: string) {
    const rawToken = String(token || "").trim();
    if (!rawToken || rawToken === currentToken) return null;

    if (rawToken.startsWith("app:")) {
      const page = parseAppPageFromToken(rawToken);
      if (!page) return null;
      if (screenTokenForCurrent(page) === currentToken) return null;
      return { kind: "app" as const, page };
    }

    if (rawToken.startsWith("route:")) {
      const routePath = normalizeTaskTimerRoutePath(rawToken.slice("route:".length));
      const currentRoutePath = normalizeTaskTimerRoutePath(currentPath);
      if (!routePath || routePath === currentRoutePath) return null;
      if (!isValidTaskTimerBackRoute(routePath)) return null;
      return { kind: "route" as const, path: routePath };
    }

    return null;
  }

  function applyAppPage(page: AppPage, opts?: TaskTimerAppPageOptions) {
    if (opts?.syncUrl === "push" || opts?.pushNavStack) {
      userSelectedAppPageBeforeStartupResolution = true;
    }

    const hasTasksPage = !!ctx.els.appPageTasks;
    const hasDashboardPage = !!ctx.els.appPageDashboard;
    const hasFriendsPage = !!ctx.els.appPageFriends;
    const hasLeaderboardPage = !!ctx.els.appPageLeaderboard;

    const targetPageMissing =
      (page === "tasks" && !hasTasksPage) ||
      (page === "schedule" && !ctx.els.appPageSchedule) ||
      (page === "dashboard" && !hasDashboardPage) ||
      (page === "friends" && !hasFriendsPage) ||
      (page === "leaderboard" && !hasLeaderboardPage) ||
      (page === "history" && !ctx.els.appPageHistory);

    if (targetPageMissing) {
      if (isTaskTimerMainAppPath(normalizedPathname())) {
        if (opts?.pushNavStack) pushCurrentScreenToNavStack();
        window.location.href = appPathForPage(page);
      }
      return;
    }

    const previousPage = ctx.getCurrentAppPage();
    const nextPage: AppPage = page;

    applyAppPageSlideDirection(nextPage);

    if ((ctx.getCurrentAppPage() === "tasks" || ctx.getCurrentAppPage() === "schedule") && nextPage !== "tasks" && nextPage !== "schedule") {
      ctx.resetAllOpenHistoryChartSelections();
    }
    if (nextPage !== "tasks" && nextPage !== "schedule") ctx.clearTaskFlipStates();
    if (nextPage !== "dashboard" && ctx.getDashboardMenuFlipped()) {
      ctx.setDashboardMenuFlipped(false);
      ctx.syncDashboardMenuFlipUi();
    }
    ctx.setCurrentAppPage(nextPage);
    if (opts?.pushNavStack) pushCurrentScreenToNavStack(nextPage);
    document.body.setAttribute("data-app-page", nextPage);
    ctx.els.appPageTasks?.classList.toggle("appPageOn", nextPage === "tasks" || nextPage === "schedule");
    ctx.els.appPageSchedule?.classList.toggle("isOpen", nextPage === "schedule");
    ctx.els.appPageSchedule?.setAttribute("aria-hidden", nextPage === "schedule" ? "false" : "true");
    ctx.els.appPageDashboard?.classList.toggle("appPageOn", nextPage === "dashboard");
    ctx.els.appPageFriends?.classList.toggle("appPageOn", nextPage === "friends");
    ctx.els.appPageLeaderboard?.classList.toggle("appPageOn", nextPage === "leaderboard");
    ctx.els.appPageHistory?.classList.toggle("appPageOn", nextPage === "history");
    ctx.els.footerTasksBtn?.classList.toggle("isOn", nextPage === "tasks" || nextPage === "schedule");
    ctx.els.footerDashboardBtn?.classList.toggle("isOn", nextPage === "dashboard");
    ctx.els.footerTest2Btn?.classList.toggle("isOn", nextPage === "friends");
    ctx.els.footerLeaderboardBtn?.classList.toggle("isOn", nextPage === "leaderboard");
    ctx.els.commandCenterTasksBtn?.classList.toggle("isOn", nextPage === "tasks" || nextPage === "schedule");
    ctx.els.commandCenterDashboardBtn?.classList.toggle("isOn", nextPage === "dashboard");
    ctx.els.commandCenterGroupsBtn?.classList.toggle("isOn", nextPage === "friends");
    ctx.els.commandCenterLeaderboardBtn?.classList.toggle("isOn", nextPage === "leaderboard");
    ctx.els.commandCenterHistoryBtn?.classList.toggle("isOn", nextPage === "history");
    document.querySelectorAll<HTMLElement>("[data-screen-pill]").forEach((pill) => {
      const pillPage = String(pill.dataset.screenPill || "").trim();
      const isOn = pillPage === nextPage;
      pill.classList.toggle("isOn", isOn);
      if (isOn) pill.setAttribute("aria-current", "page");
      else pill.removeAttribute("aria-current");
    });
    if (ctx.els.commandCenterDashboardBtn) {
      if (nextPage === "dashboard") ctx.els.commandCenterDashboardBtn.setAttribute("aria-current", "page");
      else ctx.els.commandCenterDashboardBtn.removeAttribute("aria-current");
    }
    if (ctx.els.signedInHeaderBadge) {
      ctx.els.signedInHeaderBadge.style.display = "inline-flex";
    }
    ctx.renderFriendsFooterAlertBadge();
    const syncUrlMode = opts?.syncUrl;
    const canSyncMainPageUrl = isTaskTimerMainAppPath(normalizedPathname());
    if (syncUrlMode && canSyncMainPageUrl) {
      try {
        const nextUrl = appPathForPage(nextPage);
        if (syncUrlMode === "replace") window.history.replaceState({ page: nextPage }, "", nextUrl);
        else window.history.pushState({ page: nextPage }, "", nextUrl);
      } catch {
        // ignore history API failures
      }
    }
    ctx.closeTaskExportModal();
    ctx.closeShareTaskModal();
    if (nextPage === "friends") {
      ctx.renderGroupsPage();
      void ctx.refreshGroupsData();
      return;
    }
    if (nextPage === "history") {
      ctx.openHistoryManager();
      return;
    }
    ctx.closeFriendProfileModal();
    ctx.closeFriendRequestModal();
    if (nextPage === "tasks" || nextPage === "schedule") {
      const shouldSnapScheduleOnOpen =
        nextPage === "schedule" && (previousPage !== "schedule" || opts?.syncUrl === "replace");
      if (shouldSnapScheduleOnOpen) {
        ctx.requestScheduleEntryScroll("open");
      }
      ctx.render();
      if (nextPage === "tasks") {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (ctx.runtime.destroyed || (ctx.getCurrentAppPage() !== "tasks" && ctx.getCurrentAppPage() !== "schedule")) return;
            for (const taskId of ctx.getOpenHistoryTaskIds()) {
              ctx.renderHistory(taskId);
            }
          });
        });
      }
      return;
    }
    if (nextPage === "dashboard" && !opts?.skipDashboardRender) {
      ctx.renderDashboardWidgets();
    }
  }

  function handleAppBackNavigation(): boolean {
    if (ctx.closeTopOverlayIfOpen()) return true;
    if (ctx.closeMobileDetailPanelIfOpen()) return true;

    const path = normalizedPathname();
    const stack = loadNavStack();
    const currentToken = screenTokenForCurrent();
    while (stack.length && stack[stack.length - 1] === currentToken) stack.pop();
    let nextTarget: ReturnType<typeof resolveBackNavigationTarget> = null;
    while (stack.length && !nextTarget) {
      const candidate = stack.pop() || "";
      nextTarget = resolveBackNavigationTarget(candidate, currentToken, path);
    }
    saveNavStack(stack);

    if (nextTarget?.kind === "app") {
      ctx.setSuppressNavStackPush(true);
      applyAppPage(nextTarget.page);
      ctx.setSuppressNavStackPush(false);
      ensureNavStackCurrentScreen();
      return true;
    }

    if (nextTarget?.kind === "route") {
      window.location.href = appRoute(nextTarget.path);
      return true;
    }

    if (canUseBrowserHistoryFallback(path)) {
      window.history.back();
      return true;
    }

    ctx.showExitAppConfirm();
    return true;
  }

  function onNativeBackPressed(ev?: any) {
    try {
      ev?.preventDefault?.();
    } catch {
      // ignore
    }
    const now = Date.now();
    if (now - ctx.getLastNativeBackHandledAtMs() < ctx.nativeBackDebounceMs) return;
    ctx.setLastNativeBackHandledAtMs(now);
    handleAppBackNavigation();
  }

  function registerNativeBackFallbackListeners() {
    const invokeNativeBack = (ev?: any) => {
      onNativeBackPressed(ev);
    };

    const onIonBackButton = (ev: any) => {
      const register = ev?.detail?.register;
      if (typeof register !== "function") {
        invokeNativeBack(ev);
        return;
      }
      try {
        register(1000, (processNext?: () => void) => {
          invokeNativeBack(ev);
          void processNext;
        });
      } catch {
        invokeNativeBack(ev);
      }
    };

    ctx.on(document as any, "backbutton", invokeNativeBack as any);
    ctx.on(window as any, "backbutton", invokeNativeBack as any);
    ctx.on(document as any, "ionBackButton", onIonBackButton as any);
  }

  function initMobileBackHandling() {
    ensureNavStackCurrentScreen();

    const onPopState = () => {
      const path = normalizedPathname();
      if (!isTaskTimerMainAppPath(path)) return;
      const nextPage = getInitialAppPageFromLocation();
      ctx.setSuppressNavStackPush(true);
      applyAppPage(nextPage);
      ctx.setSuppressNavStackPush(false);
      ensureNavStackCurrentScreen();
    };
    ctx.on(window, "popstate", onPopState as any);

    try {
      const capApp = getCapAppPlugin();
      if (capApp?.addListener) {
        const maybePromise = capApp.addListener("backButton", (ev: any) => {
          onNativeBackPressed(ev);
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise
            .then((h: any) => {
              if (h?.remove) ctx.runtime.removeCapBackListener = () => h.remove();
            })
            .catch(() => {});
        } else if (maybePromise?.remove) {
          ctx.runtime.removeCapBackListener = () => maybePromise.remove();
        }
      }
    } catch {
      // ignore
    }

    registerNativeBackFallbackListeners();
  }

  function registerAppShellEvents() {
    ctx.on(ctx.els.footerTasksBtn, "click", () => applyAppPage("tasks", { pushNavStack: true, syncUrl: "push" }));
    ctx.on(ctx.els.footerDashboardBtn, "click", () =>
      applyAppPage("dashboard", { pushNavStack: true, syncUrl: "push" })
    );
    ctx.on(ctx.els.footerTest2Btn, "click", (e: any) => {
      e?.preventDefault?.();
      applyAppPage("friends", { pushNavStack: true, syncUrl: "push" });
    });
    ctx.on(ctx.els.footerLeaderboardBtn, "click", (e: any) => {
      e?.preventDefault?.();
      applyAppPage("leaderboard", { pushNavStack: true, syncUrl: "push" });
    });
    ctx.on(ctx.els.footerSettingsBtn, "click", (e: any) => {
      e?.preventDefault?.();
      navigateToAppRoute("/settings");
    });

    ctx.on(ctx.els.commandCenterTasksBtn, "click", (e: any) => {
      dispatchOnboardingModuleClick("tasks");
      if (e?.defaultPrevented) return;
      applyAppPage("tasks", { pushNavStack: true, syncUrl: "push" });
    });
    ctx.on(ctx.els.openScheduleBtn, "click", () => applyAppPage("schedule", { pushNavStack: true, syncUrl: "push" }));
    ctx.on(ctx.els.closeScheduleBtn, "click", () => applyAppPage("tasks", { pushNavStack: true, syncUrl: "push" }));
    ctx.on(ctx.els.scheduleAddTaskBtn, "click", () => {
      ctx.els.openAddTaskBtn?.click();
    });
    ctx.on(ctx.els.commandCenterDashboardBtn, "click", (e: any) => {
      dispatchOnboardingModuleClick("dashboard");
      if (e?.defaultPrevented) return;
      applyAppPage("dashboard", { pushNavStack: true, syncUrl: "push" });
    });
    ctx.on(ctx.els.commandCenterGroupsBtn, "click", (e: any) => {
      dispatchOnboardingModuleClick("friends");
      if (e?.defaultPrevented) return;
      e?.preventDefault?.();
      applyAppPage("friends", { pushNavStack: true, syncUrl: "push" });
    });
    ctx.on(ctx.els.commandCenterLeaderboardBtn, "click", (e: any) => {
      dispatchOnboardingModuleClick("leaderboard");
      if (e?.defaultPrevented) return;
      e?.preventDefault?.();
      applyAppPage("leaderboard", { pushNavStack: true, syncUrl: "push" });
    });
    ctx.on(ctx.els.commandCenterHistoryBtn, "click", (e: any) => {
      if (e?.defaultPrevented) return;
      e?.preventDefault?.();
      applyAppPage("history", { pushNavStack: true, syncUrl: "push" });
    });
    ctx.on(ctx.els.commandCenterSettingsBtn, "click", (e: any) => {
      dispatchOnboardingModuleClick("settings");
      if (e?.defaultPrevented) return;
      e?.preventDefault?.();
      navigateToAppRoute("/settings");
    });

    ctx.on(document as any, "click", (e: any) => {
      const badge = e?.target?.closest?.("#signedInHeaderBadge");
      if (!badge) return;
      e?.preventDefault?.();
      navigateToAppRoute("/settings?pane=general");
    });
  }

  return {
    taskTimerRootPath,
    taskTimerExportBasePath,
    appRoute,
    isTaskTimerTasksPath,
    isTaskTimerDashboardPath,
    isTaskTimerFriendsPath,
    isTaskTimerLeaderboardPath,
    isTaskTimerMainAppPath,
    appPathForPage,
    getInitialAppPageFromLocation,
    normalizedPathname,
    normalizeTaskTimerRoutePath,
    isValidTaskTimerBackRoute,
    screenTokenForCurrent,
    parseAppPageFromToken,
    normalizeNavStack,
    loadNavStack,
    saveNavStack,
    pushCurrentScreenToNavStack,
    ensureNavStackCurrentScreen,
    navigateToAppRoute,
    getCapAppPlugin,
    exitAppNow,
    handleAppBackNavigation,
    onNativeBackPressed,
    initMobileBackHandling,
    applyAppPage,
    registerAppShellEvents,
  };
}
