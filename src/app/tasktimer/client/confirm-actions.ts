import type { TaskTimerConfirmOptions } from "./context";

export function buildUpgradePromptConfirmOptions(args: {
  featureLabel: string;
  requiredPlan: "pro";
  closeConfirm: () => void;
  openPlans: () => void;
}) {
  const normalizedFeatureLabel = String(args.featureLabel || "This feature").trim() || "This feature";
  const planLabel = args.requiredPlan === "pro" ? "Pro" : "Pro";
  return {
    title: `${planLabel} Feature`,
    text: `${normalizedFeatureLabel} is available on the ${planLabel} plan.`,
    options: {
      okLabel: "Open Plans",
      cancelLabel: "Close",
      onOk: () => {
        args.closeConfirm();
        args.openPlans();
      },
      onCancel: () => args.closeConfirm(),
    } satisfies TaskTimerConfirmOptions,
  };
}

export function buildExitAppConfirmOptions(args: { closeConfirm: () => void; exitApp: () => void }) {
  return {
    title: "Exit App",
    text: "Do you want to exit the app?",
    options: {
      okLabel: "Yes",
      cancelLabel: "Cancel",
      onOk: () => {
        args.closeConfirm();
        args.exitApp();
      },
      onCancel: () => args.closeConfirm(),
    } satisfies TaskTimerConfirmOptions,
  };
}

export function buildDeleteTaskConfirmOptions(args: {
  taskName: string;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const taskName = String(args.taskName || "this task").trim() || "this task";
  return {
    title: `Delete "${taskName}"?`,
    text: "",
    options: {
      okLabel: "Delete",
      cancelLabel: "Cancel",
      checkboxLabel: "Delete history entries",
      checkboxChecked: true,
      onOk: args.onDelete,
      onCancel: args.onCancel,
    } satisfies TaskTimerConfirmOptions,
  };
}

export function buildScheduleNormalizeConfirmOptions(args: {
  taskName: string;
  dayLabel: string;
  timeLabel: string;
  onConfirmNormalize: () => void;
  onCancel: () => void;
}) {
  return {
    title: "Normalize Schedule",
    text: `Apply ${args.timeLabel || "this time"} to every scheduled day for ${args.taskName || "this task"} using ${args.dayLabel} as the reference day?`,
    options: {
      okLabel: "Normalize",
      cancelLabel: "Cancel",
      onOk: args.onConfirmNormalize,
      onCancel: args.onCancel,
    } satisfies TaskTimerConfirmOptions,
  };
}
