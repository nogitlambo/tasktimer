const EMAIL_LINK_HANDOFF_CHANNEL = "tasklaunch:auth-email-link-handoff";
const EMAIL_LINK_HANDOFF_STORAGE_KEY = "tasklaunch:authEmailLinkHandoff";
const DEFAULT_HANDOFF_TIMEOUT_MS = 700;

type EmailLinkHandoffMessage =
  | {
      type: "email-link-request";
      id: string;
      href: string;
    }
  | {
      type: "email-link-ack";
      id: string;
    };

type BrowserWindow = Window &
  typeof globalThis & {
    BroadcastChannel?: typeof BroadcastChannel;
  };

type HandoffOptions = {
  win?: BrowserWindow | null;
};

function getWindow(input?: BrowserWindow | null) {
  if (input) return input;
  if (typeof window === "undefined") return null;
  return window as BrowserWindow;
}

function createMessageId() {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${randomPart}`;
}

function parseMessage(value: unknown): EmailLinkHandoffMessage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<EmailLinkHandoffMessage>;
  if (candidate.type !== "email-link-request" && candidate.type !== "email-link-ack") return null;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  if (candidate.type === "email-link-request") {
    if (typeof candidate.href !== "string" || !candidate.href.trim()) return null;
    return { type: candidate.type, id: candidate.id, href: candidate.href };
  }
  return { type: candidate.type, id: candidate.id };
}

function parseStorageMessage(value: string | null) {
  if (!value) return null;
  try {
    return parseMessage(JSON.parse(value));
  } catch {
    return null;
  }
}

function postStorageMessage(win: BrowserWindow, message: EmailLinkHandoffMessage) {
  try {
    win.localStorage.setItem(EMAIL_LINK_HANDOFF_STORAGE_KEY, JSON.stringify(message));
    win.localStorage.removeItem(EMAIL_LINK_HANDOFF_STORAGE_KEY);
  } catch {
    // Storage handoff is best-effort; BroadcastChannel may still be available.
  }
}

function openChannel(win: BrowserWindow) {
  try {
    if (!win.BroadcastChannel) return null;
    return new win.BroadcastChannel(EMAIL_LINK_HANDOFF_CHANNEL);
  } catch {
    return null;
  }
}

export function listenForEmailLinkHandoff(
  onLink: (href: string) => void,
  options: HandoffOptions = {}
) {
  const win = getWindow(options.win);
  if (!win) return () => {};

  const seenRequests = new Set<string>();
  const channel = openChannel(win);

  const handleMessage = (message: unknown) => {
    const parsed = parseMessage(message);
    if (!parsed || parsed.type !== "email-link-request" || seenRequests.has(parsed.id)) return;
    seenRequests.add(parsed.id);
    const ack: EmailLinkHandoffMessage = { type: "email-link-ack", id: parsed.id };
    try {
      channel?.postMessage(ack);
    } catch {
      // Ignore failed channel ack; storage ack below may still work.
    }
    postStorageMessage(win, ack);
    onLink(parsed.href);
  };

  const handleChannelMessage = (event: MessageEvent) => handleMessage(event.data);
  const handleStorageMessage = (event: StorageEvent) => {
    if (event.key !== EMAIL_LINK_HANDOFF_STORAGE_KEY) return;
    handleMessage(parseStorageMessage(event.newValue));
  };

  if (channel) channel.addEventListener("message", handleChannelMessage);
  win.addEventListener("storage", handleStorageMessage);

  return () => {
    if (channel) {
      channel.removeEventListener("message", handleChannelMessage);
      channel.close();
    }
    win.removeEventListener("storage", handleStorageMessage);
  };
}

export function handOffEmailLink(
  href: string,
  options: HandoffOptions & { timeoutMs?: number } = {}
): Promise<boolean> {
  const win = getWindow(options.win);
  const normalizedHref = href.trim();
  if (!win || !normalizedHref) return Promise.resolve(false);

  const id = createMessageId();
  const request: EmailLinkHandoffMessage = { type: "email-link-request", id, href: normalizedHref };
  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_HANDOFF_TIMEOUT_MS);
  const channel = openChannel(win);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      win.clearTimeout(timeoutId);
      if (channel) {
        channel.removeEventListener("message", handleChannelMessage);
        channel.close();
      }
      win.removeEventListener("storage", handleStorageMessage);
      resolve(result);
    };
    const handleMessage = (message: unknown) => {
      const parsed = parseMessage(message);
      if (parsed?.type === "email-link-ack" && parsed.id === id) finish(true);
    };
    const handleChannelMessage = (event: MessageEvent) => handleMessage(event.data);
    const handleStorageMessage = (event: StorageEvent) => {
      if (event.key !== EMAIL_LINK_HANDOFF_STORAGE_KEY) return;
      handleMessage(parseStorageMessage(event.newValue));
    };
    const timeoutId = win.setTimeout(() => finish(false), timeoutMs);

    if (channel) channel.addEventListener("message", handleChannelMessage);
    win.addEventListener("storage", handleStorageMessage);
    try {
      channel?.postMessage(request);
    } catch {
      // Storage fallback below still has a chance to deliver the request.
    }
    postStorageMessage(win, request);
  });
}

