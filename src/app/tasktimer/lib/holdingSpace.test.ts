import { describe, expect, it } from "vitest";

import {
  HOLDING_SPACE_MAX_FILE_BYTES,
  normalizeHoldingSpaceDocument,
  validateHoldingSpaceFile,
} from "./holdingSpace";

describe("Holding Space persistence helpers", () => {
  it("sanitizes rich content and normalizes attachment metadata", () => {
    const doc = normalizeHoldingSpaceDocument({
      contentHtml: '<p>Keep this</p><script>alert("no")</script>',
      attachments: [
        {
          id: "file-1",
          name: "report.pdf",
          contentType: "application/pdf",
          size: 2048,
          storagePath: "users/uid/holding-space/file-1/report.pdf",
          downloadUrl: "https://example.test/report.pdf",
          createdAtMs: 5,
        },
        { id: "", name: "bad.txt", storagePath: "" },
      ],
      updatedAtMs: 10,
    });

    expect(doc.contentHtml).toBe("<p>Keep this</p>");
    expect(doc.attachments).toHaveLength(1);
    expect(doc.attachments[0]).toEqual(
      expect.objectContaining({
        id: "file-1",
        name: "report.pdf",
        contentType: "application/pdf",
        size: 2048,
      })
    );
  });

  it("validates supported files and rejects unsupported or oversized uploads", () => {
    expect(validateHoldingSpaceFile({ name: "idea.md", size: 20, type: "application/octet-stream" }).ok).toBe(true);
    expect(validateHoldingSpaceFile({ name: "photo.png", size: 20, type: "image/png" }).ok).toBe(true);
    expect(validateHoldingSpaceFile({ name: "archive.zip", size: 20, type: "application/zip" })).toEqual({
      ok: false,
      message: "Unsupported file type.",
    });
    expect(validateHoldingSpaceFile({ name: "large.pdf", size: HOLDING_SPACE_MAX_FILE_BYTES + 1, type: "application/pdf" })).toEqual({
      ok: false,
      message: "Files must be 10 MB or smaller.",
    });
  });
});
