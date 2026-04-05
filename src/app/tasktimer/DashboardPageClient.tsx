"use client";

import { useEffect, useMemo, useState } from "react";
import GlobalTaskAlerts from "./components/GlobalTaskAlerts";
import DashboardPageContent from "./components/DashboardPageContent";
import TaskTimerAppFrame from "./components/TaskTimerAppFrame";
import { buildRewardsHeaderViewModel, DEFAULT_REWARD_PROGRESS, normalizeRewardProgress } from "./lib/rewards";
import { subscribeCachedPreferences } from "./lib/storage";
import { initTaskTimerDashboardClient } from "./tasktimerClient";
import "./tasktimer.css";

export default function DashboardPageClient() {
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));
  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(rewardProgress), [rewardProgress]);

  useEffect(() => {
    const { destroy } = initTaskTimerDashboardClient();
    return () => destroy();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeCachedPreferences((prefs) => {
      setRewardProgress(normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS));
    });
    return () => unsubscribe();
  }, []);

  return (
    <>
      <TaskTimerAppFrame activePage="dashboard">
        <div className="appPages">
          <DashboardPageContent rewardsHeader={rewardsHeader} active={true} />
        </div>
      </TaskTimerAppFrame>

      <GlobalTaskAlerts />
    </>
  );
}
