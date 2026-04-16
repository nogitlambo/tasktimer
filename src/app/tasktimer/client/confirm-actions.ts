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
  safeTaskName: string;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return {
    title: "Delete Task",
    text: "",
    options: {
      okLabel: "Delete",
      cancelLabel: "Cancel",
      checkboxLabel: "Delete history logs",
      checkboxChecked: true,
      textHtml: `<span class="confirmDanger">Delete "${args.safeTaskName}"?</span>`,
      onOk: args.onDelete,
      onCancel: args.onCancel,
    } satisfies TaskTimerConfirmOptions,
  };
}

export function buildScheduleConvertConfirmOptions(args: {
  taskName: string;
  dayLabel: string;
  onConvert: () => void;
  onCancel: () => void;
}) {
  return {
    title: "Convert To Single Day",
    text: `Limit ${args.taskName || "this task"} to ${args.dayLabel} only? Its current start time will stay the same.`,
    options: {
      okLabel: "Convert",
      cancelLabel: "Cancel",
      onOk: args.onConvert,
      onCancel: args.onCancel,
    } satisfies TaskTimerConfirmOptions,
  };
}
