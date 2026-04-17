import type { ReactNode } from "react";
import TaskLaunchAuthGuard from "../tasktimer/TaskLaunchAuthGuard";

export default function LeaderboardLayout({ children }: { children: ReactNode }) {
  return <TaskLaunchAuthGuard>{children}</TaskLaunchAuthGuard>;
}
