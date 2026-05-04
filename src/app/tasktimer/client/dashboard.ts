import type { TaskTimerDashboardContext } from "./context";
import type { DashboardAvgRange, DashboardCardPlacement, DashboardCardSize, DashboardRenderOptions } from "./types";
import {
  clampDashboardPlacement,
  getDashboardGridColumnValue,
  resolveDashboardCardPlacements,
  sanitizeDashboardCardPlacements,
} from "./dashboard-layout";
import {
  ONBOARDING_DASHBOARD_CLICK_EVENT,
  readOnboardingDashboardPanelStepForCurrentSession,
  readOnboardingStatusForCurrentSession,
} from "../lib/onboarding";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";

/* eslint-disable @typescript-eslint/no-explicit-any */

type DashboardClosestTarget = {
  closest?: (selector: string) => unknown;
} | null;

function isQuarterDefaultDashboardCard(cardId: string) {
  return (
    cardId === "week-hours" ||
    cardId === "weekly-time-goals" ||
    cardId === "tasks-completed"
  );
}

function isHalfDefaultDashboardCard(cardId: string) {
  return cardId === "momentum" || cardId === "avg-session-by-task" || cardId === "heatmap";
}

function isFixedFullWidthDashboardCard(_cardId: string) {
  return false;
}

function isFixedHalfWidthDashboardCard(cardId: string) {
  return cardId === "momentum";
}

function isFixedDashboardCard(cardId: string) {
  return isFixedFullWidthDashboardCard(cardId) || isFixedHalfWidthDashboardCard(cardId);
}

export function sanitizeDashboardCardSize(value: unknown, cardId?: string | null): DashboardCardSize | null {
  const normalizedCardId = String(cardId || "").trim();
  if (isFixedFullWidthDashboardCard(normalizedCardId)) return "full";
  if (isFixedHalfWidthDashboardCard(normalizedCardId)) return "half";
  if (value === "eighth") return isQuarterDefaultDashboardCard(normalizedCardId) ? "quarter" : null;
  if (value === "full" || value === "half" || value === "quarter") return value;
  return null;
}

export function isDashboardCardSizeOptionAllowed(size: string, _cardId: string) {
  return size === "full" || size === "half" || size === "quarter";
}

export function shouldUsePointerDashboardDrag(event: { button?: number; isPrimary?: boolean | null }) {
  if (typeof event.button === "number" && event.button !== 0) return false;
  if (event.isPrimary === false) return false;
  return true;
}

export function shouldIgnoreDashboardPointerDragStartTarget(target: DashboardClosestTarget) {
  if (!target?.closest) return false;
  if (target.closest(".dashboardSizeControl")) return true;
  if (target.closest("input, select, textarea")) return true;
  if (
    target.closest(
      "#dashboardRefreshBtn, #dashboardPanelMenuBtn, #dashboardEditBtn, #dashboardEditCancelBtn, #dashboardEditDoneBtn, #dashboardPanelMenuBackBtn"
    )
  ) {
    return true;
  }
  return false;
}

export function shouldOpenDashboardLockedUpgradePrompt(editMode: boolean) {
  return !editMode;
}

