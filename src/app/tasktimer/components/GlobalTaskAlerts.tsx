import React from "react";
import ConfirmOverlay from "./ConfirmOverlay";
import TimeGoalCompleteOverlay from "./TimeGoalCompleteOverlay";
import TimeGoalCompleteSaveNoteOverlay from "./TimeGoalCompleteSaveNoteOverlay";
import TimeGoalCompleteNoteOverlay from "./TimeGoalCompleteNoteOverlay";

export default function GlobalTaskAlerts() {
  return (
    <>
      <ConfirmOverlay />
      <TimeGoalCompleteOverlay />
      <TimeGoalCompleteSaveNoteOverlay />
      <TimeGoalCompleteNoteOverlay />
    </>
  );
}
