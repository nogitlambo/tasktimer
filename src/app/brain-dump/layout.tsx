import type { Metadata } from "next";
import type { ReactNode } from "react";

import TaskLaunchAuthGuard from "../tasktimer/TaskLaunchAuthGuard";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function BrainDumpLayout({ children }: { children: ReactNode }) {
  return <TaskLaunchAuthGuard>{children}</TaskLaunchAuthGuard>;
}
