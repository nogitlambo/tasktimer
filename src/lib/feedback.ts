export type FeedbackType = "bug" | "general" | "feature";
export type FeedbackEmailStatus = "pending" | "sent" | "failed";

export function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

export function feedbackAttachmentError(files: ReadonlyArray<{ size: number; type: string }>) {
  if (files.length > 8) return "You can attach up to 8 screenshots per submission.";
  if (files.some((file) => file.type !== "image/png")) return "Screenshots must be submitted as PNG images.";
  if (files.some((file) => !file.size || file.size > 6 * 1024 * 1024)) return "Each screenshot must be a PNG no larger than 6 MB.";
  if (files.reduce((total, file) => total + file.size, 0) > 15 * 1024 * 1024) return "Screenshots must total no more than 15 MB.";
  return "";
}

export function feedbackDeliveryMessage(status: FeedbackEmailStatus) {
  if (status === "sent") return "Feedback emailed to support successfully.";
  if (status === "failed") return "Your feedback remains saved, but email delivery to support failed. Please do not resubmit it.";
  return "Feedback saved. Email delivery to support is pending.";
}
