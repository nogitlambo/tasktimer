import ConfirmOverlay from "./ConfirmOverlay";
import DailyRewardOverlay from "./DailyRewardOverlay";
import TimeGoalCompleteNextTaskModal from "./TimeGoalCompleteNextTaskModal";
import TimeGoalCompleteOverlay from "./TimeGoalCompleteOverlay";

export default function GlobalTaskAlerts() {
  return (
    <>
      <ConfirmOverlay />
      <TimeGoalCompleteOverlay />
      <TimeGoalCompleteNextTaskModal />
      <DailyRewardOverlay />
    </>
  );
}
