"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import AppImg from "@/components/AppImg";
import {
  getRichNoteEditorValue,
  handleRichNotePaste,
  handleRichNoteToolbarClick,
  handleRichNoteToolbarStateEvent,
  richNoteToolbarHtml,
  setRichNoteEditorValue,
  syncRichNoteToolbarStates,
} from "../client/rich-session-notes";
import {
  deleteHoldingSpaceAttachment,
  loadHoldingSpaceDocument,
  normalizeHoldingSpaceDocument,
  saveHoldingSpaceDocument,
  uploadHoldingSpaceFile,
  validateHoldingSpaceFile,
  type HoldingSpaceDocument,
} from "../lib/holdingSpace";

type HoldingSpacePageContentProps = {
  active: boolean;
};

type SaveState = "idle" | "loading" | "saving" | "saved" | "error";

const EDITOR_ID = "holdingSpaceEditor";
const AUTOSAVE_DELAY_MS = 800;

function formatFileSize(bytes: number) {
  const safeBytes = Math.max(0, Math.floor(Number(bytes || 0) || 0));
  if (safeBytes < 1024) return `${safeBytes} B`;
  const kb = safeBytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function statusText(state: SaveState, error: string) {
  if (state === "loading") return "Loading...";
  if (state === "saving") return "Saving...";
  if (state === "saved") return "Saved";
  if (state === "error") return error || "Could not save";
  return "";
}

export default function HoldingSpacePageContent({ active }: HoldingSpacePageContentProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const loadedRef = useRef(false);
  const docRef = useRef<HoldingSpaceDocument>(normalizeHoldingSpaceDocument(null));
  const [docState, setDocState] = useState<HoldingSpaceDocument>(() => normalizeHoldingSpaceDocument(null));
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [error, setError] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const toolbarHtml = useMemo(() => richNoteToolbarHtml(EDITOR_ID), []);

  const applyDoc = useCallback((nextDoc: HoldingSpaceDocument) => {
    docRef.current = nextDoc;
    setDocState(nextDoc);
    setRichNoteEditorValue(editorRef.current, nextDoc.contentHtml);
    syncRichNoteToolbarStates();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadHoldingSpaceDocument()
      .then((loadedDoc) => {
        if (cancelled) return;
        loadedRef.current = true;
        applyDoc(loadedDoc);
        setSaveState("saved");
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        loadedRef.current = true;
        setError(loadError instanceof Error ? loadError.message : "Could not load Holding Space.");
        setSaveState("error");
      });
    return () => {
      cancelled = true;
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    };
  }, [applyDoc]);

  useEffect(() => {
    const root = editorRef.current?.closest("#appPageHoldingSpace");
    if (!root) return;
    root.addEventListener("click", handleRichNoteToolbarClick);
    root.addEventListener("paste", handleRichNotePaste as EventListener);
    root.addEventListener("keyup", handleRichNoteToolbarStateEvent);
    root.addEventListener("mouseup", handleRichNoteToolbarStateEvent);
    root.addEventListener("focusin", handleRichNoteToolbarStateEvent);
    return () => {
      root.removeEventListener("click", handleRichNoteToolbarClick);
      root.removeEventListener("paste", handleRichNotePaste as EventListener);
      root.removeEventListener("keyup", handleRichNoteToolbarStateEvent);
      root.removeEventListener("mouseup", handleRichNoteToolbarStateEvent);
      root.removeEventListener("focusin", handleRichNoteToolbarStateEvent);
    };
  }, []);

  const saveEditorContent = useCallback(async () => {
    if (!loadedRef.current) return;
    const contentHtml = getRichNoteEditorValue(editorRef.current);
    const previousDoc = docRef.current;
    const nextDoc = normalizeHoldingSpaceDocument({
      ...previousDoc,
      contentHtml,
      updatedAtMs: Date.now(),
    });
    docRef.current = nextDoc;
    setDocState(nextDoc);
    setSaveState("saving");
    setError("");
    try {
      const saved = await saveHoldingSpaceDocument(nextDoc);
      docRef.current = saved;
      setDocState(saved);
      setSaveState("saved");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not save Holding Space.");
      setSaveState("error");
    }
  }, [applyDoc]);

  const scheduleAutosave = useCallback(() => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveEditorContent();
    }, AUTOSAVE_DELAY_MS);
  }, [saveEditorContent]);

  const handleEditorInput = useCallback(() => {
    setSaveState("saving");
    scheduleAutosave();
  }, [scheduleAutosave]);

  const handleUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file || uploadBusy) return;
    const validation = validateHoldingSpaceFile(file);
    if (!validation.ok) {
      setError(validation.message);
      setSaveState("error");
      return;
    }
    setUploadBusy(true);
    setSaveState("saving");
    setError("");
    try {
      const currentDoc = normalizeHoldingSpaceDocument({
        ...docRef.current,
        contentHtml: getRichNoteEditorValue(editorRef.current),
      });
      const nextDoc = await uploadHoldingSpaceFile(file, currentDoc);
      applyDoc(nextDoc);
      setSaveState("saved");
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload file.");
      setSaveState("error");
    } finally {
      setUploadBusy(false);
    }
  }, [applyDoc, uploadBusy]);

  const handleDeleteAttachment = useCallback(async (attachmentId: string) => {
    if (!attachmentId) return;
    setSaveState("saving");
    setError("");
    try {
      const currentDoc = normalizeHoldingSpaceDocument({
        ...docRef.current,
        contentHtml: getRichNoteEditorValue(editorRef.current),
      });
      const nextDoc = await deleteHoldingSpaceAttachment(attachmentId, currentDoc);
      applyDoc(nextDoc);
      setSaveState("saved");
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete file.");
      setSaveState("error");
    }
  }, [applyDoc]);

  const currentStatus = statusText(saveState, error);

  return (
    <section className={`appPage${active ? " appPageOn" : ""}`} id="appPageHoldingSpace" aria-label="Holding Space page">
      <div className="holdingSpaceShell">
        <header className="holdingSpaceHeader">
          <div className="holdingSpaceTitleBlock">
            <h1 className="holdingSpaceTitle">Holding Space</h1>
            <p className="holdingSpaceDescription">A space to save notes, files, and ideas for later.</p>
          </div>
          <div className={`holdingSpaceSaveStatus${saveState === "error" ? " isError" : ""}`} role="status" aria-live="polite">
            {currentStatus}
          </div>
        </header>

        <section className="holdingSpaceNotebook" aria-label="Holding Space notebook">
          <div className="holdingSpaceEditorToolbar" dangerouslySetInnerHTML={{ __html: toolbarHtml }} />
          <div
            ref={editorRef}
            className="holdingSpaceEditor richNoteEditor"
            id={EDITOR_ID}
            role="textbox"
            aria-multiline="true"
            contentEditable
            data-rich-note-editor="true"
            data-placeholder="Capture notes, links, and ideas here..."
            suppressContentEditableWarning
            onInput={handleEditorInput}
          />
        </section>

        <section className="holdingSpaceAttachments" aria-label="Holding Space files">
          <div className="holdingSpaceAttachmentsHead">
            <div>
              <h2 className="holdingSpaceSectionTitle">Files</h2>
              <p className="holdingSpaceSectionNote">Images, PDFs, text, markdown, and common Office files up to 10 MB.</p>
            </div>
            <button className="btn btn-ghost small holdingSpaceUploadBtn" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadBusy}>
              <AppImg className="holdingSpaceUploadIcon" src="/file.svg" alt="" aria-hidden="true" />
              {uploadBusy ? "Uploading" : "Add File"}
            </button>
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              onChange={handleUpload}
              accept="image/*,.pdf,.txt,.md,.markdown,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            />
          </div>

          {docState.attachments.length ? (
            <div className="holdingSpaceAttachmentList">
              {docState.attachments.map((attachment) => (
                <article className="holdingSpaceAttachment" key={attachment.id}>
                  <AppImg className="holdingSpaceAttachmentIcon" src="/file.svg" alt="" aria-hidden="true" />
                  <div className="holdingSpaceAttachmentMeta">
                    <a className="holdingSpaceAttachmentName" href={attachment.downloadUrl || "#"} target="_blank" rel="noopener noreferrer">
                      {attachment.name}
                    </a>
                    <span className="holdingSpaceAttachmentDetail">
                      {formatFileSize(attachment.size)}
                      {attachment.contentType ? ` · ${attachment.contentType}` : ""}
                    </span>
                  </div>
                  <button
                    className="iconBtn holdingSpaceAttachmentDelete"
                    type="button"
                    aria-label={`Delete ${attachment.name}`}
                    title="Delete file"
                    onClick={() => void handleDeleteAttachment(attachment.id)}
                  >
                    <AppImg className="holdingSpaceAttachmentDeleteIcon" src="/icons/icons_default/trash.png" alt="" aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="holdingSpaceEmptyFiles">No files saved yet.</div>
          )}
        </section>
      </div>
    </section>
  );
}
