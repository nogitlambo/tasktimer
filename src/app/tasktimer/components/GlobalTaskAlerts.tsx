import ConfirmOverlay from "./ConfirmOverlay";
import TimeGoalCompleteOverlay from "./TimeGoalCompleteOverlay";

export default function GlobalTaskAlerts() {
  return (
    <>
      <ConfirmOverlay />
      <TimeGoalCompleteOverlay />
    </>
  );
}
