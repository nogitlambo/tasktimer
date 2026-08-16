import type { Metadata } from "next";
import type { ReactNode } from "react";
import TaskLaunchAuthGuard from "../tasktimer/TaskLaunchAuthGuard";
import "../tasktimer/tasktimer.css";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <TaskLaunchAuthGuard>{children}</TaskLaunchAuthGuard>;
}
