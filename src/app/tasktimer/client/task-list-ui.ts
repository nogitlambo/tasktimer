import type { TaskTimerTaskListUiContext } from "./context";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerTaskListUi(ctx: TaskTimerTaskListUiContext) {
  const { els, runtime } = ctx;

  function shouldIgnoreTaskDragStart(target: EventTarget | null) {
    const targetEl = target as HTMLElement | null;
    return !!targetEl?.closest?.(
      ".actions, .taskFlipBtn, .taskBack, .taskBackActions, .historyInline, .historyCanvasWrap, .progressRow, button, summary, details, canvas, input, select, textarea"
    );
  }

  function clearTaskFlipStates() {
    ctx.getFlippedTaskIds().clear();
    ctx.setLastRenderedTaskFlipMode(ctx.getCurrentMode());
    ctx.setLastRenderedTaskFlipView(ctx.getTaskView());
  }

  function syncTaskFlipStatesForVisibleTasks(visibleTaskIds: Iterable<string>) {
    if (ctx.getCurrentAppPage() !== "tasks") {
      clearTaskFlipStates();
      return;
    }
    const currentMode = ctx.getCurrentMode();
    const currentView = ctx.getTaskView();
    if (ctx.getLastRenderedTaskFlipMode() && ctx.getLastRenderedTaskFlipMode() !== currentMode) {
      ctx.getFlippedTaskIds().clear();
    }
    if (ctx.getLastRenderedTaskFlipView() && ctx.getLastRenderedTaskFlipView() !== currentView) {
      ctx.getFlippedTaskIds().clear();
    }
    const visibleIdSet = new Set(Array.from(visibleTaskIds).map((taskId) => String(taskId || "").trim()).filter(Boolean));
    Array.from(ctx.getFlippedTaskIds()).forEach((taskId) => {
      if (!visibleIdSet.has(taskId)) ctx.getFlippedTaskIds().delete(taskId);
    });
    ctx.setLastRenderedTaskFlipMode(currentMode);
    ctx.setLastRenderedTaskFlipView(currentView);
  }

  function applyTaskFlipDomState(taskId: string, taskEl?: HTMLElement | null) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return;
    const hostEl =
      taskEl ||
      (els.taskList?.querySelector(`.task[data-task-id="${normalizedTaskId.replace(/["\\]/g, "\\$&")}"]`) as HTMLElement | null);
    if (!hostEl) return;
    const flipped = ctx.getFlippedTaskIds().has(normalizedTaskId);
    hostEl.classList.toggle("isFlipped", flipped);
    const frontFace = hostEl.querySelector(".taskFaceFront") as HTMLElement | null;
    const backFace = hostEl.querySelector(".taskFaceBack") as HTMLElement | null;
    const openBtn = hostEl.querySelector('[data-task-flip="open"]') as HTMLElement | null;
    const closeBtn = hostEl.querySelector('[data-task-flip="close"]') as HTMLElement | null;
    if (frontFace) {
      frontFace.setAttribute("aria-hidden", flipped ? "true" : "false");
      if (flipped) frontFace.setAttribute("inert", "");
      else frontFace.removeAttribute("inert");
    }
    if (backFace) {
      backFace.setAttribute("aria-hidden", flipped ? "false" : "true");
      if (!flipped) backFace.setAttribute("inert", "");
      else backFace.removeAttribute("inert");
    }
    if (openBtn) openBtn.setAttribute("aria-expanded", flipped ? "true" : "false");
    if (closeBtn) closeBtn.setAttribute("aria-expanded", flipped ? "true" : "false");
  }

  function setTaskFlipped(taskId: string, flipped: boolean, taskEl?: HTMLElement | null) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return;
    if (flipped) ctx.getFlippedTaskIds().add(normalizedTaskId);
    else ctx.getFlippedTaskIds().delete(normalizedTaskId);
    applyTaskFlipDomState(normalizedTaskId, taskEl);
  }

  function persistTaskOrderFromTaskListDom() {
    const list = els.taskList;
    if (!list) return;
    const currentMode = ctx.getCurrentMode();
    const draggedModeTaskIds = Array.from(list.querySelectorAll(".task[data-task-id]"))
      .map((taskEl) => String((taskEl as HTMLElement).dataset.taskId || "").trim())
      .filter(Boolean);
    if (!draggedModeTaskIds.length) return;

    const taskById = new Map(ctx.getTasks().map((task) => [String(task.id || "").trim(), task]));
    const reorderedModeTasks = draggedModeTaskIds
      .map((taskId) => taskById.get(taskId) || null)
      .filter((task): task is NonNullable<typeof task> => !!task);
    if (!reorderedModeTasks.length) return;

    const nextTasks = ctx.getTasks().slice();
    const modeIndexes: number[] = [];
    nextTasks.forEach((task, index) => {
      if (ctx.taskModeOf(task) === currentMode) modeIndexes.push(index);
    });
    if (!modeIndexes.length) return;

    reorderedModeTasks.forEach((task, modeIndex) => {
      const targetIndex = modeIndexes[modeIndex];
      if (!Number.isFinite(targetIndex)) return;
      nextTasks[targetIndex] = task;
    });

    nextTasks.forEach((task, index) => {
      task.order = index + 1;
    });
    ctx.setTasks(nextTasks);
    ctx.save();
  }

  function jumpToTaskAndHighlight(taskId: string) {
    if (!taskId) return;
    window.setTimeout(() => {
      const list = els.taskList as HTMLElement | null;
      if (!list) return;
      let taskEl: HTMLElement | null = null;
      try {
        const esc =
          typeof (window as any).CSS !== "undefined" && typeof (window as any).CSS.escape === "function"
            ? (window as any).CSS.escape(taskId)
            : taskId.replace(/["\\]/g, "\\$&");
        taskEl = list.querySelector(`.task[data-task-id="${esc}"]`) as HTMLElement | null;
      } catch {
        taskEl = list.querySelector(`.task[data-task-id="${taskId}"]`) as HTMLElement | null;
      }
      if (!taskEl) return;
      try {
        taskEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      } catch {
        taskEl.scrollIntoView();
      }
      taskEl.classList.remove("isNewTaskGlow");
      void taskEl.offsetWidth;
      taskEl.classList.add("isNewTaskGlow");
      if (runtime.newTaskHighlightTimer != null) window.clearTimeout(runtime.newTaskHighlightTimer);
      runtime.newTaskHighlightTimer = window.setTimeout(() => {
        taskEl?.classList.remove("isNewTaskGlow");
        runtime.newTaskHighlightTimer = null;
      }, 3000);
    }, 0);
  }

  function handleTaskMenuDocumentClick(event: any) {
    const insideMenu = event.target?.closest?.(".taskMenu");
    if (insideMenu) {
      document.querySelectorAll(".taskMenu[open]").forEach((taskMenuEl) => {
        if (taskMenuEl !== insideMenu) (taskMenuEl as HTMLDetailsElement).open = false;
      });
    } else {
      document.querySelectorAll(".taskMenu[open]").forEach((taskMenuEl) => {
        (taskMenuEl as HTMLDetailsElement).open = false;
      });
    }
    const insideEditMove = event.target?.closest?.(".editMoveMenu");
    if (!insideEditMove && els.editMoveMenu) els.editMoveMenu.open = false;
  }

  function handleTaskMenuSummaryClick(event: any) {
    const summary = event.target?.closest?.(".taskMenu > summary");
    if (!summary) return;
    const menu = summary.closest?.(".taskMenu") as HTMLDetailsElement | null;
    if (!menu) return;

    window.setTimeout(() => {
      if (!menu.open) {
        menu.classList.remove("open-up");
        return;
      }
      menu.classList.remove("open-up");
    }, 0);
  }

  function handleTaskListDragStart(event: any) {
    if (shouldIgnoreTaskDragStart(event.target)) return;
    const card = event.target?.closest?.(".task") as HTMLElement | null;
    if (!card || !els.taskList?.contains(card)) return;
    ctx.setTaskDragEl(card);
    card.classList.add("isDragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", card.getAttribute("data-task-id") || "");
      } catch {
        // ignore
      }
    }
  }

  function handleTaskListDragOver(event: any) {
    const list = els.taskList;
    const dragging = ctx.getTaskDragEl();
    if (!list || !dragging) return;
    const over = Array.from(list.children).find((child) => child.contains(event.target as Node)) as HTMLElement | undefined;
    if (!over || over === dragging || !list.contains(over)) return;
    event.preventDefault();
    const rect = over.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    if (before) list.insertBefore(dragging, over);
    else list.insertBefore(dragging, over.nextSibling);
  }

  function handleTaskListDrop(event: any) {
    if (!ctx.getTaskDragEl()) return;
    event.preventDefault();
    persistTaskOrderFromTaskListDom();
    ctx.render();
  }

  function handleTaskListDragEnd() {
    const dragging = ctx.getTaskDragEl();
    if (dragging) dragging.classList.remove("isDragging");
    ctx.setTaskDragEl(null);
  }

  function registerTaskListUiEvents() {
    ctx.on(document, "click", handleTaskMenuDocumentClick);
    ctx.on(els.taskList, "click", handleTaskMenuSummaryClick);
    ctx.on(els.taskList, "dragstart", handleTaskListDragStart);
    ctx.on(els.taskList, "dragover", handleTaskListDragOver);
    ctx.on(els.taskList, "drop", handleTaskListDrop);
    ctx.on(els.taskList, "dragend", handleTaskListDragEnd);
  }

  return {
    clearTaskFlipStates,
    syncTaskFlipStatesForVisibleTasks,
    applyTaskFlipDomState,
    setTaskFlipped,
    persistTaskOrderFromTaskListDom,
    jumpToTaskAndHighlight,
    registerTaskListUiEvents,
  };
}
