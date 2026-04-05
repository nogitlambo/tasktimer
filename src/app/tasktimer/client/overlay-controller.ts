import type { TaskTimerOverlayRegistryEntry } from "./overlay-registry";

export function createTaskTimerOverlayController(registry: TaskTimerOverlayRegistryEntry[]) {
  const byId = new Map(registry.map((entry) => [entry.id, entry]));

  function open(idRaw: string) {
    const id = String(idRaw || "").trim();
    if (!id) return;
    byId.get(id)?.open();
  }

  function has(idRaw: string) {
    const id = String(idRaw || "").trim();
    return !!id && byId.has(id);
  }

  return {
    open,
    has,
  };
}
