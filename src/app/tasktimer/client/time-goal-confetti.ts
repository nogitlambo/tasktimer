export const TIME_GOAL_CONFETTI_DURATION_MS = 3800;
export const TIME_GOAL_XP_SPLASH_TEXT_DURATION_MS = 1050;
export const TIME_GOAL_XP_COUNT_SMALL_DURATION_MS = 500;
export const TIME_GOAL_XP_COUNT_MEDIUM_DURATION_MS = 1500;
export const TIME_GOAL_XP_COUNT_LARGE_DURATION_MS = 2000;
export const TIME_GOAL_XP_COUNT_EXTRA_LARGE_DURATION_MS = 2500;
export const TIME_GOAL_XP_CALCULATING_TEXT = "Calculating XP...";
export const TIME_GOAL_XP_CUE_DELAYS_MS = [
  TIME_GOAL_XP_COUNT_SMALL_DURATION_MS,
  TIME_GOAL_XP_COUNT_MEDIUM_DURATION_MS,
  TIME_GOAL_XP_COUNT_LARGE_DURATION_MS,
  TIME_GOAL_XP_COUNT_EXTRA_LARGE_DURATION_MS,
] as const;

type TimeoutFn = (handler: () => void, timeout: number) => unknown;
type ClearTimeoutFn = (handle: unknown) => void;
type AnimationFrameFn = (handler: (timestamp: number) => void) => unknown;
type CancelAnimationFrameFn = (handle: unknown) => void;
type MatchMediaFn = (query: string) => { matches: boolean };

type XpCountAnimation = {
  timeoutHandle: unknown | null;
  timeoutHandles: unknown[];
  frameHandle: unknown | null;
  clearTimeoutFn: ClearTimeoutFn;
  cancelAnimationFrameFn: CancelAnimationFrameFn;
};

const xpCountAnimations = new WeakMap<HTMLElement, XpCountAnimation>();

type ConfettiShape = "rect" | "circle" | "triangle";
type CanvasConfettiPhase = "burst" | "fall" | "done";

type CanvasConfettiParticle = {
  x: number;
  y: number;
  phase: CanvasConfettiPhase;
  ageTicks: number;
  size: number;
  color: string;
  shape: ConfettiShape;
  rotation: number;
  rotSpeed: number;
  vy: number;
  vx: number;
  gravity: number;
  drag: number;
  delayTicks: number;
  reentryX: number;
  reentryY: number;
  fallVx: number;
  fallVy: number;
  fallGravity: number;
  swing: number;
  swingSpeed: number;
  swingPhase: number;
  opacity: number;
};

type CanvasConfettiAnimation = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  frameHandle: unknown | null;
  requestAnimationFrameFn: AnimationFrameFn;
  cancelAnimationFrameFn: CancelAnimationFrameFn;
  particles: CanvasConfettiParticle[];
  tickCount: number;
  width: number;
  height: number;
  dpr: number;
  finishing: boolean;
};

const canvasConfettiAnimations = new WeakMap<HTMLElement, CanvasConfettiAnimation>();
const domConfettiFinishTimers = new WeakMap<HTMLElement, { timeoutHandle: unknown; clearTimeoutFn: ClearTimeoutFn }>();
const TIME_GOAL_CONFETTI_CANVAS_COLORS = ["#9FE300", "#6EC001", "#F5B94A", "#F4F6F2", "#3E9C8E"] as const;
const TIME_GOAL_CONFETTI_CANVAS_SHAPES = ["rect", "circle", "triangle"] as const;
const TIME_GOAL_CONFETTI_CANVAS_COUNT = 160;
const TIME_GOAL_CONFETTI_DOM_FINISH_MS = 6500;
const TIME_GOAL_CONFETTI_PRESSURE_CONE_MIN = Math.PI * 0.16;
const TIME_GOAL_CONFETTI_PRESSURE_CONE_MAX = Math.PI * 0.84;
const TIME_GOAL_CONFETTI_CANVAS_OFFSCREEN_MARGIN = 26;
const TIME_GOAL_CONFETTI_CANVAS_BURST_MAX_TICKS = 34;

