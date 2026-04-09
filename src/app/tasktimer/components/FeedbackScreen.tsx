"use client";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";

import { createFeedbackItem, type FeedbackType } from "../lib/feedbackStore";
import DesktopAppRail from "./DesktopAppRail";
import SignedInHeaderBadge from "./SignedInHeaderBadge";

export default function FeedbackScreen() {
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackAnonymous, setFeedbackAnonymous] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType | "">("");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackDetails, setFeedbackDetails] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
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
    window.location.assign("/tasklaunch");
  }, []);

  const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
  const getFeedbackValidationMessage = useCallback(() => {
    const effectiveViewerUid = String(getFirebaseAuthClient()?.currentUser?.uid || viewerUid).trim();
    if (!effectiveViewerUid) return "You must be signed in to submit feedback.";
    if (!feedbackAnonymous && !feedbackEmail.trim()) return "Email address is required unless you log feedback as anonymous.";
    if (!feedbackAnonymous && !isValidFeedbackEmail) return "Enter a valid email address or log feedback as anonymous.";
    if (!feedbackType) return "Select a feedback type before submitting.";
    if (!feedbackTitle.trim()) return "Enter a feedback title before submitting.";
    if (!feedbackDetails.trim()) return "Enter feedback details before submitting.";
    return "";
  }, [feedbackAnonymous, feedbackDetails, feedbackEmail, feedbackTitle, feedbackType, isValidFeedbackEmail, viewerUid]);

  const handleSubmitFeedback = useCallback(async () => {
    const validationMessage = getFeedbackValidationMessage();
    if (validationMessage) {
      setFeedbackStatus("");
      setFeedbackError(validationMessage);
      return;
    }
    if (feedbackSubmitting) return;
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
    });
    setFeedbackSubmitting(false);
    if (!saved.ok) {
      setFeedbackError(saved.message);
      return;
    }
    setFeedbackType("");
    setFeedbackTitle("");
    setFeedbackDetails("");
    setFeedbackStatus("Feedback submitted successfully.");
  }, [
    feedbackAnonymous,
    feedbackDetails,
    feedbackEmail,
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

  return (
    <div className="wrap" id="app" aria-label="TaskLaunch Feedback">
      <div className="topbar" aria-label="TaskLaunch header">
        <div className="brand">
          <AppImg className="brandLogo" src="/logo/tasklaunch-logo-v2.png" alt="TaskLaunch" />
        </div>
        <SignedInHeaderBadge />
      </div>
      <div className="desktopAppShell">
        <DesktopAppRail activePage="none" useClientNavButtons={false} showMobileFooter />
        <div className="desktopAppMain">
          <div className="dashboardNeonLayout feedbackPageLayout">
            <div className="dashboardMain feedbackPageMain">
              <div className="dashboardShell feedbackPageShell">
                <div className="dashboardTopRow feedbackPageTopRow">
                  <div className="dashboardTitleWrap">
                    <p className="dashboardKicker">Support</p>
                    <h2 className="dashboardTitle">Feedback</h2>
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
                    <select id="feedbackTypeSelect" value={feedbackType} onChange={(e) => setFeedbackType(e.target.value as FeedbackType | "")}>
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
                      placeholder="Share details, steps to reproduce, or what you would like improved."
                      value={feedbackDetails}
                      onChange={(e) => setFeedbackDetails(e.target.value)}
                    />
                  </div>

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
                          <AppImg className="dashboardRefreshBusyArrowGraphic feedbackSubmitBusyArrowGraphic" src="/logo/launch-icon.png" alt="" />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="feedbackFormActions">
                    <button className="btn btn-ghost small settingsFeedbackUploadBtn" type="button" disabled>
                      Upload Screenshot
                    </button>
                    <button className="btn btn-accent small" id="feedbackBtn" type="button" disabled={feedbackSubmitting} onClick={handleSubmitFeedback}>
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
