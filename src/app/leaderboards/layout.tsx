import type { ReactNode } from "react";
import TaskLaunchAuthGuard from "../tasktimer/TaskLaunchAuthGuard";

export default function LeaderboardsLayout({ children }: { children: ReactNode }) {
  return <TaskLaunchAuthGuard requireAuth>{children}</TaskLaunchAuthGuard>;
}
