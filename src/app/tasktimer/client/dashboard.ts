import type { TaskTimerDashboardContext } from "./context";
import type { DashboardAvgRange, DashboardCardSize, DashboardRenderOptions, DashboardTimelineDensity, MainMode } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerDashboard(ctx: TaskTimerDashboardContext) {
  const { els } = ctx;

  function getCloudDashboardRecord() {
    const cached = ctx.getCloudDashboardCache();
    if (cached && typeof cached === "object") return cached as { order?: unknown; widgets?: unknown };
    const loaded = ctx.loadCachedDashboard();
    return loaded && typeof loaded === "object" ? (loaded as { order?: unknown; widgets?: unknown }) : null;
  }

  function sanitizeDashboardAvgRange(value: unknown): DashboardAvgRange {
    const raw = String(value || "").trim();
    if (raw === "past30" || raw === "currentMonth") return "past30";
    if (raw === "currentWeek") return "past7";
    return "past7";
  }

  function sanitizeDashboardTimelineDensity(value: unknown): DashboardTimelineDensity {
    const raw = String(value || "").trim();
    if (raw === "low" || raw === "high") return raw;
    return "medium";
  }

  function canUseCompactDashboardCardSize(cardId: string) {
    return (
      cardId === "streak" ||
      cardId === "week-hours" ||
      cardId === "weekly-time-goals" ||
      cardId === "tasks-completed"
    );
  }

  function isFixedFullWidthDashboardCard(cardId: string) {
    return cardId === "timeline" || cardId === "momentum";
  }

  function sanitizeDashboardCardSize(value: unknown, cardId?: string | null): DashboardCardSize | null {
    if (isFixedFullWidthDashboardCard(String(cardId || "").trim())) return "full";
    if (value === "full" || value === "half" || value === "quarter") return value;
    if (value === "eighth" && canUseCompactDashboardCardSize(String(cardId || "").trim())) return value;
    return null;
  }

  function getVisibleDashboardModes(): MainMode[] {
    return (["mode1", "mode2", "mode3"] as MainMode[]).filter((mode) => ctx.isModeEnabled(mode));
  }

  function isDashboardModeIncluded(mode: MainMode) {
    return ctx.getDashboardIncludedModes()[mode] !== false;
  }

  function ensureDashboardIncludedModesValid() {
    const visibleModes = getVisibleDashboardModes();
    const nextIncludedModes = { ...ctx.getDashboardIncludedModes() };
    if (!visibleModes.length) {
      nextIncludedModes.mode1 = true;
      ctx.setDashboardIncludedModes(nextIncludedModes);
      return;
    }
    const hasVisibleMode = visibleModes.some((mode) => nextIncludedModes[mode] !== false);
    if (hasVisibleMode) return;
    nextIncludedModes[visibleModes[0] || "mode1"] = true;
    ctx.setDashboardIncludedModes(nextIncludedModes);
  }

  function getDashboardIncludedModesMapForStorage() {
    const includedModes = ctx.getDashboardIncludedModes();
    return {
      mode1: includedModes.mode1 !== false,
      mode2: includedModes.mode2 !== false,
      mode3: includedModes.mode3 !== false,
    } satisfies Record<MainMode, boolean>;
  }

  function collectDashboardPanelMeta() {
    const out = [] as Array<{ panel: HTMLElement; panelId: string; label: string }>;
    const heroPanel = document.querySelector(
      '#appPageDashboard .dashboardHeroPanel[data-dashboard-panel-id]'
    ) as HTMLElement | null;
    if (heroPanel) {
      const panelId = String(heroPanel.getAttribute("data-dashboard-panel-id") || "").trim();
      if (panelId) {
        const titleEl = heroPanel.querySelector(".dashboardHeroTitle") as HTMLElement | null;
        const title = String(titleEl?.textContent || "").trim();
        const ariaLabel = String(heroPanel.getAttribute("aria-label") || "").trim();
        out.push({
          panel: heroPanel,
          panelId,
          label: title || ariaLabel || panelId,
        });
      }
    }
    const grid = els.dashboardGrid;
    if (!grid) return out;
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const panel = el as HTMLElement;
      const panelId = String(panel.getAttribute("data-dashboard-id") || "").trim();
      if (!panelId) return;
      const customLabel = String(panel.getAttribute("data-dashboard-label") || "").trim();
      const titleEl = panel.querySelector(".dashboardCardTitle") as HTMLElement | null;
      const title = String(titleEl?.textContent || "").trim();
      const ariaLabel = String(panel.getAttribute("aria-label") || "").trim();
      out.push({
        panel,
        panelId,
        label: customLabel || title || ariaLabel || panelId,
      });
    });
    return out;
  }

  function isDashboardCardVisible(cardId: string) {
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

  function getDashboardCategoryMeta() {
    return getVisibleDashboardModes().map((mode) => ({
      mode,
      label: ctx.getModeLabel(mode),
    }));
  }

  function syncDashboardPanelMenuState() {
    const menuList = els.dashboardPanelMenuList;
    if (!menuList) return;
    const meta = collectDashboardPanelMeta();
    const visibleCount = meta.reduce((count, row) => (isDashboardCardVisible(row.panelId) ? count + 1 : count), 0);
    Array.from(menuList.querySelectorAll("input[data-dashboard-panel-id]")).forEach((node) => {
      const checkbox = node as HTMLInputElement;
      const panelId = String(checkbox.getAttribute("data-dashboard-panel-id") || "");
      const isVisible = isDashboardCardVisible(panelId);
      checkbox.checked = isVisible;
      checkbox.disabled = isVisible && visibleCount <= 1;
    });
    const categoryMeta = getDashboardCategoryMeta();
    const includedCount = categoryMeta.reduce((count, row) => (isDashboardModeIncluded(row.mode) ? count + 1 : count), 0);
    Array.from(menuList.querySelectorAll("input[data-dashboard-category-id]")).forEach((node) => {
      const checkbox = node as HTMLInputElement;
      const modeAttr = String(checkbox.getAttribute("data-dashboard-category-id") || "").trim();
      const mode = modeAttr === "mode2" || modeAttr === "mode3" ? modeAttr : "mode1";
      const isIncluded = isDashboardModeIncluded(mode);
      checkbox.checked = isIncluded;
      checkbox.disabled = isIncluded && includedCount <= 1;
    });
  }

  function renderDashboardPanelMenu() {
    const menuList = els.dashboardPanelMenuList;
    if (!menuList) return;
    const meta = collectDashboardPanelMeta();
    const categories = getDashboardCategoryMeta();
    menuList.innerHTML = "";
    if (!categories.length && !meta.length) return;
    const appendSectionTitle = (title: string) => {
      const heading = document.createElement("div");
      heading.className = "dashboardPanelMenuSectionTitle";
      heading.textContent = title;
      menuList.appendChild(heading);
    };
    if (categories.length) {
      appendSectionTitle("Categories");
      categories.forEach(({ mode, label }) => {
        const row = document.createElement("label");
        row.className = "dashboardPanelMenuItem";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("data-dashboard-category-id", mode);
        const text = document.createElement("span");
        text.textContent = label;
        row.appendChild(input);
        row.appendChild(text);
        menuList.appendChild(row);
      });
    }
    if (meta.length) {
      if (categories.length) {
        const divider = document.createElement("div");
        divider.className = "dashboardPanelMenuDivider";
        divider.setAttribute("aria-hidden", "true");
        menuList.appendChild(divider);
      }
      appendSectionTitle("Panels");
      meta.forEach(({ panelId, label }) => {
        const row = document.createElement("label");
        row.className = "dashboardPanelMenuItem";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("data-dashboard-panel-id", panelId);
        const text = document.createElement("span");
        text.textContent = label;
        row.appendChild(input);
        row.appendChild(text);
        menuList.appendChild(row);
      });
    }
    syncDashboardPanelMenuState();
  }

  function closeDashboardPanelMenu() {
    if (els.dashboardPanelMenu) els.dashboardPanelMenu.open = false;
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

  function saveDashboardWidgetState(partialWidgets: Record<string, unknown>) {
    const dashboard = getCloudDashboardRecord();
    const existingWidgets =
      dashboard?.widgets && typeof dashboard.widgets === "object" ? (dashboard.widgets as Record<string, unknown>) : {};
    const existingOrder = Array.isArray(dashboard?.order) ? dashboard.order : getCurrentDashboardOrder();
    const widgets = {
      ...existingWidgets,
      ...partialWidgets,
      cardVisibility: getDashboardCardVisibilityMapForStorage(),
      includedModes: getDashboardIncludedModesMapForStorage(),
    };
    const nextDashboard = { order: existingOrder, widgets };
    ctx.setCloudDashboardCache(nextDashboard);
    ctx.saveCloudDashboard(nextDashboard);
  }

  function applyDashboardCardVisibility() {
    const meta = collectDashboardPanelMeta();
    if (!meta.length) return;
    const nextVisibility = { ...ctx.getDashboardCardVisibility() };
    let visibleCount = 0;
    meta.forEach(({ panelId }) => {
      if (nextVisibility[panelId] !== false) visibleCount += 1;
    });
    if (visibleCount <= 0) {
      const fallbackPanelId = meta[0].panelId;
      nextVisibility[fallbackPanelId] = true;
      ctx.setDashboardCardVisibility(nextVisibility);
    }
    meta.forEach(({ panel, panelId }) => {
      const isVisible = nextVisibility[panelId] !== false;
      panel.hidden = !isVisible;
      panel.setAttribute("aria-hidden", isVisible ? "false" : "true");
    });
    syncDashboardPanelMenuState();
  }

  function loadDashboardWidgetState() {
    const dashboard = getCloudDashboardRecord();
    const widgets =
      dashboard?.widgets && typeof dashboard.widgets === "object" ? (dashboard.widgets as Record<string, unknown>) : {};
    ctx.setDashboardAvgRange(sanitizeDashboardAvgRange((widgets as any).avgSessionByTaskRange));
    ctx.setDashboardTimelineDensity(sanitizeDashboardTimelineDensity((widgets as any).timelineDensity));
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
    const nextVisibility: Record<string, boolean> = {};
    const rawVisibility = (widgets as any).cardVisibility;
    if (rawVisibility && typeof rawVisibility === "object") {
      Object.entries(rawVisibility as Record<string, unknown>).forEach(([cardId, visible]) => {
        if (!cardId || typeof visible !== "boolean") return;
        nextVisibility[cardId] = visible;
      });
    }
    ctx.setDashboardCardVisibility(nextVisibility);
    const nextIncludedModes: Record<MainMode, boolean> = { mode1: true, mode2: true, mode3: true };
    const rawIncludedModes = (widgets as any).includedModes;
    if (rawIncludedModes && typeof rawIncludedModes === "object") {
      (["mode1", "mode2", "mode3"] as MainMode[]).forEach((mode) => {
        if (typeof (rawIncludedModes as Record<string, unknown>)[mode] === "boolean") {
          nextIncludedModes[mode] = (rawIncludedModes as Record<string, boolean>)[mode];
        }
      });
    }
    ctx.setDashboardIncludedModes(nextIncludedModes);
    ensureDashboardIncludedModesValid();
  }

  function saveDashboardAvgRange(range: DashboardAvgRange) {
    ctx.setDashboardAvgRange(sanitizeDashboardAvgRange(range));
    saveDashboardWidgetState({
      avgSessionByTaskRange: ctx.getDashboardAvgRange(),
    });
  }

  function saveDashboardTimelineDensity(value: DashboardTimelineDensity) {
    ctx.setDashboardTimelineDensity(sanitizeDashboardTimelineDensity(value));
    saveDashboardWidgetState({
      timelineDensity: ctx.getDashboardTimelineDensity(),
    });
  }

  function applyDashboardCardSizes() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    const cardSizes = ctx.getDashboardCardSizes();
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const card = el as HTMLElement;
      const cardId = String(card.getAttribute("data-dashboard-id") || "");
      if (!cardId) return;
      const size = sanitizeDashboardCardSize(cardSizes[cardId], cardId);
      if (size) card.setAttribute("data-dashboard-size", size);
      else card.removeAttribute("data-dashboard-size");
    });
  }

  function ensureDashboardCardSizeControls() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const card = el as HTMLElement;
      if (card.querySelector(".dashboardSizeControl")) return;
      const cardId = String(card.getAttribute("data-dashboard-id") || "").trim();
      if (isFixedFullWidthDashboardCard(cardId)) return;
      const compactSizeOption = canUseCompactDashboardCardSize(cardId)
        ? `
          <button class="dashboardSizeOption" type="button" data-dashboard-size="eighth" role="menuitemradio" aria-checked="false">Compact</button>`
        : "";
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
          ${compactSizeOption}
        </div>
      `;
      card.prepend(control);
    });
  }

  function syncDashboardCardSizeControlState() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    const cardSizes = ctx.getDashboardCardSizes();
    Array.from(grid.querySelectorAll(".dashboardCard[data-dashboard-id]")).forEach((el) => {
      const card = el as HTMLElement;
      const cardId = String(card.getAttribute("data-dashboard-id") || "");
      if (!cardId) return;
      const selectedSize = sanitizeDashboardCardSize(cardSizes[cardId], cardId);
      const toggle = card.querySelector("[data-dashboard-size-toggle]") as HTMLButtonElement | null;
      const menuOpen = card.classList.contains("isSizeMenuOpen");
      if (isFixedFullWidthDashboardCard(cardId)) {
        if (toggle) toggle.remove();
        const menu = card.querySelector("[data-dashboard-size-menu]") as HTMLElement | null;
        if (menu) menu.remove();
      }
      if (toggle) toggle.setAttribute("aria-expanded", menuOpen ? "true" : "false");
      Array.from(card.querySelectorAll(".dashboardSizeOption[data-dashboard-size]")).forEach((btn) => {
        const option = btn as HTMLButtonElement;
        const optionSize = sanitizeDashboardCardSize(option.getAttribute("data-dashboard-size"), cardId);
        const isSelected = !!optionSize && !!selectedSize && optionSize === selectedSize;
        option.classList.toggle("isOn", isSelected);
        option.setAttribute("aria-checked", isSelected ? "true" : "false");
      });
    });
  }

  function closeDashboardCardSizeMenus() {
    const grid = els.dashboardGrid;
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
    const grid = els.dashboardGrid;
    if (!grid) return;
    const dashboard = getCloudDashboardRecord();
    const order = Array.isArray(dashboard?.order) ? dashboard.order : [];
    if (!order.length) return;
    applyOrderedDashboardCards(grid, order as string[]);
  }

  function getCurrentDashboardOrder() {
    const grid = els.dashboardGrid;
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
  }

  function beginDashboardEditMode() {
    if (ctx.getDashboardEditMode()) return;
    ctx.setDashboardOrderDraftBeforeEdit(getCurrentDashboardOrder());
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
    ctx.setDashboardCardSizes(
      ctx.getDashboardCardSizesDraftBeforeEdit() ? { ...ctx.getDashboardCardSizesDraftBeforeEdit()! } : {}
    );
    applyDashboardCardSizes();
    ctx.setDashboardEditMode(false);
    ctx.setDashboardOrderDraftBeforeEdit(null);
    ctx.setDashboardCardSizesDraftBeforeEdit(null);
    applyDashboardEditMode();
  }

  function commitDashboardEditMode() {
    if (!ctx.getDashboardEditMode()) return;
    saveDashboardOrder();
    ctx.setDashboardEditMode(false);
    ctx.setDashboardOrderDraftBeforeEdit(null);
    ctx.setDashboardCardSizesDraftBeforeEdit(null);
    applyDashboardEditMode();
    if (ctx.getCurrentAppPage() === "dashboard") {
      renderDashboardWidgets();
    }
  }

  function applyDashboardEditMode() {
    const grid = els.dashboardGrid;
    if (!grid) return;
    ensureDashboardCardSizeControls();
    if (!ctx.getDashboardEditMode()) closeDashboardCardSizeMenus();
    grid.classList.toggle("isEditMode", ctx.getDashboardEditMode());
    Array.from(grid.querySelectorAll(".dashboardCard")).forEach((el) => {
      (el as HTMLElement).setAttribute("draggable", ctx.getDashboardEditMode() ? "true" : "false");
    });
    syncDashboardCardSizeControlState();
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
  }

  function renderDashboardWidgets(opts?: DashboardRenderOptions) {
    ctx.renderDashboardWidgets(opts);
  }

  function handleDashboardPanelMenuChange(e: Event) {
    const categoryInput = (e.target as HTMLElement | null)?.closest?.(
      "input[data-dashboard-category-id]"
    ) as HTMLInputElement | null;
    if (categoryInput) {
      const modeAttr = String(categoryInput.getAttribute("data-dashboard-category-id") || "").trim();
      const mode: MainMode = modeAttr === "mode2" || modeAttr === "mode3" ? modeAttr : "mode1";
      const categoryMeta = getDashboardCategoryMeta();
      const includedCount = categoryMeta.reduce((count, row) => (isDashboardModeIncluded(row.mode) ? count + 1 : count), 0);
      const nextChecked = !!categoryInput.checked;
      if (!nextChecked && isDashboardModeIncluded(mode) && includedCount <= 1) {
        categoryInput.checked = true;
        syncDashboardPanelMenuState();
        return;
      }
      const nextIncludedModes = { ...ctx.getDashboardIncludedModes(), [mode]: nextChecked };
      ctx.setDashboardIncludedModes(nextIncludedModes);
      ensureDashboardIncludedModesValid();
      syncDashboardPanelMenuState();
      saveDashboardWidgetState({
        cardSizes: getDashboardCardSizeMapForStorage(),
        avgSessionByTaskRange: ctx.getDashboardAvgRange(),
      });
      if (ctx.getCurrentAppPage() === "dashboard") renderDashboardWidgets();
      return;
    }
    const input = (e.target as HTMLElement | null)?.closest?.("input[data-dashboard-panel-id]") as HTMLInputElement | null;
    if (!input) return;
    const cardId = String(input.getAttribute("data-dashboard-panel-id") || "").trim();
    if (!cardId) return;
    const meta = collectDashboardPanelMeta();
    const visibleCount = meta.reduce((count, row) => (isDashboardCardVisible(row.panelId) ? count + 1 : count), 0);
    const nextChecked = !!input.checked;
    if (!nextChecked && isDashboardCardVisible(cardId) && visibleCount <= 1) {
      input.checked = true;
      syncDashboardPanelMenuState();
      return;
    }
    ctx.setDashboardCardVisibility({ ...ctx.getDashboardCardVisibility(), [cardId]: nextChecked });
    applyDashboardCardVisibility();
    saveDashboardWidgetState({
      cardSizes: getDashboardCardSizeMapForStorage(),
      avgSessionByTaskRange: ctx.getDashboardAvgRange(),
    });
    if (ctx.getCurrentAppPage() === "dashboard") renderDashboardWidgets();
  }

  function handleDashboardGridClick(e: any) {
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
      const nextSize = sanitizeDashboardCardSize(sizeOption.getAttribute("data-dashboard-size"), cardId);
      if (!card || !cardId || !nextSize) return;
      ctx.setDashboardCardSizes({ ...ctx.getDashboardCardSizes(), [cardId]: nextSize });
      applyDashboardCardSizes();
      closeDashboardCardSizeMenus();
      if (ctx.getCurrentAppPage() === "dashboard") renderDashboardWidgets();
      e.preventDefault();
      return;
    }
    const densityBtn = e.target?.closest?.("[data-dashboard-timeline-density]") as HTMLElement | null;
    if (densityBtn) {
      const nextDensity = sanitizeDashboardTimelineDensity(densityBtn.getAttribute("data-dashboard-timeline-density"));
      if (nextDensity !== ctx.getDashboardTimelineDensity()) saveDashboardTimelineDensity(nextDensity);
      ctx.renderDashboardTimelineCard();
      e.preventDefault();
      return;
    }
    const timelineMarkerBtn = e.target?.closest?.("[data-dashboard-timeline-key]") as HTMLElement | null;
    if (timelineMarkerBtn) {
      const suggestionKey = String(timelineMarkerBtn.getAttribute("data-dashboard-timeline-key") || "").trim();
      ctx.selectDashboardTimelineSuggestion(suggestionKey || null);
      e.preventDefault();
      return;
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

  function handleDocumentDashboardClick(e: any) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (ctx.getDashboardEditMode() && !target.closest(".dashboardSizeControl")) {
      closeDashboardCardSizeMenus();
    }
    if (!target.closest("#dashboardPanelMenu")) {
      closeDashboardPanelMenu();
    }
  }

  function handleDashboardDragStart(e: any) {
    if (!ctx.getDashboardEditMode()) return;
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
    const grid = els.dashboardGrid;
    const dragging = ctx.getDashboardDragEl();
    if (!grid || !dragging) return;
    const over = Array.from(grid.children).find((child) => child.contains(e.target as Node)) as HTMLElement | undefined;
    if (!over || over === dragging || !grid.contains(over)) return;
    e.preventDefault();
    const rect = over.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (before) grid.insertBefore(dragging, over);
    else grid.insertBefore(dragging, over.nextSibling);
  }

  function handleDashboardDrop(e: any) {
    if (!ctx.getDashboardEditMode()) return;
    e.preventDefault();
  }

  function handleDashboardDragEnd() {
    const dragging = ctx.getDashboardDragEl();
    if (dragging) dragging.classList.remove("isDragging");
    ctx.setDashboardDragEl(null);
  }

  function registerDashboardEvents() {
    ctx.on(els.dashboardEditBtn, "click", beginDashboardEditMode);
    ctx.on(els.dashboardEditCancelBtn, "click", cancelDashboardEditMode);
    ctx.on(els.dashboardEditDoneBtn, "click", commitDashboardEditMode);
    ctx.on(els.dashboardPanelMenuList, "change", handleDashboardPanelMenuChange);
    ctx.on(els.dashboardGrid, "click", handleDashboardGridClick);
    ctx.on(document as any, "click", handleDocumentDashboardClick);
    ctx.on(els.dashboardGrid, "dragstart", handleDashboardDragStart);
    ctx.on(els.dashboardGrid, "dragover", handleDashboardDragOver);
    ctx.on(els.dashboardGrid, "drop", handleDashboardDrop);
    ctx.on(els.dashboardGrid, "dragend", handleDashboardDragEnd);
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
