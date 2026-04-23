import type { TaskTimerTaskListUiContext } from "./context";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerTaskListUi(ctx: TaskTimerTaskListUiContext) {
  const { els, runtime } = ctx;
  const TASK_DRAGGING_LIST_CLASS = "isTaskDragging";
  const TASK_DRAG_PLACEHOLDER_CLASS = "taskDragPlaceholder";
  const TASK_DRAG_HIDDEN_CLASS = "isDragGhostHidden";
  let dragPointerOffsetY = 0;
  let dragCardHeight = 0;
  let dragPlaceholderEl: HTMLElement | null = null;

  function shouldIgnoreTaskDragStart(target: EventTarget | null) {
    const targetEl = target as HTMLElement | null;
    return !!targetEl?.closest?.(
      ".actions, .taskFlipBtn, .taskBack, .taskBackActions, .historyInline, .historyCanvasWrap, .progressRow, button, summary, details, canvas, input, select, textarea"
    );
  }

  function clearTaskFlipStates() {
    ctx.getFlippedTaskIds().clear();
    ctx.setLastRenderedTaskFlipView(ctx.getTaskView());
  }

  function syncTaskFlipStatesForVisibleTasks(visibleTaskIds: Iterable<string>) {
    if (ctx.getCurrentAppPage() !== "tasks") {
      clearTaskFlipStates();
      return;
    }
    const currentView = ctx.getTaskView();
    if (ctx.getLastRenderedTaskFlipView() && ctx.getLastRenderedTaskFlipView() !== currentView) {
      ctx.getFlippedTaskIds().clear();
    }
    const visibleIdSet = new Set(Array.from(visibleTaskIds).map((taskId) => String(taskId || "").trim()).filter(Boolean));
    Array.from(ctx.getFlippedTaskIds()).forEach((taskId) => {
      if (!visibleIdSet.has(taskId)) ctx.getFlippedTaskIds().delete(taskId);
    });
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
    nextTasks.forEach((_, index) => {
      modeIndexes.push(index);
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
    const cardRect = card.getBoundingClientRect();
    dragPointerOffsetY = Number.isFinite(event?.clientY) ? Math.max(0, event.clientY - cardRect.top) : cardRect.height / 2;
    dragCardHeight = cardRect.height;
    clearTaskDragState();
    dragPlaceholderEl = document.createElement("div");
    dragPlaceholderEl.className = TASK_DRAG_PLACEHOLDER_CLASS;
    dragPlaceholderEl.setAttribute("aria-hidden", "true");
    dragPlaceholderEl.style.height = `${cardRect.height}px`;
    card.insertAdjacentElement("afterend", dragPlaceholderEl);
    ctx.setTaskDragEl(card);
    els.taskList.classList.add(TASK_DRAGGING_LIST_CLASS);
    card.classList.add("isDragging");
    window.requestAnimationFrame(() => {
      if (ctx.getTaskDragEl() === card) card.classList.add(TASK_DRAG_HIDDEN_CLASS);
    });
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", card.getAttribute("data-task-id") || "");
      } catch {
        // ignore
      }
    }
  }

  function clearTaskDragState() {
    const list = els.taskList;
    if (!list) return;
    list.classList.remove(TASK_DRAGGING_LIST_CLASS);
    dragPlaceholderEl?.remove();
    dragPlaceholderEl = null;
  }

  function getDragCenterY(clientYRaw: unknown) {
    const clientY = typeof clientYRaw === "number" && Number.isFinite(clientYRaw) ? clientYRaw : 0;
    const inferredTop = clientY - dragPointerOffsetY;
    return inferredTop + dragCardHeight / 2;
  }

  function animateTaskListReflow(beforeRects: Map<HTMLElement, DOMRect>) {
    const list = els.taskList;
    if (!list) return;
    const taskEls = Array.from(list.querySelectorAll(".task")).filter(
      (taskEl): taskEl is HTMLElement => taskEl instanceof HTMLElement && taskEl !== ctx.getTaskDragEl()
    );
    taskEls.forEach((taskEl) => {
      const beforeRect = beforeRects.get(taskEl);
      if (!beforeRect) return;
      const afterRect = taskEl.getBoundingClientRect();
      const deltaX = beforeRect.left - afterRect.left;
      const deltaY = beforeRect.top - afterRect.top;
      if (!deltaX && !deltaY) return;
      taskEl.style.transition = "none";
      taskEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      void taskEl.offsetWidth;
      taskEl.style.transition = "transform .18s cubic-bezier(.22,.78,.2,1)";
      taskEl.style.transform = "";
      const cleanup = () => {
        if (taskEl.style.transform) return;
        taskEl.style.transition = "";
      };
      taskEl.addEventListener("transitionend", cleanup, { once: true });
    });
  }

  function captureTaskRects() {
    const list = els.taskList;
    const rects = new Map<HTMLElement, DOMRect>();
    if (!list) return rects;
    Array.from(list.querySelectorAll(".task")).forEach((taskEl) => {
      if (!(taskEl instanceof HTMLElement) || taskEl === ctx.getTaskDragEl()) return;
      rects.set(taskEl, taskEl.getBoundingClientRect());
    });
    return rects;
  }

  function moveDragPlaceholder(nextTask: HTMLElement | null) {
    const list = els.taskList;
    const placeholder = dragPlaceholderEl;
    if (!list || !placeholder) return;
    const currentParent = placeholder.parentElement;
    const samePosition =
      currentParent === list && (nextTask ? placeholder.nextElementSibling === nextTask : placeholder === list.lastElementChild);
    if (samePosition) return;
    const beforeRects = captureTaskRects();
    if (nextTask) list.insertBefore(placeholder, nextTask);
    else list.appendChild(placeholder);
    animateTaskListReflow(beforeRects);
  }

  function handleTaskListDragOver(event: any) {
    const list = els.taskList;
    const dragging = ctx.getTaskDragEl();
    const placeholder = dragPlaceholderEl;
    if (!list || !dragging || !placeholder) return;
    const dragCenterY = getDragCenterY(event?.clientY);
    event.preventDefault();
    const candidateTasks = Array.from(list.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== dragging && child !== placeholder && child.classList.contains("task")
    );
    const nextTask =
      candidateTasks.find((child) => {
        const rect = child.getBoundingClientRect();
        return dragCenterY < rect.top + rect.height / 2;
      }) || null;
    moveDragPlaceholder(nextTask);
  }

  function finishTaskListDrag() {
    const dragging = ctx.getTaskDragEl();
    const list = els.taskList;
    const placeholder = dragPlaceholderEl;
    if (!dragging || !list) return;
    dragging.classList.remove(TASK_DRAG_HIDDEN_CLASS);
    if (placeholder?.parentElement === list) {
      list.insertBefore(dragging, placeholder);
    }
    clearTaskDragState();
    dragPointerOffsetY = 0;
    dragCardHeight = 0;
    if (list.contains(dragging)) {
      persistTaskOrderFromTaskListDom();
      ctx.render();
    }
    dragging.classList.remove("isDragging");
    ctx.setTaskDragEl(null);
  }

  function handleTaskListDrop(event: any) {
    if (!ctx.getTaskDragEl()) return;
    event.preventDefault();
    finishTaskListDrag();
  }

  function handleTaskListDragEnd() {
    if (!ctx.getTaskDragEl()) return;
    finishTaskListDrag();
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
