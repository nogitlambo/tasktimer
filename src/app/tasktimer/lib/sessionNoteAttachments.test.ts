import { describe, expect, it } from "vitest";

import {
  SESSION_NOTE_MAX_FILE_BYTES,
  cleanSessionNoteAttachmentFileName,
  normalizeSessionNoteAttachments,
  validateSessionNoteAttachmentFile,
} from "./sessionNoteAttachments";

describe("session note attachments", () => {
  it("normalizes metadata and removes invalid attachment rows", () => {
    const attachments = normalizeSessionNoteAttachments([
      {
        id: "file-1",
        name: "report.pdf",
        contentType: "application/pdf",
        size: 2048,
        storagePath: "users/uid/session-notes/file-1/report.pdf",
        downloadUrl: "https://example.test/report.pdf",
        createdAtMs: 5,
      },
      { id: "", name: "bad.txt", storagePath: "" },
    ]);

    expect(attachments).toEqual([
      expect.objectContaining({
        id: "file-1",
        name: "report.pdf",
        contentType: "application/pdf",
        size: 2048,
      }),
    ]);
  });

  it("uses Holding Space upload validation limits", () => {
    expect(validateSessionNoteAttachmentFile({ name: "idea.md", size: 20, type: "application/octet-stream" }).ok).toBe(true);
    expect(validateSessionNoteAttachmentFile({ name: "photo.png", size: 20, type: "image/png" }).ok).toBe(true);
    expect(validateSessionNoteAttachmentFile({ name: "archive.zip", size: 20, type: "application/zip" })).toEqual({
      ok: false,
      message: "Unsupported file type.",
    });
    expect(validateSessionNoteAttachmentFile({ name: "large.pdf", size: SESSION_NOTE_MAX_FILE_BYTES + 1, type: "application/pdf" })).toEqual({
      ok: false,
      message: "Files must be 10 MB or smaller.",
    });
  });

  it("cleans unsafe file name characters", () => {
    expect(cleanSessionNoteAttachmentFileName('bad/:*?"<>|#%{}^~[]`.txt')).toBe("bad-----------------.txt");
  });
});
