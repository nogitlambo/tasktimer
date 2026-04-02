/* eslint-disable @typescript-eslint/no-explicit-any */

import type { TaskTimerAppPageOptions, TaskTimerAppShellContext } from "./context";
import type { AppPage } from "./types";

export function createTaskTimerAppShell(ctx: TaskTimerAppShellContext) {
  function taskTimerRootPath() {
    const pathname = window.location.pathname || "";
    const normalized = pathname.replace(/\/+$/, "");
    const taskTimerMatch = normalized.match(/^(.*?)(\/tasktimer)(?:\/|$)/);
    if (taskTimerMatch) return `${taskTimerMatch[1] || ""}/tasktimer`;
    const pageStyleRoot = normalized.replace(/\/(settings|history-manager|user-guide|feedback|dashboard|friends)$/, "");
    return pageStyleRoot || normalized || "/tasktimer";
  }

  function taskTimerExportBasePath() {
    const pathname = window.location.pathname || "";
    const normalized = pathname.replace(/\/+$/, "");
    const taskTimerMatch = normalized.match(/^(.*?)(\/tasktimer)(?:\/|$)/);
    if (taskTimerMatch) return taskTimerMatch[1] || "";
    return "";
  }

  function appRoute(path: string) {
    if (!path.startsWith("/tasktimer")) return path;
    const hashIndex = path.indexOf("#");
    const queryIndex = path.indexOf("?");
    const cutIndex =
      queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
    const rawPath = cutIndex >= 0 ? path.slice(0, cutIndex) : path;
    const trailing = cutIndex >= 0 ? path.slice(cutIndex) : "";
    const normalizedPath = rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
    const suffix = normalizedPath.replace(/^\/tasktimer/, "");
    const resolved = `${taskTimerRootPath()}${suffix}${trailing}`;

    const currentPath = window.location.pathname || "";
    const capacitorApi = (window as any).Capacitor;
    const isNativeCapacitorRuntime = !!(
      capacitorApi &&
      typeof capacitorApi.isNativePlatform === "function" &&
      capacitorApi.isNativePlatform()
    );
    const usesExportedHtmlPaths =
      window.location.protocol === "file:" || /\.html$/i.test(currentPath) || isNativeCapacitorRuntime;
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
    return /\/tasktimer$/i.test(path) || /\/tasktimer\/index\.html$/i.test(path);
  }

  function isTaskTimerDashboardPath(path: string) {
    return /\/tasktimer\/dashboard$/i.test(path) || /\/tasktimer\/dashboard\/index\.html$/i.test(path);
  }

  function isTaskTimerFriendsPath(path: string) {
    return /\/tasktimer\/friends$/i.test(path) || /\/tasktimer\/friends\/index\.html$/i.test(path);
  }

  function isTaskTimerMainAppPath(path: string) {
    return isTaskTimerTasksPath(path) || isTaskTimerDashboardPath(path) || isTaskTimerFriendsPath(path);
  }

  function appPathForPage(page: AppPage) {
    if (page === "dashboard") return appRoute("/tasktimer/dashboard");
    if (page === "test2") return appRoute("/tasktimer/friends");
    return appRoute("/tasktimer");
  }

  function normalizedPathname() {
    try {
      return (window.location.pathname || "").replace(/\/+$/, "") || "/";
    } catch {
      return "/";
    }
  }

  function getInitialAppPageFromLocation(defaultPage: AppPage = ctx.initialAppPage): AppPage {
    try {
      const path = normalizedPathname();
      if (isTaskTimerDashboardPath(path)) return "dashboard";
      if (isTaskTimerFriendsPath(path)) return "test2";
      const params = new URLSearchParams(window.location.search || "");
      const page = String(params.get("page") || "").toLowerCase();
      if (page === "dashboard") return "dashboard";
      if (page === "test2") return "test2";
    } catch {
      // ignore
    }
    return isTaskTimerTasksPath(normalizedPathname()) ? "tasks" : defaultPage;
  }

  function normalizeTaskTimerRoutePath(pathRaw: string) {
    const trimmed = String(pathRaw || "").trim();
    if (!trimmed) return "";
    const withoutQuery = trimmed.split("#")[0]?.split("?")[0] || "";
    let normalized = withoutQuery.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
    normalized = normalized.replace(/\/index\.html$/i, "");
    if (/\/tasktimer\/settings\.html$/i.test(normalized)) return "/tasktimer/settings";
    if (/\/tasktimer\/history-manager\.html$/i.test(normalized)) return "/tasktimer/history-manager";
    if (/\/tasktimer\/user-guide\.html$/i.test(normalized)) return "/tasktimer/user-guide";
    if (/\/tasktimer\/feedback\.html$/i.test(normalized)) return "/tasktimer/feedback";
    if (/\/tasktimer(?:\/index)?$/i.test(normalized)) return "/tasktimer";
    return normalized;
  }

  function isValidTaskTimerBackRoute(pathRaw: string) {
    const path = normalizeTaskTimerRoutePath(pathRaw);
    return (
      path === "/tasktimer" ||
      path === "/tasktimer/settings" ||
      path === "/tasktimer/history-manager" ||
      path === "/tasktimer/user-guide" ||
      path === "/tasktimer/feedback"
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
    const m = String(token || "").match(/\|page=(tasks|dashboard|test2)$/);
    if (!m) return null;
    const p = m[1];
    if (p === "tasks" || p === "dashboard" || p === "test2") return p;
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
    if (ctx.getCurrentAppPage() === "tasks" && page !== "tasks") ctx.resetAllOpenHistoryChartSelections();
    if (page !== "tasks") ctx.clearTaskFlipStates();
    if (page !== "dashboard" && ctx.getDashboardMenuFlipped()) {
      ctx.setDashboardMenuFlipped(false);
      ctx.syncDashboardMenuFlipUi();
    }
    ctx.setCurrentAppPage(page);
    if (opts?.pushNavStack) pushCurrentScreenToNavStack(page);
    document.body.setAttribute("data-app-page", page);
    ctx.els.appPageTasks?.classList.toggle("appPageOn", page === "tasks");
    ctx.els.appPageDashboard?.classList.toggle("appPageOn", page === "dashboard");
    ctx.els.appPageTest2?.classList.toggle("appPageOn", page === "test2");
    if (ctx.els.modeSwitch) (ctx.els.modeSwitch as HTMLElement).style.display = page === "tasks" ? "flex" : "none";
    ctx.els.footerTasksBtn?.classList.toggle("isOn", page === "tasks");
    ctx.els.footerDashboardBtn?.classList.toggle("isOn", page === "dashboard");
    ctx.els.footerTest2Btn?.classList.toggle("isOn", page === "test2");
    ctx.els.commandCenterTasksBtn?.classList.toggle("isOn", page === "tasks");
    ctx.els.commandCenterDashboardBtn?.classList.toggle("isOn", page === "dashboard");
    ctx.els.commandCenterGroupsBtn?.classList.toggle("isOn", page === "test2");
    if (ctx.els.commandCenterDashboardBtn) {
      if (page === "dashboard") ctx.els.commandCenterDashboardBtn.setAttribute("aria-current", "page");
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
        const nextUrl = appPathForPage(page);
        if (syncUrlMode === "replace") window.history.replaceState({ page }, "", nextUrl);
        else window.history.pushState({ page }, "", nextUrl);
      } catch {
        // ignore history API failures
      }
    }
    ctx.closeTaskExportModal();
    ctx.closeShareTaskModal();
    if (page === "test2") {
      ctx.renderGroupsPage();
      void ctx.refreshGroupsData();
      return;
    }
    ctx.closeFriendProfileModal();
    ctx.closeFriendRequestModal();
    if (page === "tasks") {
      ctx.render();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (ctx.runtime.destroyed || ctx.getCurrentAppPage() !== "tasks") return;
          for (const taskId of ctx.getOpenHistoryTaskIds()) {
            ctx.renderHistory(taskId);
          }
        });
      });
      return;
    }
    if (page === "dashboard" && !opts?.skipDashboardRender) {
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

    let capBackHooked = false;

    try {
      const capApp = getCapAppPlugin();
      if (capApp?.addListener) {
        capBackHooked = true;
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

    if (!capBackHooked) {
      ctx.on(document as any, "backbutton", (e: any) => {
        onNativeBackPressed(e);
      });
    }
  }

  function registerAppShellEvents() {
    ctx.on(document as any, "click", (e: any) => {
      const target = e?.target as HTMLElement | null;
      const modeSwitch = ctx.els.modeSwitch as HTMLDetailsElement | null;
      if (!target || !modeSwitch) return;
      if (!target.closest?.("#modeSwitch")) modeSwitch.open = false;
    });

    ctx.on(ctx.els.footerTasksBtn, "click", () => applyAppPage("tasks", { pushNavStack: true, syncUrl: "push" }));
    ctx.on(ctx.els.footerDashboardBtn, "click", () =>
      applyAppPage("dashboard", { pushNavStack: true, syncUrl: "push" })
    );
    ctx.on(ctx.els.footerTest2Btn, "click", (e: any) => {
      e?.preventDefault?.();
      applyAppPage("test2", { pushNavStack: true, syncUrl: "push" });
    });
    ctx.on(ctx.els.footerSettingsBtn, "click", (e: any) => {
      e?.preventDefault?.();
      navigateToAppRoute("/tasktimer/settings");
    });

    ctx.on(ctx.els.commandCenterTasksBtn, "click", () =>
      applyAppPage("tasks", { pushNavStack: true, syncUrl: "push" })
    );
    ctx.on(ctx.els.commandCenterDashboardBtn, "click", () =>
      applyAppPage("dashboard", { pushNavStack: true, syncUrl: "push" })
    );
    ctx.on(ctx.els.commandCenterGroupsBtn, "click", (e: any) => {
      e?.preventDefault?.();
      applyAppPage("test2", { pushNavStack: true, syncUrl: "push" });
    });
    ctx.on(ctx.els.commandCenterSettingsBtn, "click", (e: any) => {
      e?.preventDefault?.();
      navigateToAppRoute("/tasktimer/settings");
    });

    ctx.on(document as any, "click", (e: any) => {
      const badge = e?.target?.closest?.("#signedInHeaderBadge");
      if (!badge) return;
      e?.preventDefault?.();
      navigateToAppRoute("/tasktimer/settings?pane=general");
    });

    ctx.on(ctx.els.menuIcon, "click", () => {
      navigateToAppRoute("/tasktimer/settings");
    });
  }

  return {
    taskTimerRootPath,
    taskTimerExportBasePath,
    appRoute,
    isTaskTimerTasksPath,
    isTaskTimerDashboardPath,
    isTaskTimerFriendsPath,
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
