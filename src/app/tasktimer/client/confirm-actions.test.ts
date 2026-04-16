import { describe, expect, it, vi } from "vitest";

import {
  buildDeleteTaskConfirmOptions,
  buildExitAppConfirmOptions,
  buildScheduleConvertConfirmOptions,
  buildUpgradePromptConfirmOptions,
} from "./confirm-actions";

describe("confirm-actions", () => {
  it("builds the upgrade prompt config with stable labels and callbacks", () => {
    const closeConfirm = vi.fn();
    const openPlans = vi.fn();
    const config = buildUpgradePromptConfirmOptions({
      featureLabel: "Advanced dashboard",
      requiredPlan: "pro",
      closeConfirm,
      openPlans,
    });

    expect(config.title).toBe("Pro Feature");
    expect(config.text).toContain("Advanced dashboard");
    config.options.onOk?.();
    expect(closeConfirm).toHaveBeenCalledTimes(1);
    expect(openPlans).toHaveBeenCalledTimes(1);
  });

  it("builds delete-task confirm markup without mutating the task name", () => {
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    const config = buildDeleteTaskConfirmOptions({
      safeTaskName: "&lt;Review&gt;",
      onDelete,
      onCancel,
    });

    expect(config.title).toBe("Delete Task");
    expect(config.options.checkboxLabel).toBe("Delete history logs");
    expect(config.options.textHtml).toContain("&lt;Review&gt;");
    config.options.onOk?.();
    config.options.onCancel?.();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("builds exit and schedule-convert confirm actions with the expected labels", () => {
    const exitApp = vi.fn();
    const closeConfirm = vi.fn();
    const convert = vi.fn();
    const cancel = vi.fn();

    const exitConfig = buildExitAppConfirmOptions({ closeConfirm, exitApp });
    const convertConfig = buildScheduleConvertConfirmOptions({
      taskName: "Task A",
      dayLabel: "Tue",
      onConvert: convert,
      onCancel: cancel,
    });

    expect(exitConfig.options.okLabel).toBe("Yes");
    expect(convertConfig.options.okLabel).toBe("Convert");
    exitConfig.options.onOk?.();
    convertConfig.options.onOk?.();
    convertConfig.options.onCancel?.();
    expect(closeConfirm).toHaveBeenCalledTimes(1);
    expect(exitApp).toHaveBeenCalledTimes(1);
    expect(convert).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