function createSeededRandom(seedValue = 91) {
  let seed = seedValue;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function randRange(rand: () => number, min: number, max: number) {
  return rand() * (max - min) + min;
}

function getTimeGoalXpFx(text: HTMLElement | null | undefined) {
  return (text?.closest(".timeGoalCompleteXpFx") as HTMLElement | null) || text || null;
}

function defaultSetTimeoutFn(handler: () => void, timeout: number) {
  return globalThis.setTimeout(handler, timeout);
}

function defaultClearTimeoutFn(handle: unknown) {
  globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
}

function defaultRequestAnimationFrameFn(handler: (timestamp: number) => void) {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(handler);
  }
  return globalThis.setTimeout(() => handler(Date.now()), 16);
}

function defaultCancelAnimationFrameFn(handle: unknown) {
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function" && typeof handle === "number") {
    window.cancelAnimationFrame(handle);
    return;
  }
  globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
}

function cancelTimeGoalXpCount(text: HTMLElement, opts?: { preserveHoldClasses?: boolean }) {
  const active = xpCountAnimations.get(text);
  if (!active) return;
  if (active.timeoutHandle != null) active.clearTimeoutFn(active.timeoutHandle);
  active.timeoutHandles.forEach((handle) => active.clearTimeoutFn(handle));
  if (active.frameHandle != null) active.cancelAnimationFrameFn(active.frameHandle);
  xpCountAnimations.delete(text);
  if (!opts?.preserveHoldClasses) {
    const fx = getTimeGoalXpFx(text);
    if (!fx) return;
    fx.classList.remove("isCalculating");
    fx.classList.remove("isCounting");
    fx.classList.remove("isPlaying");
    fx.classList.remove("isCountComplete");
  }
}

export function startTimeGoalXpCalculating(text: HTMLElement | null | undefined) {
  const fx = getTimeGoalXpFx(text);
  if (!fx || !text) return false;
  cancelTimeGoalXpCount(text);
  fx.classList.remove("isPlaying");
  fx.classList.remove("isCounting");
  fx.classList.remove("isIntervalSplashing");
  fx.classList.remove("isCountComplete");
  fx.classList.add("isCalculating");
  fx.dataset.xpCalculatingState = "playing";
  text.textContent = TIME_GOAL_XP_CALCULATING_TEXT;
  return true;
}

function stopTimeGoalXpCalculating(text: HTMLElement | null | undefined) {
  const fx = getTimeGoalXpFx(text);
  if (!fx) return;
  fx.classList.remove("isCalculating");
  fx.dataset.xpCalculatingState = "stopped";
}

export function formatTimeGoalAwardText(xp: number): string {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  return safeXp > 0 ? `You got ${safeXp} XP!` : "No XP awarded";
}

export function formatTimeGoalAwardCountText(xp: number): string {
  return `You got ${Math.max(0, Math.floor(Number(xp) || 0))} XP!`;
}

export function formatTimeGoalXpAwardedText(xp: number): string {
  return `XP Awarded: ${Math.max(0, Math.floor(Number(xp) || 0))}`;
}

export function showStaticTimeGoalXpAward(text: HTMLElement | null | undefined, awardedXp: number) {
  if (!text) return false;
  const safeAwardedXp = Math.max(0, Math.floor(Number(awardedXp) || 0));
  cancelTimeGoalXpCount(text);
  stopTimeGoalXpCalculating(text);
  const fx = getTimeGoalXpFx(text) || text;
  fx.classList.remove("isCalculating");
  fx.classList.remove("isCounting");
  fx.classList.remove("isPlaying");
  fx.classList.remove("isIntervalSplashing");
  fx.classList.remove("isCountComplete");
  fx.dataset.xpSplashState = "stopped";
  fx.dataset.xpCountState = "static";
  const value = text.querySelector?.("#timeGoalCompleteXpValue") as HTMLElement | null;
  if (value) value.textContent = String(safeAwardedXp);
  else text.textContent = formatTimeGoalXpAwardedText(safeAwardedXp);
  return true;
}

export function getTimeGoalXpCountDurationMs(awardedXp: number): number {
  const xp = Math.max(0, Math.floor(Number(awardedXp) || 0));
  if (xp <= 0) return 0;
  if (xp <= 10) return TIME_GOAL_XP_COUNT_SMALL_DURATION_MS;
  if (xp <= 25) return TIME_GOAL_XP_COUNT_MEDIUM_DURATION_MS;
  if (xp <= 50) return TIME_GOAL_XP_COUNT_LARGE_DURATION_MS;
  return TIME_GOAL_XP_COUNT_EXTRA_LARGE_DURATION_MS;
}

