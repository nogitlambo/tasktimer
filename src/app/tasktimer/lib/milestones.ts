import type { Milestone } from "./types";

export function sortMilestones(msArr: Milestone[]): Milestone[] {
  return (msArr || []).slice().sort((a, b) => (+a.hours || 0) - (+b.hours || 0));
}