export function createTaskTimerDashboard(ctx: TaskTimerDashboardContext) {
  const { els } = ctx;
  const DASHBOARD_PANEL_REGISTRY = [
    { panelId: "week-hours", label: "Today" },
    { panelId: "weekly-time-goals", label: "This Week" },
    { panelId: "tasks-completed", label: "Tasks Completed" },
    { panelId: "momentum", label: "Momentum" },
    { panelId: "avg-session-by-task", label: "Avg Session by Task" },
    { panelId: "heatmap", label: "Focus Heatmap" },
  ] as const;
  let dashboardPointerDrag:
    | {
        card: HTMLElement;
        pointerId: number;
        startX: number;
        startY: number;
        active: boolean;
      }
    | null = null;

  function getDashboardGridEl() {
    return (document.querySelector("#appPageDashboard .dashboardGrid") as HTMLElement | null) || els.dashboardGrid || null;
  }

  function getDashboardPanelMenuListEl() {
    return (document.getElementById("dashboardPanelMenuList") as HTMLElement | null) || els.dashboardPanelMenuList || null;
  }

  function getCloudDashboardRecord() {
    const cached = ctx.getCloudDashboardCache();
    if (cached && typeof cached === "object") return cached as { order?: unknown; widgets?: unknown };
    const loaded = ctx.loadCachedDashboard();
    return loaded && typeof loaded === "object" ? (loaded as { order?: unknown; widgets?: unknown }) : null;
  }

  function getDashboardGridColumnCount(grid: HTMLElement) {
    if (typeof window === "undefined") return 12;
    const template = window.getComputedStyle(grid).gridTemplateColumns || "";
    const count = template
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean).length;
    return Math.max(1, count || 12);
  }

  function sanitizeDashboardAvgRange(value: unknown): DashboardAvgRange {
    const raw = String(value || "").trim();
    if (raw === "past30" || raw === "currentMonth") return "past30";
    if (raw === "currentWeek") return "past7";
    return "past7";
  }

  function isAdvancedDashboardCard(cardId: string) {
    return (
      cardId === "momentum" ||
      cardId === "avg-session-by-task" ||
      cardId === "heatmap"
    );
  }

  function shouldForceVisibleDashboardCard(cardId: string) {
    return isAdvancedDashboardCard(cardId) && !ctx.hasEntitlement("advancedInsights");
  }

  function getDashboardLockedFeatureLabel(cardId: string) {
    if (cardId === "momentum") return "Momentum insights";
    if (cardId === "avg-session-by-task") return "Average session insights";
    if (cardId === "heatmap") return "Focus heatmap insights";
    return "Advanced insights";
  }

  function ensureDashboardIncludedModesValid() {}

  function collectDashboardPanelMeta() {
    const out = [] as Array<{ panel: HTMLElement; panelId: string; label: string }>;
    DASHBOARD_PANEL_REGISTRY.forEach(({ panelId, label }) => {
      const panel = document.querySelector(
        `#appPageDashboard [data-dashboard-id="${panelId}"]`
      ) as HTMLElement | null;
      if (!panel) return;
      const customLabel = String(panel.getAttribute("data-dashboard-label") || "").trim();
      const titleEl = panel.querySelector(".dashboardCardTitle") as HTMLElement | null;
      const title = String(titleEl?.textContent || "").trim();
      const ariaLabel = String(panel.getAttribute("aria-label") || "").trim();
      out.push({
        panel,
        panelId,
        label: customLabel || title || ariaLabel || label,
      });
    });
    return out;
  }

  function isDashboardCardVisible(cardId: string) {
    if (shouldForceVisibleDashboardCard(cardId)) return true;
    return ctx.getDashboardCardVisibility()[cardId] !== false;
  }

  function getDashboardCardVisibilityMapForStorage() {
    const cardVisibility = ctx.getDashboardCardVisibility();
    const out: Record<string, boolean> = {};
    collectDashboardPanelMeta().forEach(({ panelId }) => {
      out[panelId] = cardVisibility[panelId] !== false;
    });
    return out;
  }

  function syncDashboardPanelMenuState() {
    const menuList = getDashboardPanelMenuListEl();
    if (!menuList) return;
    const meta = collectDashboardPanelMeta();
    const visibleCount = meta.reduce((count, row) => (isDashboardCardVisible(row.panelId) ? count + 1 : count), 0);
    Array.from(menuList.querySelectorAll("input[data-dashboard-panel-id]")).forEach((node) => {
      const checkbox = node as HTMLInputElement;
      const panelId = String(checkbox.getAttribute("data-dashboard-panel-id") || "");
      const isVisible = isDashboardCardVisible(panelId);
      checkbox.checked = isVisible;
      checkbox.disabled = shouldForceVisibleDashboardCard(panelId);
    });
    const bulkToggleBtn = menuList.querySelector("[data-dashboard-panel-bulk-toggle]") as HTMLButtonElement | null;
    if (bulkToggleBtn) {
      const allSelected = meta.length > 0 && visibleCount === meta.length;
      bulkToggleBtn.textContent = allSelected ? "Clear" : "Select All";
      bulkToggleBtn.setAttribute("aria-label", allSelected ? "Clear all dashboard panels" : "Select all dashboard panels");
      bulkToggleBtn.hidden = !meta.length;
    }
    ctx.syncDashboardRefreshButtonUi();
  }

  function renderDashboardPanelMenu() {
    const menuList = getDashboardPanelMenuListEl();
    if (!menuList) return;
    const meta = collectDashboardPanelMeta();
    menuList.innerHTML = "";
    if (!meta.length) return;
    const appendSectionBody = (className?: string) => {
      const body = document.createElement("div");
      body.className = className ? `dashboardPanelMenuSectionBody ${className}` : "dashboardPanelMenuSectionBody";
      menuList.appendChild(body);
      return body;
    };
    const appendSectionTitle = (title: string, opts?: { bulkToggle?: boolean }) => {
      const heading = document.createElement("div");
      heading.className = "dashboardPanelMenuSectionTitle";
      const titleText = document.createElement("span");
      titleText.textContent = title;
      heading.appendChild(titleText);
      if (opts?.bulkToggle) {
        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "dashboardPanelMenuSectionAction";
        actionBtn.setAttribute("data-dashboard-panel-bulk-toggle", "true");
        actionBtn.textContent = "Select All";
        heading.appendChild(actionBtn);
      }
      menuList.appendChild(heading);
    };
    appendSectionTitle("Panels", { bulkToggle: true });
    const panelBody = appendSectionBody("dashboardPanelMenuPanelGrid");
    meta.forEach(({ panelId, label }) => {
      const row = document.createElement("label");
      row.className = "dashboardPanelMenuItem dashboardPanelMenuTile";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("data-dashboard-panel-id", panelId);
      const text = document.createElement("span");
      text.textContent = label;
      row.appendChild(input);
      row.appendChild(text);
      panelBody.appendChild(row);
    });
    syncDashboardPanelMenuState();
  }

  function syncDashboardMenuFlipState() {
    ctx.syncDashboardMenuFlipUi();
  }

  function setDashboardMenuFlipped(nextFlipped: boolean) {
    if (ctx.getDashboardMenuFlipped() === nextFlipped) {
      syncDashboardMenuFlipState();
      return;
    }
    ctx.setDashboardMenuFlipped(nextFlipped);
    syncDashboardMenuFlipState();
  }

  function openDashboardPanelMenu() {
    renderDashboardPanelMenu();
    setDashboardMenuFlipped(true);
  }

  function closeDashboardPanelMenu() {
    setDashboardMenuFlipped(false);
  }

  function getDashboardCardSizeMapForStorage() {
    const cardSizes = ctx.getDashboardCardSizes();
    const out: Record<string, DashboardCardSize> = {};
    Object.entries(cardSizes || {}).forEach(([cardId, size]) => {
      if (!cardId) return;
      const nextSize = sanitizeDashboardCardSize(size, cardId);
      if (nextSize) out[cardId] = nextSize;
    });
    return out;
  }

  function getDashboardCardPlacementsMapForStorage() {
    return sanitizeDashboardCardPlacements(ctx.getDashboardCardPlacements());
  }

  function saveDashboardWidgetState(partialWidgets: Record<string, unknown>) {
    const dashboard = getCloudDashboardRecord();
    const existingWidgets =
      dashboard?.widgets && typeof dashboard.widgets === "object" ? (dashboard.widgets as Record<string, unknown>) : {};
    const existingOrder = Array.isArray(dashboard?.order) ? dashboard.order : getCurrentDashboardOrder();
    const widgets = {
      ...existingWidgets,
      ...partialWidgets,
      cardPlacements: getDashboardCardPlacementsMapForStorage(),
      cardVisibility: getDashboardCardVisibilityMapForStorage(),
    };
    const nextDashboard = { order: existingOrder, widgets };
    ctx.setCloudDashboardCache(nextDashboard);
    ctx.saveCloudDashboard(nextDashboard);
  }

  function applyDashboardCardVisibility() {
    const meta = collectDashboardPanelMeta();
    if (!meta.length) return;
    const nextVisibility = { ...ctx.getDashboardCardVisibility() };
    ctx.setDashboardCardVisibility(nextVisibility);
    meta.forEach(({ panel, panelId }) => {
      const isVisible = nextVisibility[panelId] !== false;
      const shouldShow = shouldForceVisibleDashboardCard(panelId) ? true : isVisible;
      panel.hidden = !shouldShow;
      panel.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    });
    syncDashboardPanelMenuState();
  }

  function loadDashboardWidgetState() {
    const dashboard = getCloudDashboardRecord();
    const widgets =
      dashboard?.widgets && typeof dashboard.widgets === "object" ? (dashboard.widgets as Record<string, unknown>) : {};
    ctx.setDashboardAvgRange(sanitizeDashboardAvgRange((widgets as any).avgSessionByTaskRange));
    const nextSizes: Record<string, DashboardCardSize> = {};
    const rawSizes = (widgets as any).cardSizes;
    if (rawSizes && typeof rawSizes === "object") {
      Object.entries(rawSizes as Record<string, unknown>).forEach(([cardId, size]) => {
        const nextSize = sanitizeDashboardCardSize(size, cardId);
        if (!cardId || !nextSize) return;
        nextSizes[cardId] = nextSize;
      });
    }
    ctx.setDashboardCardSizes(nextSizes);
    ctx.setDashboardCardPlacements(sanitizeDashboardCardPlacements((widgets as any).cardPlacements));
    const nextVisibility: Record<string, boolean> = {};
    const rawVisibility = (widgets as any).cardVisibility;
    if (rawVisibility && typeof rawVisibility === "object") {
      Object.entries(rawVisibility as Record<string, unknown>).forEach(([cardId, visible]) => {
        if (!cardId || typeof visible !== "boolean") return;
        nextVisibility[cardId] = visible;
      });
    }
    ctx.setDashboardCardVisibility(nextVisibility);
    ensureDashboardIncludedModesValid();
  }

  function saveDashboardAvgRange(range: DashboardAvgRange) {
    ctx.setDashboardAvgRange(sanitizeDashboardAvgRange(range));
    saveDashboardWidgetState({
      avgSessionByTaskRange: ctx.getDashboardAvgRange(),
    });
  }

  function applyDashboardCardSizes() {
    const grid = getDashboardGridEl();
    if (!grid) return;
    const cardSizes = ctx.getDashboardCardSizes();
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const card = el as HTMLElement;
      const cardId = String(card.getAttribute("data-dashboard-id") || "");
      if (!cardId) return;
      const size =
        sanitizeDashboardCardSize(cardSizes[cardId], cardId)
        || (isQuarterDefaultDashboardCard(cardId) ? "quarter" : null)
        || (isHalfDefaultDashboardCard(cardId) ? "half" : null);
      if (size) card.setAttribute("data-dashboard-size", size);
      else card.removeAttribute("data-dashboard-size");
    });
    applyDashboardCardPlacements();
  }

  function collectDashboardLayoutItems(grid: HTMLElement) {
    const cardSizes = ctx.getDashboardCardSizes();
    const requestedPlacements = ctx.getDashboardCardPlacements();
    return Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]"))
      .map((el, orderIndex) => {
        const card = el as HTMLElement;
        const cardId = String(card.getAttribute("data-dashboard-id") || "").trim();
        const size =
          sanitizeDashboardCardSize(cardSizes[cardId], cardId)
          || (isQuarterDefaultDashboardCard(cardId) ? "quarter" : null)
          || (isHalfDefaultDashboardCard(cardId) ? "half" : null);
        return {
          id: cardId,
          size,
          requested: requestedPlacements[cardId] || null,
          orderIndex,
        };
      })
      .filter((item) => !!item.id);
  }

  function applyDashboardCardPlacements() {
    const grid = getDashboardGridEl();
    if (!grid) return;
    const layoutItems = collectDashboardLayoutItems(grid);
    if (!layoutItems.length) return;
    const columnCount = getDashboardGridColumnCount(grid);
    const resolvedPlacements = resolveDashboardCardPlacements(layoutItems, columnCount);
    const layoutItemById = new Map(layoutItems.map((item) => [item.id, item]));
    const nextPlacements: Record<string, DashboardCardPlacement> = {};
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const card = el as HTMLElement;
      const cardId = String(card.getAttribute("data-dashboard-id") || "").trim();
      const placement = resolvedPlacements[cardId];
      if (!cardId || !placement) return;
      nextPlacements[cardId] = placement;
      card.dataset.dashboardCol = String(placement.col);
      card.dataset.dashboardRow = String(placement.row);
      card.style.gridColumn = getDashboardGridColumnValue(placement, layoutItemById.get(cardId)?.size ?? null, columnCount);
      card.style.gridRowStart = String(placement.row);
    });
    ctx.setDashboardCardPlacements(nextPlacements);
  }

  function ensureDashboardCardSizeControls() {
    const grid = getDashboardGridEl();
    if (!grid) return;
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const card = el as HTMLElement;
      if (card.querySelector(".dashboardSizeControl")) return;
      const cardId = String(card.getAttribute("data-dashboard-id") || "").trim();
      if (isFixedDashboardCard(cardId)) return;
      const control = document.createElement("div");
      control.className = "dashboardSizeControl";
      control.innerHTML = `
        <button class="iconBtn dashboardSizeBtn" type="button" data-dashboard-size-toggle="true" aria-label="Panel size options" title="Panel size options" aria-expanded="false">
          <span class="dashboardSizeGlyph" aria-hidden="true"></span>
        </button>
        <div class="dashboardSizeMenu" data-dashboard-size-menu="true" role="menu" aria-label="Panel size options">
          <button class="dashboardSizeOption" type="button" data-dashboard-size="full" role="menuitemradio" aria-checked="false">Full width</button>
          <button class="dashboardSizeOption" type="button" data-dashboard-size="half" role="menuitemradio" aria-checked="false">Half width</button>
          <button class="dashboardSizeOption" type="button" data-dashboard-size="quarter" role="menuitemradio" aria-checked="false">Quarter width</button>
        </div>
      `;
      card.prepend(control);
    });
  }

  function syncDashboardCardSizeControlState() {
    const grid = getDashboardGridEl();
    if (!grid) return;
    const cardSizes = ctx.getDashboardCardSizes();
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const card = el as HTMLElement;
      const cardId = String(card.getAttribute("data-dashboard-id") || "");
      if (!cardId) return;
      const selectedSize =
        sanitizeDashboardCardSize(cardSizes[cardId], cardId)
        || (isQuarterDefaultDashboardCard(cardId) ? "quarter" : null)
        || (isHalfDefaultDashboardCard(cardId) ? "half" : null);
      const toggle = card.querySelector("[data-dashboard-size-toggle]") as HTMLButtonElement | null;
      const menuOpen = card.classList.contains("isSizeMenuOpen");
      if (isFixedDashboardCard(cardId)) {
        if (toggle) toggle.remove();
        const menu = card.querySelector("[data-dashboard-size-menu]") as HTMLElement | null;
        if (menu) menu.remove();
      }
      if (toggle) toggle.setAttribute("aria-expanded", menuOpen ? "true" : "false");
      Array.from(card.querySelectorAll(".dashboardSizeOption[data-dashboard-size]")).forEach((btn) => {
        const option = btn as HTMLButtonElement;
        const rawOptionSize = String(option.getAttribute("data-dashboard-size") || "");
        const allowed = isDashboardCardSizeOptionAllowed(rawOptionSize, cardId);
        option.hidden = !allowed;
        option.disabled = !allowed;
        option.setAttribute("aria-hidden", allowed ? "false" : "true");
        const optionSize = allowed ? sanitizeDashboardCardSize(rawOptionSize, cardId) : null;
        const isSelected = !!optionSize && !!selectedSize && optionSize === selectedSize;
        option.classList.toggle("isOn", isSelected);
        option.setAttribute("aria-checked", isSelected ? "true" : "false");
      });
    });
  }

  function closeDashboardCardSizeMenus() {
    const grid = getDashboardGridEl();
    if (!grid) return;
    Array.from(grid.querySelectorAll(".dashboardCard.isSizeMenuOpen")).forEach((el) => {
      (el as HTMLElement).classList.remove("isSizeMenuOpen");
    });
    syncDashboardCardSizeControlState();
  }

  function applyOrderedDashboardCards(grid: HTMLElement, order: string[] | null | undefined) {
    if (!Array.isArray(order) || !order.length) return;
    const cards = Array.from(grid.querySelectorAll(".dashboardCard")) as HTMLElement[];
    if (!cards.length) return;
    const byId = new Map<string, HTMLElement>();
    cards.forEach((card) => {
      const id = card.getAttribute("data-dashboard-id");
      if (id) byId.set(id, card);
    });
    const ordered: HTMLElement[] = [];
    const seen = new Set<string>();
    order.forEach((idRaw) => {
      const id = String(idRaw || "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      const card = byId.get(id);
      if (card) ordered.push(card);
    });
    const unordered = cards.filter((card) => {
      const id = card.getAttribute("data-dashboard-id") || "";
      return !seen.has(id);
    });
    [...ordered, ...unordered].forEach((card) => grid.appendChild(card));
  }

  function applyDashboardOrderFromStorage() {
    const grid = getDashboardGridEl();
    if (!grid) return;
    const dashboard = getCloudDashboardRecord();
    const order = Array.isArray(dashboard?.order) ? dashboard.order : [];
    if (!order.length) return;
    applyOrderedDashboardCards(grid, order as string[]);
    applyDashboardCardPlacements();
  }

  function getCurrentDashboardOrder() {
    const grid = getDashboardGridEl();
    if (!grid) return [] as string[];
    return Array.from(grid.querySelectorAll(".dashboardCard"))
      .map((el) => (el as HTMLElement).getAttribute("data-dashboard-id") || "")
      .filter(Boolean);
  }

  function saveDashboardOrder() {
    const order = getCurrentDashboardOrder();
    const dashboard = getCloudDashboardRecord();
    const existingWidgets =
      dashboard?.widgets && typeof dashboard.widgets === "object" ? (dashboard.widgets as Record<string, unknown>) : {};
    const widgets = {
      ...existingWidgets,
      cardPlacements: getDashboardCardPlacementsMapForStorage(),
      cardSizes: getDashboardCardSizeMapForStorage(),
      cardVisibility: getDashboardCardVisibilityMapForStorage(),
    };
    const nextDashboard = { order, widgets };
    ctx.setCloudDashboardCache(nextDashboard);
    ctx.saveCloudDashboard(nextDashboard);
  }

  function applyDashboardOrder(order: string[] | null | undefined) {
    const grid = els.dashboardGrid;
    if (!grid || !Array.isArray(order) || !order.length) return;
    applyOrderedDashboardCards(grid, order);
    applyDashboardCardPlacements();
  }

  function beginDashboardEditMode() {
    if (ctx.getDashboardEditMode()) return;
    ctx.setDashboardOrderDraftBeforeEdit(getCurrentDashboardOrder());
    ctx.setDashboardCardPlacementsDraftBeforeEdit({ ...ctx.getDashboardCardPlacements() });
    ctx.setDashboardCardSizesDraftBeforeEdit({ ...ctx.getDashboardCardSizes() });
    ctx.setDashboardEditMode(true);
    applyDashboardEditMode();
  }

  function cancelDashboardEditMode() {
    if (!ctx.getDashboardEditMode()) return;
    const dashboardOrderDraftBeforeEdit = ctx.getDashboardOrderDraftBeforeEdit();
    if (dashboardOrderDraftBeforeEdit?.length) {
      applyDashboardOrder(dashboardOrderDraftBeforeEdit);
    }
    ctx.setDashboardCardPlacements(
      ctx.getDashboardCardPlacementsDraftBeforeEdit() ? { ...ctx.getDashboardCardPlacementsDraftBeforeEdit()! } : {}
    );
    ctx.setDashboardCardSizes(
      ctx.getDashboardCardSizesDraftBeforeEdit() ? { ...ctx.getDashboardCardSizesDraftBeforeEdit()! } : {}
    );
    applyDashboardCardSizes();
    ctx.setDashboardEditMode(false);
    ctx.setDashboardOrderDraftBeforeEdit(null);
    ctx.setDashboardCardPlacementsDraftBeforeEdit(null);
    ctx.setDashboardCardSizesDraftBeforeEdit(null);
    applyDashboardEditMode();
  }

  function commitDashboardEditMode() {
    if (!ctx.getDashboardEditMode()) return;
    saveDashboardOrder();
    ctx.setDashboardEditMode(false);
    ctx.setDashboardOrderDraftBeforeEdit(null);
    ctx.setDashboardCardPlacementsDraftBeforeEdit(null);
    ctx.setDashboardCardSizesDraftBeforeEdit(null);
    applyDashboardEditMode();
    if (ctx.getCurrentAppPage() === "dashboard") {
      renderDashboardWidgets();
    }
  }

  function applyDashboardEditMode() {
    const grid = getDashboardGridEl();
    if (!grid) return;
    ensureDashboardCardSizeControls();
    if (!ctx.getDashboardEditMode()) {
      finishDashboardPointerDrag();
      closeDashboardCardSizeMenus();
    }
    grid.classList.toggle("isEditMode", ctx.getDashboardEditMode());
    Array.from(grid.querySelectorAll(".dashboardCard")).forEach((el) => {
      (el as HTMLElement).setAttribute("draggable", ctx.getDashboardEditMode() ? "true" : "false");
    });
    syncDashboardCardSizeControlState();
    applyDashboardCardPlacements();
    if (els.dashboardEditBtn) {
      els.dashboardEditBtn.classList.toggle("isOn", ctx.getDashboardEditMode());
      (els.dashboardEditBtn as HTMLElement).style.display = ctx.getDashboardEditMode() ? "none" : "inline-flex";
    }
    if (els.dashboardEditCancelBtn) {
      (els.dashboardEditCancelBtn as HTMLElement).style.display = ctx.getDashboardEditMode() ? "inline-flex" : "none";
    }
    if (els.dashboardEditDoneBtn) {
      (els.dashboardEditDoneBtn as HTMLElement).style.display = ctx.getDashboardEditMode() ? "inline-flex" : "none";
    }
    if (ctx.getDashboardEditMode()) closeDashboardPanelMenu();
    syncDashboardMenuFlipState();
  }

  function findDashboardDragTarget(clientX: number, clientY: number, dragging: HTMLElement) {
    const grid = getDashboardGridEl();
    if (!grid) return null;
    const candidates = Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).filter(
      (card): card is HTMLElement => card instanceof HTMLElement && card !== dragging && grid.contains(card)
    );
    return (
      candidates.find((card) => {
        const rect = card.getBoundingClientRect();
        const sameRow = clientY >= rect.top && clientY <= rect.bottom;
        if (sameRow) return clientX < rect.left + rect.width / 2 || clientY < rect.top + rect.height / 2;
        return clientY < rect.top + rect.height / 2;
      }) || null
    );
  }

  function resolveDashboardGridDropPlacement(clientX: number, clientY: number, dragging: HTMLElement) {
    const grid = getDashboardGridEl();
    if (!grid) return null;
    const gridRect = grid.getBoundingClientRect();
    const gridStyle = window.getComputedStyle(grid);
    const templateColumns = gridStyle.gridTemplateColumns
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean);
    const columnCount = Math.max(1, templateColumns.length || getDashboardGridColumnCount(grid));
    const rowGap = Number.parseFloat(gridStyle.rowGap || "0") || 0;
    const columnGap = Number.parseFloat(gridStyle.columnGap || gridStyle.gap || "0") || 0;
    const totalColumnGap = columnGap * Math.max(0, columnCount - 1);
    const usableWidth = Math.max(1, gridRect.width - totalColumnGap);
    const cellWidth = usableWidth / columnCount;
    const relativeX = Math.max(0, clientX - gridRect.left);
    const rawCol = Math.floor(relativeX / Math.max(1, cellWidth + columnGap)) + 1;

    const otherCards = Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).filter(
      (card): card is HTMLElement => card instanceof HTMLElement && card !== dragging
    );
    const topValues = Array.from(
      new Set(
        otherCards
          .map((card) => Math.round(card.getBoundingClientRect().top - gridRect.top))
          .filter((value) => Number.isFinite(value))
      )
    ).sort((a, b) => a - b);
    let rawRow = 1;
    if (topValues.length) {
      rawRow = topValues.findIndex((top) => clientY - gridRect.top < top + rowGap / 2) + 1;
      if (rawRow <= 0) rawRow = topValues.length + 1;
    }

    const draggedId = String(dragging.getAttribute("data-dashboard-id") || "").trim();
    const currentSizes = ctx.getDashboardCardSizes();
    const size =
      sanitizeDashboardCardSize(currentSizes[draggedId], draggedId)
      || (isQuarterDefaultDashboardCard(draggedId) ? "quarter" : null)
      || (isHalfDefaultDashboardCard(draggedId) ? "half" : null);
    return clampDashboardPlacement({ col: rawCol, row: rawRow }, size, columnCount);
  }

  function moveDashboardDraggedCard(clientX: number, clientY: number) {
    const drag = dashboardPointerDrag;
    const grid = getDashboardGridEl();
    if (!drag || !grid || !grid.contains(drag.card)) return;
    const draggedId = String(drag.card.getAttribute("data-dashboard-id") || "").trim();
    if (!draggedId) return;
    const nextPlacements = { ...ctx.getDashboardCardPlacements() };
    const gridPlacement = resolveDashboardGridDropPlacement(clientX, clientY, drag.card);
    if (gridPlacement) nextPlacements[draggedId] = gridPlacement;
    ctx.setDashboardCardPlacements(nextPlacements);
    applyDashboardCardPlacements();
  }

  function finishDashboardPointerDrag() {
    const drag = dashboardPointerDrag;
    if (!drag) return;
    drag.card.classList.remove("isDragging");
    try {
      drag.card.releasePointerCapture?.(drag.pointerId);
    } catch {
      // ignore browsers that already released capture
    }
    ctx.setDashboardDragEl(null);
    dashboardPointerDrag = null;
  }

  function renderDashboardWidgets(opts?: DashboardRenderOptions) {
    ctx.renderDashboardWidgets(opts);
  }

  function applyDashboardBulkPanelVisibility(nextChecked: boolean) {
    const meta = collectDashboardPanelMeta();
    if (!meta.length) return;
    const nextVisibility = { ...ctx.getDashboardCardVisibility() };
    meta.forEach(({ panelId }) => {
      nextVisibility[panelId] = nextChecked;
    });
    ctx.setDashboardCardVisibility(nextVisibility);
    applyDashboardCardVisibility();
    saveDashboardWidgetState({
      cardSizes: getDashboardCardSizeMapForStorage(),
      avgSessionByTaskRange: ctx.getDashboardAvgRange(),
    });
    if (ctx.getCurrentAppPage() === "dashboard") renderDashboardWidgets();
  }

  function clearDashboardPanelMenuSelections() {
    const menuList = getDashboardPanelMenuListEl();
    if (!menuList) return;
    Array.from(menuList.querySelectorAll("input[data-dashboard-panel-id]")).forEach((node) => {
      const checkbox = node as HTMLInputElement;
      checkbox.checked = false;
    });
    const bulkToggleBtn = menuList.querySelector("[data-dashboard-panel-bulk-toggle]") as HTMLButtonElement | null;
    if (bulkToggleBtn) {
      bulkToggleBtn.textContent = "Select All";
      bulkToggleBtn.setAttribute("aria-label", "Select all dashboard panels");
    }
  }

  function handleDashboardPanelMenuChange(e: Event) {
    const input = (e.target as HTMLElement | null)?.closest?.("input[data-dashboard-panel-id]") as HTMLInputElement | null;
    if (!input) return;
    const cardId = String(input.getAttribute("data-dashboard-panel-id") || "").trim();
    if (!cardId) return;
    if (shouldForceVisibleDashboardCard(cardId)) {
      input.checked = true;
      return;
    }
    const nextChecked = !!input.checked;
    ctx.setDashboardCardVisibility({ ...ctx.getDashboardCardVisibility(), [cardId]: nextChecked });
    applyDashboardCardVisibility();
    saveDashboardWidgetState({
      cardSizes: getDashboardCardSizeMapForStorage(),
      avgSessionByTaskRange: ctx.getDashboardAvgRange(),
    });
    if (ctx.getCurrentAppPage() === "dashboard") renderDashboardWidgets();
  }

  function handleDashboardGridClick(e: any) {
    const lockedCard = e.target?.closest?.(".dashboardCard.isPlanLocked[data-dashboard-id]") as HTMLElement | null;
    if (lockedCard) {
      if (!shouldOpenDashboardLockedUpgradePrompt(ctx.getDashboardEditMode())) return;
      const cardId = String(lockedCard.getAttribute("data-dashboard-id") || "").trim();
      ctx.showUpgradePrompt(getDashboardLockedFeatureLabel(cardId), "pro");
      e.preventDefault();
      return;
    }
    const heatDayBtn = e.target?.closest?.(".dashboardHeatDayCell.isInteractive[data-heat-date]") as HTMLElement | null;
    if (heatDayBtn) {
      const dayKey = String(heatDayBtn.getAttribute("data-heat-date") || "").trim();
      const dateLabel = String(heatDayBtn.getAttribute("data-heat-date-label") || "").trim();
      if (dayKey) ctx.openDashboardHeatSummaryCard(dayKey, dateLabel);
      e.preventDefault();
      return;
    }
    const sizeToggle = e.target?.closest?.("[data-dashboard-size-toggle]") as HTMLElement | null;
    if (sizeToggle) {
      if (!ctx.getDashboardEditMode()) return;
      const card = sizeToggle.closest(".dashboardCard") as HTMLElement | null;
      if (!card || !els.dashboardGrid?.contains(card)) return;
      const wasOpen = card.classList.contains("isSizeMenuOpen");
      closeDashboardCardSizeMenus();
      card.classList.toggle("isSizeMenuOpen", !wasOpen);
      syncDashboardCardSizeControlState();
      e.preventDefault();
      return;
    }
    const sizeOption = e.target?.closest?.(".dashboardSizeOption[data-dashboard-size]") as HTMLElement | null;
    if (sizeOption) {
      if (!ctx.getDashboardEditMode()) return;
      const card = sizeOption.closest(".dashboardCard") as HTMLElement | null;
      const cardId = String(card?.getAttribute("data-dashboard-id") || "");
      const rawSize = String(sizeOption.getAttribute("data-dashboard-size") || "");
      if (!isDashboardCardSizeOptionAllowed(rawSize, cardId)) return;
      const nextSize = sanitizeDashboardCardSize(rawSize, cardId);
      if (!card || !cardId || !nextSize) return;
      ctx.setDashboardCardSizes({ ...ctx.getDashboardCardSizes(), [cardId]: nextSize });
      applyDashboardCardSizes();
      closeDashboardCardSizeMenus();
      if (ctx.getCurrentAppPage() === "dashboard") renderDashboardWidgets();
      e.preventDefault();
      return;
    }
    const momentumDriverBtn = e.target?.closest?.("[data-dashboard-momentum-driver]") as HTMLElement | null;
    if (momentumDriverBtn) {
      const driverKey = String(momentumDriverBtn.getAttribute("data-dashboard-momentum-driver") || "").trim();
      ctx.selectDashboardMomentumDriver(driverKey);
      e.preventDefault();
      return;
    }
    const momentumDriversArea = els.dashboardMomentumDrivers as HTMLElement | null;
    const clickedInsideMomentumDrivers = !!momentumDriversArea?.contains(e.target as Node | null);
    if (ctx.hasSelectedDashboardMomentumDriver() && !clickedInsideMomentumDrivers) {
      ctx.clearDashboardMomentumDriverSelection();
    }
    const btn = e.target?.closest?.("[data-dashboard-avg-range-toggle]") as HTMLElement | null;
    if (!btn) return;
    const nextRange: DashboardAvgRange = sanitizeDashboardAvgRange(ctx.getDashboardAvgRange()) === "past30" ? "past7" : "past30";
    if (nextRange === ctx.getDashboardAvgRange()) {
      renderDashboardWidgets();
      return;
    }
    saveDashboardAvgRange(nextRange);
    renderDashboardWidgets();
  }

  function handleDashboardGridPointerDown(e: any) {
    const momentumDriverBtn = e.target?.closest?.("[data-dashboard-momentum-driver]") as HTMLElement | null;
    if (momentumDriverBtn) {
      // Driver selection is handled on click. Triggering it here as well causes the
      // momentum gauge animation to cancel and restart within the same interaction.
      return;
    }
    if (!ctx.getDashboardEditMode() || !shouldUsePointerDashboardDrag(e as PointerEvent)) return;
    if (shouldIgnoreDashboardPointerDragStartTarget(e.target as DashboardClosestTarget)) return;
    const grid = getDashboardGridEl();
    const card = e.target?.closest?.(".dashboardCard[data-dashboard-id]") as HTMLElement | null;
    if (!grid || !card || !grid.contains(card)) return;
    closeDashboardCardSizeMenus();
    dashboardPointerDrag = {
      card,
      pointerId: Number(e.pointerId) || 0,
      startX: Number(e.clientX) || 0,
      startY: Number(e.clientY) || 0,
      active: false,
    };
    ctx.setDashboardDragEl(card);
    card.setPointerCapture?.(dashboardPointerDrag.pointerId);
    e.preventDefault?.();
  }

  function handleDashboardGridPointerMove(e: any) {
    const drag = dashboardPointerDrag;
    if (!drag || !ctx.getDashboardEditMode()) return;
    if (Number(e.pointerId) !== drag.pointerId) return;
    const deltaX = Math.abs((Number(e.clientX) || 0) - drag.startX);
    const deltaY = Math.abs((Number(e.clientY) || 0) - drag.startY);
    if (!drag.active && deltaX + deltaY < 6) return;
    drag.active = true;
    drag.card.classList.add("isDragging");
    moveDashboardDraggedCard(Number(e.clientX) || 0, Number(e.clientY) || 0);
    e.preventDefault?.();
  }

  function handleDashboardGridPointerEnd(e: any) {
    const drag = dashboardPointerDrag;
    if (!drag) return;
    if (Number(e.pointerId) !== drag.pointerId) return;
    finishDashboardPointerDrag();
    if (ctx.getCurrentAppPage() === "dashboard") {
      renderDashboardWidgets();
    }
    e.preventDefault?.();
  }

  function handleDashboardPanelMenuClick(e: Event) {
    const openBtn = (e.target as HTMLElement | null)?.closest?.("#dashboardPanelMenuBtn") as HTMLButtonElement | null;
    if (openBtn) {
      if (ctx.getDashboardEditMode()) return;
      openDashboardPanelMenu();
      e.preventDefault();
      return;
    }
    const closeBtn = (e.target as HTMLElement | null)?.closest?.("#dashboardPanelMenuBackBtn") as HTMLButtonElement | null;
    if (closeBtn) {
      closeDashboardPanelMenu();
      e.preventDefault();
      return;
    }
    const bulkToggleBtn = (e.target as HTMLElement | null)?.closest?.(
      "[data-dashboard-panel-bulk-toggle]"
    ) as HTMLButtonElement | null;
    if (!bulkToggleBtn) return;
    const meta = collectDashboardPanelMeta();
    const visibleCount = meta.reduce((count, row) => (isDashboardCardVisible(row.panelId) ? count + 1 : count), 0);
    const allSelected = meta.length > 0 && visibleCount === meta.length;
    if (allSelected) {
      clearDashboardPanelMenuSelections();
    } else {
      applyDashboardBulkPanelVisibility(true);
    }
    e.preventDefault();
  }

  function handleDocumentDashboardClick(e: any) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (ctx.getDashboardEditMode() && !target.closest(".dashboardSizeControl")) {
      closeDashboardCardSizeMenus();
    }
  }

  function handleDashboardDragStart(e: any) {
    if (!ctx.getDashboardEditMode()) return;
    if (typeof window !== "undefined" && "PointerEvent" in window) {
      e.preventDefault?.();
      return;
    }
    if (dashboardPointerDrag) {
      e.preventDefault?.();
      return;
    }
    if (e.target?.closest?.(".dashboardSizeControl")) return;
    closeDashboardCardSizeMenus();
    const card = e.target?.closest?.(".dashboardCard") as HTMLElement | null;
    if (!card || !els.dashboardGrid?.contains(card)) return;
    ctx.setDashboardDragEl(card);
    card.classList.add("isDragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", card.getAttribute("data-dashboard-id") || "");
      } catch {
        // ignore
      }
    }
  }

  function handleDashboardDragOver(e: any) {
    if (!ctx.getDashboardEditMode()) return;
    e.preventDefault?.();
  }

  function handleDashboardDrop(e: any) {
    if (!ctx.getDashboardEditMode()) return;
    e.preventDefault();
    applyDashboardCardPlacements();
    if (ctx.getCurrentAppPage() === "dashboard") {
      renderDashboardWidgets();
    }
  }

  function handleDashboardDragEnd() {
    const dragging = ctx.getDashboardDragEl();
    if (dragging) dragging.classList.remove("isDragging");
    ctx.setDashboardDragEl(null);
  }

  function handleDashboardOnboardingClick(event: Event) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("#appPageDashboard")) return;
    const currentUser = getFirebaseAuthClient()?.currentUser || null;
    const onboardingStatus = readOnboardingStatusForCurrentSession(currentUser);
    const activeDashboardPanelStep = readOnboardingDashboardPanelStepForCurrentSession(currentUser);
    if (onboardingStatus !== "active" || !activeDashboardPanelStep) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ONBOARDING_DASHBOARD_CLICK_EVENT, { detail: { source: "dashboard-content" } }));
  }

  function registerDashboardEvents() {
    const dashboardInteractionRoot = els.appPageDashboard || els.dashboardGrid;
    ctx.on(els.dashboardEditBtn, "click", beginDashboardEditMode);
    ctx.on(els.dashboardEditCancelBtn, "click", cancelDashboardEditMode);
    ctx.on(els.dashboardEditDoneBtn, "click", commitDashboardEditMode);
    ctx.on(els.dashboardPanelMenuBtn, "click", handleDashboardPanelMenuClick);
    ctx.on(els.dashboardPanelMenuBackBtn, "click", handleDashboardPanelMenuClick);
    ctx.on(els.dashboardPanelMenuList, "click", handleDashboardPanelMenuClick);
    ctx.on(els.dashboardPanelMenuList, "change", handleDashboardPanelMenuChange);
    ctx.on(els.appPageDashboard, "click", handleDashboardOnboardingClick, true);
    ctx.on(dashboardInteractionRoot, "click", handleDashboardGridClick);
    ctx.on(dashboardInteractionRoot, "pointerdown", handleDashboardGridPointerDown);
    ctx.on(dashboardInteractionRoot, "pointermove", handleDashboardGridPointerMove);
    ctx.on(dashboardInteractionRoot, "pointerup", handleDashboardGridPointerEnd);
    ctx.on(dashboardInteractionRoot, "pointercancel", handleDashboardGridPointerEnd);
    ctx.on(document as any, "click", handleDocumentDashboardClick);
    ctx.on(els.dashboardGrid, "dragstart", handleDashboardDragStart);
    ctx.on(els.dashboardGrid, "dragover", handleDashboardDragOver);
    ctx.on(els.dashboardGrid, "drop", handleDashboardDrop);
    ctx.on(els.dashboardGrid, "dragend", handleDashboardDragEnd);
    ctx.on(window as any, "resize", applyDashboardCardPlacements);
    ctx.on(els.dashboardHeatSummaryCloseBtn, "click", () => {
      ctx.closeDashboardHeatSummaryCard({ restoreFocus: true });
    });
  }

  return {
    renderDashboardPanelMenu,
    renderDashboardWidgets,
    saveDashboardWidgetState,
    getDashboardCardSizeMapForStorage,
    getDashboardAvgRange: () => ctx.getDashboardAvgRange(),
    ensureDashboardIncludedModesValid,
    loadDashboardWidgetState,
    applyDashboardCardVisibility,
    applyDashboardCardSizes,
    applyDashboardOrderFromStorage,
    applyDashboardEditMode,
    beginDashboardEditMode,
    cancelDashboardEditMode,
    commitDashboardEditMode,
    registerDashboardEvents,
  };
}
