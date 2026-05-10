import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { createTaskTimerTaskListUi } from "./task-list-ui";

type Handler = (event?: unknown) => void;

class FakeClassList {
  private classes = new Set<string>();

  add(...tokens: string[]) {
    tokens.forEach((token) => this.classes.add(token));
  }

  remove(...tokens: string[]) {
    tokens.forEach((token) => this.classes.delete(token));
  }

  contains(token: string) {
    return this.classes.has(token);
  }

  toggle(token: string, force?: boolean) {
    if (force === true) {
      this.classes.add(token);
      return true;
    }
    if (force === false) {
      this.classes.delete(token);
      return false;
    }
    if (this.classes.has(token)) {
      this.classes.delete(token);
      return false;
    }
    this.classes.add(token);
    return true;
  }
}

class FakeElement {
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  classList = new FakeClassList();
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  offsetWidth = 0;
  rectTop = 0;
  rectLeft = 0;
  rectHeight = 80;
  rectWidth = 300;

  constructor(public readonly tagName: string) {}

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  appendChild(child: FakeElement) {
    if (child.parentElement) child.parentElement.removeChild(child);
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child: FakeElement, reference: FakeElement | null) {
    if (child === reference) return child;
    if (child.parentElement) child.parentElement.removeChild(child);
    child.parentElement = this;
    if (!reference) {
      this.children.push(child);
      return child;
    }
    const nextIndex = this.children.indexOf(reference);
    if (nextIndex < 0) {
      this.children.push(child);
      return child;
    }
    this.children.splice(nextIndex, 0, child);
    return child;
  }

