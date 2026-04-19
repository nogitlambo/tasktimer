"use client";
import { useCallback, useEffect, useState, type ClipboardEvent } from "react";
import { onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";

import { createFeedbackItem, type FeedbackAttachmentUploadInput, type FeedbackType } from "../lib/feedbackStore";
import { resolveTaskTimerRouteHref } from "../lib/routeHref";
import DesktopAppRail from "./DesktopAppRail";

const FEEDBACK_ATTACHMENT_MAX_DIMENSION = 1600;

type FeedbackAttachmentDraft = FeedbackAttachmentUploadInput & {
  id: string;
};

function formatAttachmentSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function resizeClipboardImageToPng(file: File): Promise<FeedbackAttachmentUploadInput> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The pasted image could not be loaded."));
      img.src = imageUrl;
    });
    const sourceWidth = Math.max(1, Math.floor(image.naturalWidth || image.width || 0));
    const sourceHeight = Math.max(1, Math.floor(image.naturalHeight || image.height || 0));
    const scale = Math.min(1, FEEDBACK_ATTACHMENT_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error("The pasted image could not be converted to PNG."));
      }, "image/png");
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `feedback-screenshot-${timestamp}.png`;
    return {
      filename,
      file: new File([blob], filename, { type: "image/png" }),
      mimeType: "image/png",
      sizeBytes: blob.size,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export default function FeedbackScreen() {
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackAnonymous, setFeedbackAnonymous] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType | "">("");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackDetails, setFeedbackDetails] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackAttachmentDrafts, setFeedbackAttachmentDrafts] = useState<FeedbackAttachmentDraft[]>([]);
  const [feedbackAttachmentBusy, setFeedbackAttachmentBusy] = useState(false);
  const [viewerUid, setViewerUid] = useState("");
  const [viewerDisplayName, setViewerDisplayName] = useState("");
  const [viewerRankThumbnailSrc, setViewerRankThumbnailSrc] = useState<string | null>(null);
  const [viewerCurrentRankId, setViewerCurrentRankId] = useState<string | null>(null);

  const resolveAuthSession = useCallback(async (): Promise<{ auth: Auth; user: User; idToken: string } | null> => {
    const auth = getFirebaseAuthClient();
    if (!auth) return null;
    const authWithReady = auth as Auth & { authStateReady?: () => Promise<void> };
    if (typeof authWithReady.authStateReady === "function") {
      try {
        await authWithReady.authStateReady();
      } catch {
        // ignore and continue with current auth state
      }
    }
    let user = auth.currentUser;
    if (!user) {
      user = await new Promise<User | null>((resolve) => {
        let settled = false;
        const finish = (nextUser: User | null) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          unsubscribe();
          resolve(nextUser);
        };
        const timeoutId = window.setTimeout(() => finish(auth.currentUser), 1500);
        const unsubscribe = onAuthStateChanged(auth, (nextUser) => finish(nextUser || null));
      });
    }
    if (!user) return null;
    const idToken = await user.getIdToken();
    if (!idToken) return null;
    return { auth, user, idToken };
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const syncViewerFromUser = (user: { uid?: string | null; email?: string | null; displayName?: string | null } | null) => {
      const nextEmail = user?.email || null;
      const nextUid = String(user?.uid || "").trim();
      setViewerUid(nextUid);
      setViewerDisplayName(String(user?.displayName || "").trim());
      setFeedbackEmail((prev) => {
        if (feedbackAnonymous) return prev;
        return prev.trim() ? prev : nextEmail || "";
      });
      if (!nextUid) {
        setViewerRankThumbnailSrc(null);
        setViewerCurrentRankId(null);
        return;
      }
      const db = getFirebaseFirestoreClient();
      if (!db) return;
      void getDoc(doc(db, "users", nextUid))
        .then((snap) => {
          if (!snap.exists()) {
            setViewerRankThumbnailSrc(null);
            setViewerCurrentRankId(null);
            return;
          }
          setViewerRankThumbnailSrc(String(snap.get("rankThumbnailSrc") || "").trim() || null);
          setViewerCurrentRankId(String(snap.get("rewardCurrentRankId") || "").trim() || null);
          const storedName = String(snap.get("displayName") || "").trim();
          if (storedName) setViewerDisplayName(storedName);
        })
        .catch(() => {});
    };
    syncViewerFromUser(auth.currentUser);
    const unsub = onAuthStateChanged(auth, (user) => {
      syncViewerFromUser(user);
    });
    return () => unsub();
  }, [feedbackAnonymous]);

  const handleBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign(resolveTaskTimerRouteHref("/tasklaunch"));
  }, []);

  const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
  const getFeedbackValidationMessage = useCallback(() => {
    const effectiveViewerUid = String(getFirebaseAuthClient()?.currentUser?.uid || viewerUid).trim();
    if (!effectiveViewerUid) return "You must be signed in to submit feedback.";
    if (feedbackAttachmentBusy) return "Please wait for pasted screenshots to finish processing.";
    if (!feedbackAnonymous && !feedbackEmail.trim()) return "Email address is required unless you log feedback as anonymous.";
    if (!feedbackAnonymous && !isValidFeedbackEmail) return "Enter a valid email address or log feedback as anonymous.";
    if (!feedbackType) return "Select a feedback type before submitting.";
    if (!feedbackTitle.trim()) return "Enter a feedback title before submitting.";
    if (!feedbackDetails.trim()) return "Enter feedback details before submitting.";
    return "";
  }, [feedbackAnonymous, feedbackAttachmentBusy, feedbackDetails, feedbackEmail, feedbackTitle, feedbackType, isValidFeedbackEmail, viewerUid]);

  const handleSubmitFeedback = useCallback(async () => {
    const validationMessage = getFeedbackValidationMessage();
    if (validationMessage) {
      setFeedbackStatus("");
      setFeedbackError(validationMessage);
      return;
    }
    if (feedbackSubmitting || feedbackAttachmentBusy) return;
    setFeedbackError("");
    setFeedbackStatus("");
    setFeedbackSubmitting(true);
    let session: Awaited<ReturnType<typeof resolveAuthSession>> = null;
    try {
      session = await resolveAuthSession();
    } catch {
      session = null;
    }
    const currentUser = session?.user || null;
    const effectiveViewerUid = String(currentUser?.uid || viewerUid).trim();
    const effectiveViewerDisplayName = String(currentUser?.displayName || viewerDisplayName).trim();
    const effectiveViewerEmail = feedbackAnonymous ? null : String(currentUser?.email || feedbackEmail).trim() || null;
    if (!currentUser || !session?.idToken || !effectiveViewerUid) {
      setFeedbackSubmitting(false);
      setFeedbackError("You must be signed in to submit feedback.");
      return;
    }
    const saved = await createFeedbackItem({
      authToken: session.idToken,
      ownerUid: effectiveViewerUid,
      authorDisplayName: effectiveViewerDisplayName || null,
      authorEmail: effectiveViewerEmail,
      authorRankThumbnailSrc: viewerRankThumbnailSrc,
      authorCurrentRankId: viewerCurrentRankId,
      isAnonymous: feedbackAnonymous,
      type: feedbackType as FeedbackType,
      title: feedbackTitle,
      details: feedbackDetails,
      attachments: feedbackAttachmentDrafts,
    });
    setFeedbackSubmitting(false);
    if (!saved.ok) {
      setFeedbackError(saved.message);
      return;
    }
    setFeedbackType("");
    setFeedbackTitle("");
    setFeedbackDetails("");
    setFeedbackAttachmentDrafts([]);
    setFeedbackStatus("Feedback submitted successfully.");
  }, [
    feedbackAnonymous,
    feedbackDetails,
    feedbackEmail,
    feedbackAttachmentDrafts,
    feedbackAttachmentBusy,
    feedbackSubmitting,
    feedbackTitle,
    feedbackType,
    getFeedbackValidationMessage,
    resolveAuthSession,
    viewerCurrentRankId,
    viewerDisplayName,
    viewerRankThumbnailSrc,
    viewerUid,
  ]);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setFeedbackAttachmentDrafts((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  const handleDetailsPaste = useCallback(async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItems.length) return;
    event.preventDefault();
    setFeedbackError("");
    setFeedbackStatus("");
    setFeedbackAttachmentBusy(true);
    try {
      const nextAttachments = await Promise.all(
        imageItems.map(async (item, index) => {
          const file = item.getAsFile();
          if (!file) throw new Error("A pasted screenshot could not be read.");
          const resized = await resizeClipboardImageToPng(file);
          return {
            id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 10)}`,
            ...resized,
          } satisfies FeedbackAttachmentDraft;
        })
      );
      setFeedbackAttachmentDrafts((prev) => [...prev, ...nextAttachments]);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "The pasted screenshot could not be added.";
      setFeedbackError(message);
    } finally {
      setFeedbackAttachmentBusy(false);
    }
  }, []);

  return (
    <div className="wrap" id="app" aria-label="TaskLaunch Feedback">
      <div className="topbar topbarBrandOnly" aria-label="TaskLaunch header">
        <div className="brand">
          <AppImg className="brandLogo" src="/logo/tasklaunch-logo-v2.png" alt="TaskLaunch" />
        </div>
      </div>
      <div className="desktopAppShell">
        <DesktopAppRail activePage="none" useClientNavButtons={false} showMobileFooter />
        <div className="desktopAppMain">
          <div className="dashboardNeonLayout feedbackPageLayout">
            <div className="dashboardMain feedbackPageMain">
              <div className="dashboardShell feedbackPageShell">
                <div className="dashboardTopRow feedbackPageTopRow">
                  <div className="dashboardTitleWrap">
                    <p className="dashboardKicker">Feedback</p>
                  </div>
                  <div className="feedbackPageActions">
                    <button className="btn btn-ghost small feedbackBackBtn" type="button" onClick={handleBack}>
                      Back
                    </button>
                  </div>
                </div>

                <section className="dashboardCard feedbackFormCard" aria-label="Feedback form">
                  <div className="feedbackFormHead">
                    <AppImg className="feedbackFormIcon" src="/Feedback.svg" alt="" aria-hidden="true" />
                    <div className="feedbackFormHeadCopy">
                      <div className="dashboardCardTitle feedbackFormTitle">Feedback Form</div>
                      <p className="modalSubtext feedbackFormSubtext">Share product feedback, bug reports, and feature ideas.</p>
                    </div>
                  </div>

                  <div className={`field feedbackFormField${feedbackAnonymous ? " isDisabled" : ""}`}>
                    <label className={feedbackAnonymous ? "isDisabled" : undefined} htmlFor="feedbackEmailInput">
                      {feedbackAnonymous ? "Email Address (anonymous)" : "Email Address"}
                    </label>
                    <input
                      id="feedbackEmailInput"
                      type="email"
                      placeholder="name@example.com"
                      autoComplete="email"
                      value={feedbackEmail}
                      disabled={feedbackAnonymous}
                      onChange={(e) => setFeedbackEmail(e.target.value)}
                    />
                  </div>

                  <label className="chkRow feedbackFormAnonymousRow">
                    <input type="checkbox" checked={feedbackAnonymous} onChange={(e) => setFeedbackAnonymous(e.target.checked)} />
                    <span>Log as anonymous</span>
                  </label>

                  <div className="field feedbackFormField">
                    <label htmlFor="feedbackTypeSelect">Feedback Type</label>
                    <select
                      id="feedbackTypeSelect"
                      className={!feedbackType ? "isPlaceholderValue" : undefined}
                      value={feedbackType}
                      onChange={(e) => setFeedbackType(e.target.value as FeedbackType | "")}
                    >
                      <option value="" disabled>
                        --Please Select--
                      </option>
                      <option value="bug">Report a bug</option>
                      <option value="general">General feedback</option>
                      <option value="feature">Request a feature/enhancement</option>
                    </select>
                  </div>

                  <div className="field feedbackFormField">
                    <label htmlFor="feedbackTitleInput">Title</label>
                    <input
                      id="feedbackTitleInput"
                      type="text"
                      maxLength={160}
                      placeholder="Short summary of the issue or idea"
                      value={feedbackTitle}
                      onChange={(e) => setFeedbackTitle(e.target.value)}
                    />
                  </div>

                  <div className="field feedbackFormField">
                    <label htmlFor="feedbackDetailsInput">Details</label>
                    <textarea
                      id="feedbackDetailsInput"
                      rows={8}
                      placeholder="Please provide steps to reproduce or what you would like improved. Screenshots can be pasted here."
                      value={feedbackDetails}
                      onChange={(e) => setFeedbackDetails(e.target.value)}
                      onPaste={handleDetailsPaste}
                    />
                  </div>

                  {feedbackAttachmentDrafts.length ? (
                    <div className="feedbackAttachmentList" aria-label="Pasted screenshots">
                      {feedbackAttachmentDrafts.map((attachment) => (
                        <div className="feedbackAttachmentItem" key={attachment.id}>
                          <div className="feedbackAttachmentMeta">
                            <span className="feedbackAttachmentName">{attachment.filename}</span>
                            <span className="feedbackAttachmentDetails">
                              {attachment.width}x{attachment.height} | {formatAttachmentSize(attachment.sizeBytes)}
                            </span>
                          </div>
                          <button
                            className="btn btn-ghost small feedbackAttachmentRemoveBtn"
                            type="button"
                            disabled={feedbackSubmitting || feedbackAttachmentBusy}
                            onClick={() => handleRemoveAttachment(attachment.id)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {feedbackStatus || feedbackError ? (
                    <div className={`settingsDetailNote${feedbackError ? " feedbackErrorNote" : " feedbackSuccessNote"}`} aria-live="polite">
                      {feedbackError || feedbackStatus}
                    </div>
                  ) : null}

                  {feedbackSubmitting ? (
                    <div className="feedbackSubmitBusy" role="status" aria-live="polite" aria-atomic="true">
                      <p className="modalSubtext confirmText">Submitting feedback...</p>
                      <div className="dashboardRefreshBusyArrowStage feedbackSubmitBusyArrowStage" aria-hidden="true">
                        <div className="dashboardRefreshBusyArrowShell feedbackSubmitBusyArrowShell">
                          <div className="dashboardRefreshBusyArrowBeamBlend" />
                          <AppImg className="dashboardRefreshBusyArrowGraphic feedbackSubmitBusyArrowGraphic" src="/logo/launch-icon-original-transparent.png" alt="" />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="feedbackFormActions">
                    <button className="btn btn-accent small" id="feedbackBtn" type="button" disabled={feedbackSubmitting || feedbackAttachmentBusy} onClick={handleSubmitFeedback}>
                      {feedbackSubmitting ? "Submitting..." : "Submit Feedback"}
                    </button>
                  </div>
                </section>

              </div>
            </div>
          </div>
          <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
        </div>
      </div>
    </div>
  );
}
