import { describe, expect, it } from "vitest";
import { feedbackAttachmentError, feedbackDeliveryMessage } from "./feedback";
describe("feedback attachments and status", () => {
  const file = (mb: number, type = "image/png") => ({size: mb * 1024 * 1024, type});
  it("accepts exact limits and rejects over-limit screenshots", () => {
    expect(feedbackAttachmentError([file(6), file(6), file(3)])).toBe("");
    expect(feedbackAttachmentError([file(6), file(6), file(3.01)])).toContain("15 MB");
    expect(feedbackAttachmentError([file(6.01)])).toContain("6 MB");
    expect(feedbackAttachmentError(Array(9).fill(file(1)))).toContain("8 screenshots");
    expect(feedbackAttachmentError([file(1, "image/jpeg")])).toContain("PNG");
    expect(feedbackAttachmentError([file(0)])).toContain("6 MB");
  });
  it("never claims email success while delivery is pending or failed", () => {
    expect(feedbackDeliveryMessage("pending")).toContain("pending");
    expect(feedbackDeliveryMessage("failed")).toContain("remains saved");
    expect(feedbackDeliveryMessage("sent")).toBe("Feedback emailed to support successfully.");
  });
});
