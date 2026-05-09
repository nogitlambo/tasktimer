import { Suspense } from "react";
import type { AppPage } from "./client/types";
import TaskTimerMainAppClient from "./TaskTimerMainAppClient";

type TaskTimerMainAppPageProps = {
  initialPage: AppPage;
};

export default function TaskTimerMainAppPage({ initialPage }: TaskTimerMainAppPageProps) {
  return (
    <Suspense fallback={null}>
      <TaskTimerMainAppClient initialPage={initialPage} />
    </Suspense>
  );
}