export function getTimeGoalXpCueDelaysMs(awardedXp: number): number[] {
  const durationMs = getTimeGoalXpCountDurationMs(awardedXp);
  if (durationMs <= 0) return [];
  return TIME_GOAL_XP_CUE_DELAYS_MS.filter((delayMs) => delayMs <= durationMs);
}

function defaultMatchMediaFn(query: string) {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") return window.matchMedia(query);
  return { matches: false };
}

function getTimeGoalConfettiCanvas(stage: HTMLElement) {
  return (stage.querySelector?.(".timeGoalCompleteConfettiCanvas") as HTMLCanvasElement | null) || null;
}

function resizeTimeGoalConfettiCanvas(active: CanvasConfettiAnimation) {
  const rect = active.canvas.getBoundingClientRect?.();
  const width = Math.max(1, Math.floor(Number(rect?.width || active.canvas.clientWidth || 0) || 0));
  const height = Math.max(1, Math.floor(Number(rect?.height || active.canvas.clientHeight || 0) || 0));
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  if (active.width === width && active.height === height && active.dpr === dpr) return;
  active.width = width;
  active.height = height;
  active.dpr = dpr;
  active.canvas.width = width * dpr;
  active.canvas.height = height * dpr;
  active.canvas.style.width = `${width}px`;
  active.canvas.style.height = `${height}px`;
  active.context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function wrapTimeGoalConfettiX(x: number, width: number) {
  if (width <= 0) return 0;
  return ((x % width) + width) % width;
}

function makeTimeGoalCanvasParticle(rand: () => number, width: number, height: number): CanvasConfettiParticle {
  const centerX = width / 2;
  const centerY = height / 2;
  const angle = randRange(rand, TIME_GOAL_CONFETTI_PRESSURE_CONE_MIN, TIME_GOAL_CONFETTI_PRESSURE_CONE_MAX);
  const pressureBias = 1 - Math.abs(angle - Math.PI / 2) / (Math.PI / 2);
  const launchSpeed = randRange(rand, 9.2, 14.8) + pressureBias * randRange(rand, 1.8, 4.4);
  const launchVx = Math.cos(angle) * launchSpeed;
  const launchVy = -Math.sin(angle) * launchSpeed;
  const startX = centerX + randRange(rand, -10, 10);
  const projectedX = wrapTimeGoalConfettiX(startX + launchVx * randRange(rand, 20, 34), width);
  const reentryX = wrapTimeGoalConfettiX(projectedX * 0.34 + randRange(rand, 0, width) * 0.66 + randRange(rand, -width * 0.22, width * 0.22), width);
  const fallVx = randRange(rand, -0.95, 0.95) + launchVx * 0.035;
  return {
    x: startX,
    y: centerY + randRange(rand, -8, 8),
    phase: "burst",
    ageTicks: 0,
    size: randRange(rand, 6, 12),
    color: TIME_GOAL_CONFETTI_CANVAS_COLORS[Math.floor(rand() * TIME_GOAL_CONFETTI_CANVAS_COLORS.length)] || "#9FE300",
    shape: TIME_GOAL_CONFETTI_CANVAS_SHAPES[Math.floor(rand() * TIME_GOAL_CONFETTI_CANVAS_SHAPES.length)] || "rect",
    rotation: randRange(rand, 0, Math.PI * 2),
    rotSpeed: randRange(rand, -0.06, 0.06),
    vy: launchVy,
    vx: launchVx,
    gravity: randRange(rand, 0.085, 0.13),
    drag: randRange(rand, 0.964, 0.982),
    delayTicks: Math.floor(rand() * 5),
    reentryX,
    reentryY: -TIME_GOAL_CONFETTI_CANVAS_OFFSCREEN_MARGIN - randRange(rand, 8, 56),
    fallVx,
    fallVy: randRange(rand, 1.15, 2.35),
    fallGravity: randRange(rand, 0.012, 0.024),
    swing: randRange(rand, 1.2, 4.8),
    swingSpeed: randRange(rand, 0.012, 0.036),
    swingPhase: randRange(rand, 0, Math.PI * 2),
    opacity: randRange(rand, 0.85, 1),
  };
}

function seedTimeGoalCanvasParticles(active: CanvasConfettiAnimation) {
  const rand = createSeededRandom(91);
  active.particles = Array.from({ length: TIME_GOAL_CONFETTI_CANVAS_COUNT }, () =>
    makeTimeGoalCanvasParticle(rand, active.width, active.height)
  );
}

function transitionTimeGoalParticleToFall(particle: CanvasConfettiParticle, width: number) {
  particle.phase = "fall";
  particle.ageTicks = 0;
  particle.reentryX = wrapTimeGoalConfettiX(particle.x, width);
  particle.x = particle.reentryX;
  particle.y = particle.reentryY;
  particle.vx = particle.fallVx;
  particle.vy = particle.fallVy;
  particle.gravity = particle.fallGravity;
  particle.drag = 1;
}

function completeTimeGoalCanvasConfetti(stage: HTMLElement, active: CanvasConfettiAnimation) {
  if (active.frameHandle != null) active.cancelAnimationFrameFn(active.frameHandle);
  active.frameHandle = null;
  active.context.clearRect(0, 0, active.width, active.height);
  canvasConfettiAnimations.delete(stage);
  stage.classList.remove("isPlaying");
  stage.classList.remove("hasCanvasConfetti");
  stage.classList.remove("isFinishing");
  if (stage.dataset.confettiRenderer === "canvas") delete stage.dataset.confettiRenderer;
  stage.dataset.confettiState = "stopped";
}

function drawTimeGoalCanvasParticle(context: CanvasRenderingContext2D, particle: CanvasConfettiParticle) {
  context.save();
  context.translate(particle.x, particle.y);
  context.rotate(particle.rotation);
  context.globalAlpha = particle.opacity;
  context.fillStyle = particle.color;
  if (particle.shape === "rect") {
    context.fillRect(-particle.size / 2, -particle.size / 3.2, particle.size, particle.size / 1.6);
  } else if (particle.shape === "circle") {
    context.beginPath();
    context.arc(0, 0, particle.size / 2.4, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(0, -particle.size / 2);
    context.lineTo(particle.size / 2, particle.size / 2);
    context.lineTo(-particle.size / 2, particle.size / 2);
    context.closePath();
    context.fill();
  }
  context.restore();
}

function startTimeGoalCanvasConfetti(
  stage: HTMLElement,
  opts?: {
    requestAnimationFrameFn?: AnimationFrameFn;
    cancelAnimationFrameFn?: CancelAnimationFrameFn;
    matchMediaFn?: MatchMediaFn;
  }
) {
  const matchMediaFn = opts?.matchMediaFn || defaultMatchMediaFn;
  if (matchMediaFn("(prefers-reduced-motion: reduce)").matches) return false;
  const canvas = getTimeGoalConfettiCanvas(stage);
  const context = canvas?.getContext?.("2d");
  if (!canvas || !context) return false;
  stopTimeGoalCanvasConfetti(stage);
  const active: CanvasConfettiAnimation = {
    canvas,
    context,
    frameHandle: null,
    requestAnimationFrameFn: opts?.requestAnimationFrameFn || defaultRequestAnimationFrameFn,
    cancelAnimationFrameFn: opts?.cancelAnimationFrameFn || defaultCancelAnimationFrameFn,
    particles: [],
    tickCount: 0,
    width: 0,
    height: 0,
    dpr: 0,
    finishing: false,
  };
  resizeTimeGoalConfettiCanvas(active);
  seedTimeGoalCanvasParticles(active);
  canvasConfettiAnimations.set(stage, active);
  stage.classList.add("hasCanvasConfetti");
  stage.dataset.confettiRenderer = "canvas";
  const tick = () => {
    if (canvasConfettiAnimations.get(stage) !== active) return;
    resizeTimeGoalConfettiCanvas(active);
    active.context.clearRect(0, 0, active.width, active.height);
    active.tickCount += 1;
    for (const particle of active.particles) {
      if (particle.phase === "done") continue;
      if (particle.delayTicks > 0) {
        particle.delayTicks -= 1;
        continue;
      }
      particle.y += particle.vy;
      const swingScale = particle.phase === "fall" ? 0.18 : 0.08;
      particle.x += particle.vx + Math.sin(active.tickCount * particle.swingSpeed + particle.swingPhase) * particle.swing * swingScale;
      particle.vy += particle.gravity;
      particle.vx *= particle.drag;
      particle.rotation += particle.rotSpeed;
      particle.ageTicks += 1;
      if (
        particle.phase === "burst" &&
        (particle.x < -TIME_GOAL_CONFETTI_CANVAS_OFFSCREEN_MARGIN ||
          particle.x > active.width + TIME_GOAL_CONFETTI_CANVAS_OFFSCREEN_MARGIN ||
          particle.y < -TIME_GOAL_CONFETTI_CANVAS_OFFSCREEN_MARGIN ||
          particle.ageTicks > TIME_GOAL_CONFETTI_CANVAS_BURST_MAX_TICKS)
      ) {
        transitionTimeGoalParticleToFall(particle, active.width);
        continue;
      }
      if (particle.phase === "fall" && particle.y > active.height + 20) {
        particle.phase = "done";
        continue;
      }
      drawTimeGoalCanvasParticle(active.context, particle);
    }
    if (active.finishing || active.particles.every((particle) => particle.phase === "done")) {
      active.particles = active.particles.filter((particle) => particle.phase !== "done");
      if (active.particles.length <= 0) {
        completeTimeGoalCanvasConfetti(stage, active);
        return;
      }
    }
    active.frameHandle = active.requestAnimationFrameFn(tick);
  };
  active.frameHandle = active.requestAnimationFrameFn(tick);
  return true;
}

function stopTimeGoalCanvasConfetti(stage: HTMLElement | null | undefined) {
  if (!stage) return;
  const active = canvasConfettiAnimations.get(stage);
  if (!active) return;
  completeTimeGoalCanvasConfetti(stage, active);
}

function clearDomConfettiFinishTimer(stage: HTMLElement | null | undefined) {
  if (!stage) return;
  const active = domConfettiFinishTimers.get(stage);
  if (!active) return;
  active.clearTimeoutFn(active.timeoutHandle);
  domConfettiFinishTimers.delete(stage);
}

function completeTimeGoalDomConfetti(stage: HTMLElement) {
  clearDomConfettiFinishTimer(stage);
  stage.classList.remove("isPlaying");
  stage.classList.remove("isFinishing");
  stage.dataset.confettiState = "stopped";
  if (stage.dataset.confettiRenderer === "dom") delete stage.dataset.confettiRenderer;
}

export function startTimeGoalConfetti(
  stage: HTMLElement | null | undefined,
  opts?: {
    requestAnimationFrameFn?: AnimationFrameFn;
    cancelAnimationFrameFn?: CancelAnimationFrameFn;
    matchMediaFn?: MatchMediaFn;
  }
) {
  if (!stage) return false;
  if (stage.dataset.confettiState === "playing") return false;
  clearDomConfettiFinishTimer(stage);
  stopTimeGoalCanvasConfetti(stage);
  stage.classList.remove("isPlaying");
  stage.classList.remove("isFinishing");
  stage.dataset.confettiState = "stopped";
  void stage.offsetWidth;
  stage.classList.add("isPlaying");
  stage.dataset.confettiState = "playing";
  if (!startTimeGoalCanvasConfetti(stage, opts)) {
    stage.classList.remove("hasCanvasConfetti");
    stage.dataset.confettiRenderer = "dom";
  }
  return true;
}

export function stopTimeGoalConfetti(stage: HTMLElement | null | undefined) {
  if (!stage) return;
  clearDomConfettiFinishTimer(stage);
  stopTimeGoalCanvasConfetti(stage);
  stage.classList.remove("isPlaying");
  stage.classList.remove("isFinishing");
  stage.dataset.confettiState = "stopped";
  if (stage.dataset.confettiRenderer === "dom") delete stage.dataset.confettiRenderer;
}

export function finishTimeGoalConfetti(
  stage: HTMLElement | null | undefined,
  opts?: {
    setTimeoutFn?: TimeoutFn;
    clearTimeoutFn?: ClearTimeoutFn;
  }
) {
  if (!stage || stage.dataset.confettiState !== "playing") return false;
  const activeCanvas = canvasConfettiAnimations.get(stage);
  stage.classList.add("isFinishing");
  stage.dataset.confettiState = "finishing";
  if (activeCanvas) {
    activeCanvas.finishing = true;
    return true;
  }
  clearDomConfettiFinishTimer(stage);
  const setTimeoutFn = opts?.setTimeoutFn || defaultSetTimeoutFn;
  const clearTimeoutFn = opts?.clearTimeoutFn || defaultClearTimeoutFn;
  const timeoutHandle = setTimeoutFn(() => {
    completeTimeGoalDomConfetti(stage);
  }, TIME_GOAL_CONFETTI_DOM_FINISH_MS);
  domConfettiFinishTimers.set(stage, { timeoutHandle, clearTimeoutFn });
  return true;
}

export function getTimeGoalConfettiStage(overlay: HTMLElement | null | undefined) {
  return (overlay?.querySelector("#timeGoalCompleteConfettiStage") as HTMLElement | null) || null;
}

export function startTimeGoalXpSplash(text: HTMLElement | null | undefined, opts?: { holdForCount?: boolean }) {
  const fx = getTimeGoalXpFx(text);
  if (!fx) return false;
  fx.classList.remove("isCalculating");
  fx.classList.remove("isPlaying");
  fx.classList.remove("isCounting");
  fx.classList.remove("isCountComplete");
  fx.dataset.xpSplashState = "stopped";
  void fx.offsetWidth;
  if (opts?.holdForCount) fx.classList.add("isCounting");
  fx.classList.add("isPlaying");
  fx.dataset.xpSplashState = "playing";
  return true;
}

export function startTimeGoalXpIntervalSplash(text: HTMLElement | null | undefined) {
  const fx = getTimeGoalXpFx(text);
  if (!fx) return false;
  fx.classList.remove("isIntervalSplashing");
  void fx.offsetWidth;
  fx.classList.add("isIntervalSplashing");
  fx.dataset.xpIntervalSplashState = "playing";
  return true;
}

export function startTimeGoalXpCount(
  text: HTMLElement | null | undefined,
  awardedXp: number,
  opts?: {
    setTimeoutFn?: TimeoutFn;
    clearTimeoutFn?: ClearTimeoutFn;
    requestAnimationFrameFn?: AnimationFrameFn;
    cancelAnimationFrameFn?: CancelAnimationFrameFn;
    preserveHeldSplash?: boolean;
    onIntervalCue?: (delayMs: number) => void;
    onFinish?: () => void;
  }
) {
  if (!text) return false;
  const targetXp = Math.max(0, Math.floor(Number(awardedXp) || 0));
  cancelTimeGoalXpCount(text, { preserveHoldClasses: opts?.preserveHeldSplash });
  stopTimeGoalXpCalculating(text);
  const durationMs = getTimeGoalXpCountDurationMs(targetXp);
  if (durationMs <= 0) {
    text.textContent = formatTimeGoalAwardText(targetXp);
    opts?.onFinish?.();
    return true;
  }

  const fx = getTimeGoalXpFx(text) || text;
  const requestAnimationFrameFn = opts?.requestAnimationFrameFn || defaultRequestAnimationFrameFn;
  const setTimeoutFn = opts?.setTimeoutFn || defaultSetTimeoutFn;
  const cancelAnimationFrameFn = opts?.cancelAnimationFrameFn || defaultCancelAnimationFrameFn;
  const clearTimeoutFn = opts?.clearTimeoutFn || defaultClearTimeoutFn;
  let startMs: number | null = null;
  const firedCueDelays = new Set<number>();

  const active: XpCountAnimation = {
    timeoutHandle: null,
    timeoutHandles: [],
    frameHandle: null,
    clearTimeoutFn,
    cancelAnimationFrameFn,
  };
  xpCountAnimations.set(text, active);
  fx.classList.remove("isCountComplete");
  fx.classList.add("isPlaying");
  fx.classList.add("isCounting");
  fx.dataset.xpCountState = "playing";
  text.textContent = formatTimeGoalAwardCountText(0);

  const fireIntervalCue = (delayMs: number) => {
    if (xpCountAnimations.get(text) !== active || firedCueDelays.has(delayMs)) return;
    firedCueDelays.add(delayMs);
    opts?.onIntervalCue?.(delayMs);
  };

  active.timeoutHandles = getTimeGoalXpCueDelaysMs(targetXp).map((delayMs) =>
    setTimeoutFn(() => {
      fireIntervalCue(delayMs);
    }, delayMs)
  );

  const finish = () => {
    if (xpCountAnimations.get(text) !== active) return;
    getTimeGoalXpCueDelaysMs(targetXp).forEach((delayMs) => fireIntervalCue(delayMs));
    active.timeoutHandles.forEach((handle) => clearTimeoutFn(handle));
    active.timeoutHandles = [];
    text.textContent = formatTimeGoalAwardText(targetXp);
    fx.classList.remove("isCounting");
    fx.classList.remove("isPlaying");
    fx.classList.remove("isIntervalSplashing");
    fx.classList.add("isCountComplete");
    fx.dataset.xpCountState = "complete";
    xpCountAnimations.delete(text);
    opts?.onFinish?.();
  };

  const tick = (timestamp: number) => {
    if (xpCountAnimations.get(text) !== active) return;
    if (startMs == null) startMs = timestamp;
    const progress = Math.max(0, Math.min(1, (timestamp - startMs) / durationMs));
    text.textContent = formatTimeGoalAwardCountText(Math.max(1, Math.round(targetXp * progress)));
    if (progress >= 1) {
      finish();
      return;
    }
    active.frameHandle = requestAnimationFrameFn(tick);
  };

  active.frameHandle = requestAnimationFrameFn(tick);
  return true;
}

export function startTimeGoalXpSplashAfterConfetti(
  text: HTMLElement | null | undefined,
  opts?: {
    awardedXp?: number;
    delayMs?: number;
    setTimeoutFn?: TimeoutFn;
    clearTimeoutFn?: ClearTimeoutFn;
    requestAnimationFrameFn?: AnimationFrameFn;
    cancelAnimationFrameFn?: CancelAnimationFrameFn;
    matchMediaFn?: (query: string) => { matches: boolean };
    onStart?: () => void;
    onIntervalCue?: (delayMs: number) => void;
    onFinish?: () => void;
  }
) {
  const fx = getTimeGoalXpFx(text);
  if (!fx) return false;
  const awardedXp = Math.max(0, Math.floor(Number(opts?.awardedXp) || 0));
  const delayMs = Math.max(0, Math.floor(Number(opts?.delayMs ?? TIME_GOAL_CONFETTI_DURATION_MS) || 0));
  const reducedMotion = !!opts?.matchMediaFn?.("(prefers-reduced-motion: reduce)")?.matches;
  const setTimeoutFn = opts?.setTimeoutFn || defaultSetTimeoutFn;
  const clearTimeoutFn = opts?.clearTimeoutFn || defaultClearTimeoutFn;
  if (text) cancelTimeGoalXpCount(text);
  fx.classList.remove("isCountComplete");
  if (reducedMotion) {
    stopTimeGoalXpCalculating(text);
    if (text) text.textContent = formatTimeGoalAwardText(awardedXp);
    if (awardedXp > 0) opts?.onStart?.();
    opts?.onFinish?.();
    return true;
  }
  const startSplash = () => {
    if (text) {
      const active = xpCountAnimations.get(text);
      if (active) active.timeoutHandle = null;
      xpCountAnimations.delete(text);
    }
    stopTimeGoalXpCalculating(text);
    if (awardedXp <= 0) {
      if (text) text.textContent = formatTimeGoalAwardText(0);
      opts?.onFinish?.();
      return true;
    }
    const started = startTimeGoalXpSplash(text, { holdForCount: awardedXp > 0 });
    if (started) opts?.onStart?.();
    if (started && text && awardedXp > 0) {
      startTimeGoalXpCount(text, awardedXp, {
        clearTimeoutFn,
        requestAnimationFrameFn: opts?.requestAnimationFrameFn,
        cancelAnimationFrameFn: opts?.cancelAnimationFrameFn,
        preserveHeldSplash: true,
        onIntervalCue: opts?.onIntervalCue,
        onFinish: opts?.onFinish,
      });
    }
    return started;
  };
  if (delayMs <= 0) return startSplash();
  if (text) startTimeGoalXpCalculating(text);
  const timeoutHandle = setTimeoutFn(() => {
    startSplash();
  }, delayMs);
  if (text) {
    xpCountAnimations.set(text, {
      timeoutHandle,
      timeoutHandles: [],
      frameHandle: null,
      clearTimeoutFn,
      cancelAnimationFrameFn: opts?.cancelAnimationFrameFn || defaultCancelAnimationFrameFn,
    });
  }
  return true;
}
