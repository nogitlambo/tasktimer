import type { ReactNode } from "react";

import TaskLaunchAuthGuard from "../tasktimer/TaskLaunchAuthGuard";
import "../tasktimer/tasktimer.css";

export default function ExecutiveLayout({ children }: { children: ReactNode }) {
  return <TaskLaunchAuthGuard>{children}</TaskLaunchAuthGuard>;
}