  removeChild(child: FakeElement) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    if (child.parentElement === this) child.parentElement = null;
    return child;
  }

  contains(node: FakeElement | null) {
    if (!node) return false;
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  closest(selector: string) {
    return findClosestMatch(this, selector);
  }

  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string) {
    const matches: FakeElement[] = [];
    const visit = (node: FakeElement) => {
      if (matchesSelector(node, selector)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }

  getBoundingClientRect() {
    const parent = this.parentElement;
    if (parent) {
      const index = parent.children.indexOf(this);
      const columnIndex = parent.dataset.tileColumn ? Number(parent.dataset.tileColumn || 0) || 0 : 0;
      this.rectTop = index * 100;
      this.rectLeft = columnIndex * 320;
    }
    return {
      top: this.rectTop,
      left: this.rectLeft,
      height: this.rectHeight,
      width: this.rectWidth,
      bottom: this.rectTop + this.rectHeight,
      right: this.rectLeft + this.rectWidth,
      x: this.rectLeft,
      y: this.rectTop,
      toJSON: () => "",
    } as DOMRect;
  }

  addEventListener(type: string, handler: (...args: unknown[]) => void) {
    const existing = this.listeners.get(type) || [];
    existing.push(handler);
    this.listeners.set(type, existing);
  }

  get nextElementSibling() {
    const parent = this.parentElement;
    if (!parent) return null;
    const index = parent.children.indexOf(this);
    return parent.children[index + 1] ?? null;
  }

  get lastElementChild() {
    return this.children[this.children.length - 1] ?? null;
  }
}

function matchesSelector(node: FakeElement, selector: string) {
  if (selector === ".task") return node.classList.contains("task");
  if (selector === ".task[data-task-id]") return node.classList.contains("task") && !!node.dataset.taskId;
  if (selector === ".taskTileColumn:last-child") {
    const parent = node.parentElement;
    return (
      node.classList.contains("taskTileColumn") &&
      !!parent &&
      parent.children[parent.children.length - 1] === node
    );
  }
  return false;
}

function findClosestMatch(node: FakeElement | null, selector: string): FakeElement | null {
  if (!node) return null;
  if (matchesSelector(node, selector)) return node;
  return findClosestMatch(node.parentElement, selector);
}

function buildTask(id: string, order: number): Task {
  return {
    id,
    name: id.toUpperCase(),
    order,
    elapsed: 0,
    running: false,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    timeGoalEnabled: false,
    timeGoalMinutes: 0,
  } as Task;
}

function taskIds(list: FakeElement) {
  return list.querySelectorAll(".task").map((taskEl) => taskEl.dataset.taskId || "");
}

function createHarness(taskIdsInOrder = ["a", "b", "c", "d"]) {
  const list = new FakeElement("section");
  const handlers = new Map<string, Handler>();
  const tasks = taskIdsInOrder.map((id, index) => buildTask(id, index + 1));
  let dragEl: FakeElement | null = null;
  const save = vi.fn();
  const render = vi.fn();

  taskIdsInOrder.forEach((id, index) => {
    const card = new FakeElement("div");
    card.classList.add("task");
    card.dataset.taskId = id;
    card.setAttribute("data-task-id", id);
    card.setAttribute("draggable", "true");
    card.rectTop = index * 100;
    list.appendChild(card);
  });

  const fakeDocument = {
    querySelectorAll: vi.fn(() => []),
  };
  const fakeWindow = {
    requestAnimationFrame: (handler: FrameRequestCallback) => {
      handler(0);
      return 1;
    },
    setTimeout,
    clearTimeout,
  };

  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("HTMLElement", FakeElement);

  const ui = createTaskTimerTaskListUi({
    els: { taskList: list as unknown as HTMLElement } as { taskList: HTMLElement },
    on: ((target: unknown, eventName: string, handler: Handler) => {
      void target;
      handlers.set(eventName, handler);
    }) as never,
    runtime: { newTaskHighlightTimer: null } as never,
    getTasks: () => tasks,
    setTasks: (nextTasks) => {
      tasks.splice(0, tasks.length, ...nextTasks);
    },
    getCurrentAppPage: () => "tasks",
    getTaskView: () => "tile",
    getTaskOrderBy: () => "custom",
    getTaskDragEl: () => dragEl as unknown as HTMLElement | null,
    setTaskDragEl: (value) => {
      dragEl = value as unknown as FakeElement | null;
    },
    getFlippedTaskIds: () => new Set<string>(),
    getLastRenderedTaskFlipView: () => null,
    setLastRenderedTaskFlipView: () => {},
    save,
    render,
  });

  ui.registerTaskListUiEvents();

  return {
    list,
    tasks,
    save,
    render,
    handlers,
    cards: Object.fromEntries(list.children.map((child) => [child.dataset.taskId || "", child])),
  };
}

describe("task list ui drag ordering", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("swaps the hovered task into the dragged card's vacated slot", () => {
    const harness = createHarness();
    const dragstart = harness.handlers.get("dragstart");
    const dragover = harness.handlers.get("dragover");

    dragstart?.({
      target: harness.cards.b,
      clientY: 150,
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    });
    dragover?.({
      target: harness.cards.c,
      clientY: 250,
      preventDefault: vi.fn(),
    });

    expect(taskIds(harness.list)).toEqual(["a", "c", "b", "d"]);
  });

  it("updates the vacated slot smoothly across repeated hover transitions", () => {
    const harness = createHarness();
    const dragstart = harness.handlers.get("dragstart");
    const dragover = harness.handlers.get("dragover");

    dragstart?.({
      target: harness.cards.b,
      clientY: 150,
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    });
    dragover?.({
      target: harness.cards.c,
      clientY: 250,
      preventDefault: vi.fn(),
    });
    dragover?.({
      target: harness.cards.d,
      clientY: 350,
      preventDefault: vi.fn(),
    });

    expect(taskIds(harness.list)).toEqual(["a", "c", "d", "b"]);
  });

  it("persists the final DOM order on drop and rerenders", () => {
    const harness = createHarness();
    const dragstart = harness.handlers.get("dragstart");
    const dragover = harness.handlers.get("dragover");
    const drop = harness.handlers.get("drop");

    dragstart?.({
      target: harness.cards.b,
      clientY: 150,
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    });
    dragover?.({
      target: harness.cards.d,
      clientY: 350,
      preventDefault: vi.fn(),
    });
    drop?.({
      preventDefault: vi.fn(),
    });

    expect(harness.tasks.map((task) => task.id)).toEqual(["a", "c", "d", "b"]);
    expect(harness.tasks.map((task) => task.order)).toEqual([1, 2, 3, 4]);
    expect(harness.save).toHaveBeenCalledTimes(1);
    expect(harness.render).toHaveBeenCalledTimes(1);
  });

  it("falls back to appending at the end when dragging below all cards", () => {
    const harness = createHarness();
    const dragstart = harness.handlers.get("dragstart");
    const dragover = harness.handlers.get("dragover");

    dragstart?.({
      target: harness.cards.b,
      clientY: 150,
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    });
    dragover?.({
      target: harness.list,
      clientY: 999,
      preventDefault: vi.fn(),
    });

    expect(taskIds(harness.list)).toEqual(["a", "c", "d", "b"]);
  });

  it("retries highlighting when the new task card is not immediately in the DOM", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const scrollIntoView = vi.fn();
      const delayedTaskCard = new FakeElement("div") as FakeElement & { scrollIntoView: typeof scrollIntoView };
      delayedTaskCard.classList.add("task");
      delayedTaskCard.dataset.taskId = "late-task";
      delayedTaskCard.scrollIntoView = scrollIntoView;
      const querySelector = vi
        .spyOn(harness.list, "querySelector")
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(delayedTaskCard as unknown as FakeElement);

      const ui = createTaskTimerTaskListUi({
        els: { taskList: harness.list as unknown as HTMLElement } as { taskList: HTMLElement },
        on: (() => {}) as never,
        runtime: { newTaskHighlightTimer: null } as never,
        getTasks: () => harness.tasks,
        setTasks: () => {},
        getCurrentAppPage: () => "tasks",
        getTaskView: () => "tile",
        getTaskOrderBy: () => "custom",
        getTaskDragEl: () => null,
        setTaskDragEl: () => {},
        getFlippedTaskIds: () => new Set<string>(),
        getLastRenderedTaskFlipView: () => null,
        setLastRenderedTaskFlipView: () => {},
        save: vi.fn(),
        render: vi.fn(),
      });

      ui.jumpToTaskAndHighlight("late-task");
      vi.runAllTimers();

      expect(querySelector).toHaveBeenCalledTimes(2);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(delayedTaskCard.classList.contains("isNewTaskGlow")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
