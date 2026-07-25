import ConfirmOverlay from "./ConfirmOverlay";
import DailyRewardOverlay from "./DailyRewardOverlay";
import TimeGoalCompleteOverlay from "./TimeGoalCompleteOverlay";

export default function GlobalTaskAlerts() {
  return (
    <>
      <ConfirmOverlay />
      <TimeGoalCompleteOverlay />
      <DailyRewardOverlay />
    </>
  );
}
