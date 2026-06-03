import { afterEach, describe, expect, it, vi } from "vitest";

import { handOffEmailLink, listenForEmailLinkHandoff } from "./emailLinkHandoff";

type Listener = (event: { data?: unknown; key?: string | null; newValue?: string | null }) => void;

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];

  name: string;
  listeners = new Set<Listener>();
  closed = false;

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  addEventListener(_type: string, listener: Listener) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: Listener) {
    this.listeners.delete(listener);
  }

  postMessage(data: unknown) {
    for (const instance of FakeBroadcastChannel.instances) {
      if (instance === this || instance.name !== this.name || instance.closed) continue;
      for (const listener of instance.listeners) listener({ data });
    }
  }

  close() {
    this.closed = true;
  }
}

function createStorageWindowGroup(count: number) {
  const storageValues = new Map<string, string>();
  const windows: Array<{
    listeners: Set<Listener>;
    addEventListener: (type: string, listener: Listener) => void;
    removeEventListener: (type: string, listener: Listener) => void;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    localStorage: {
      setItem: (key: string, value: string) => void;
      removeItem: (key: string) => void;
    };
  }> = [];

  for (let i = 0; i < count; i += 1) {
    const win = {
      listeners: new Set<Listener>(),
      addEventListener: (_type: string, listener: Listener) => {
        win.listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: Listener) => {
        win.listeners.delete(listener);
      },
      setTimeout,
      clearTimeout,
      localStorage: {
        setItem: (key: string, value: string) => {
          storageValues.set(key, value);
          for (const other of windows) {
            if (other === win) continue;
            for (const listener of other.listeners) listener({ key, newValue: value });
          }
        },
        removeItem: (key: string) => {
          storageValues.delete(key);
        },
      },
    };
    windows.push(win);
  }

  return windows;
}

describe("email link handoff", () => {
  afterEach(() => {
    FakeBroadcastChannel.instances = [];
    vi.useRealTimers();
  });

  it("hands off and acknowledges through BroadcastChannel", async () => {
    const onLink = vi.fn();
    const [receiver, sender] = createStorageWindowGroup(2);
    const receiverWindow = { ...receiver, BroadcastChannel: FakeBroadcastChannel };
    const senderWindow = { ...sender, BroadcastChannel: FakeBroadcastChannel };
    const dispose = listenForEmailLinkHandoff(onLink, { win: receiverWindow as never });

    await expect(handOffEmailLink("https://tasklaunch.app/login/?mode=signIn", { win: senderWindow as never })).resolves.toBe(
      true
    );

    expect(onLink).toHaveBeenCalledWith("https://tasklaunch.app/login/?mode=signIn");
    dispose();
  });

  it("falls back to localStorage events when BroadcastChannel is unavailable", async () => {
    const onLink = vi.fn();
    const [receiver, sender] = createStorageWindowGroup(2);
    const dispose = listenForEmailLinkHandoff(onLink, { win: receiver as never });

    await expect(handOffEmailLink("https://tasklaunch.app/login/?mode=signIn", { win: sender as never })).resolves.toBe(
      true
    );

    expect(onLink).toHaveBeenCalledWith("https://tasklaunch.app/login/?mode=signIn");
    dispose();
  });

  it("returns false when no tab acknowledges before timeout", async () => {
    vi.useFakeTimers();
    const [sender] = createStorageWindowGroup(1);
    const result = handOffEmailLink("https://tasklaunch.app/login/?mode=signIn", {
      win: sender as never,
      timeoutMs: 25,
    });

    vi.advanceTimersByTime(25);

    await expect(result).resolves.toBe(false);
  });
});

