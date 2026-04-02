"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";

import {
  createFeedbackItem,
  subscribeToFeedbackItems,
  toggleFeedbackUpvote,
  type FeedbackItem,
  type FeedbackStatus,
  type FeedbackType,
} from "../lib/feedbackStore";
import DesktopAppRail from "./DesktopAppRail";
import SignedInHeaderBadge from "./SignedInHeaderBadge";

export default function FeedbackScreen() {
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackAnonymous, setFeedbackAnonymous] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType | "">("");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackDetails, setFeedbackDetails] = useState("");
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[] | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [voteBusyById, setVoteBusyById] = useState<Record<string, boolean>>({});
  const [viewerUid, setViewerUid] = useState("");
  const [viewerDisplayName, setViewerDisplayName] = useState("");
  const [viewerRankThumbnailSrc, setViewerRankThumbnailSrc] = useState<string | null>(null);
  const [viewerCurrentRankId, setViewerCurrentRankId] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
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
    });
    return () => unsub();
  }, [feedbackAnonymous]);

  useEffect(() => {
    const unsubscribe = subscribeToFeedbackItems(
      { viewerUid },
      (items) => {
        setFeedbackItems(items);
        setFeedbackError("");
      },
      (message) => {
        setFeedbackError(message);
        setFeedbackItems((prev) => prev ?? []);
      }
    );
    return () => unsubscribe();
  }, [viewerUid]);

  const handleBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/tasktimer");
  }, []);

  const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
  const canSubmitFeedback =
    !feedbackSubmitting &&
    !!viewerUid &&
    (feedbackAnonymous || isValidFeedbackEmail) &&
    !!feedbackType &&
    feedbackTitle.trim().length > 0 &&
    feedbackDetails.trim().length > 0;

  const sortedFeedbackItems = useMemo(() => {
    const statusWeight: Record<FeedbackStatus, number> = {
      open: 0,
      planned: 1,
      in_progress: 2,
      shipped: 3,
      closed: 4,
    };
    return [...(feedbackItems ?? [])].sort((a, b) => {
      const statusDiff = (statusWeight[a.status] ?? 99) - (statusWeight[b.status] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      if (b.upvoteCount !== a.upvoteCount) return b.upvoteCount - a.upvoteCount;
      const aLast = a.lastActivityAt?.toMillis?.() || a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const bLast = b.lastActivityAt?.toMillis?.() || b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      return bLast - aLast;
    });
  }, [feedbackItems]);

  const feedbackLoading = feedbackItems === null;

  const handleSubmitFeedback = useCallback(async () => {
    if (!canSubmitFeedback) return;
    setFeedbackError("");
    setFeedbackStatus("");
    setFeedbackSubmitting(true);
    const result = await createFeedbackItem({
      ownerUid: viewerUid,
      authorDisplayName: viewerDisplayName || null,
      authorEmail: feedbackAnonymous ? null : feedbackEmail.trim(),
      authorRankThumbnailSrc: viewerRankThumbnailSrc,
      authorCurrentRankId: viewerCurrentRankId,
      isAnonymous: feedbackAnonymous,
      type: feedbackType as FeedbackType,
      title: feedbackTitle,
      details: feedbackDetails,
    });
    setFeedbackSubmitting(false);
    if (!result.ok) {
      setFeedbackError(result.message);
      return;
    }
    setFeedbackType("");
    setFeedbackTitle("");
    setFeedbackDetails("");
    setFeedbackStatus("Feedback submitted successfully.");
  }, [
    canSubmitFeedback,
    feedbackAnonymous,
    feedbackDetails,
    feedbackEmail,
    feedbackTitle,
    feedbackType,
    viewerCurrentRankId,
    viewerDisplayName,
    viewerRankThumbnailSrc,
    viewerUid,
  ]);

  const handleToggleVote = useCallback(
    async (feedbackId: string) => {
      if (!viewerUid || voteBusyById[feedbackId]) return;
      setFeedbackError("");
      setVoteBusyById((prev) => ({ ...prev, [feedbackId]: true }));
      const result = await toggleFeedbackUpvote(feedbackId, viewerUid);
      setVoteBusyById((prev) => {
        const next = { ...prev };
        delete next[feedbackId];
        return next;
      });
      if (!result.ok) setFeedbackError(result.message);
    },
    [viewerUid, voteBusyById]
  );

  const getFeedbackTypeLabel = useCallback((type: FeedbackType) => {
    if (type === "bug") return "Bug";
    if (type === "feature") return "Feature";
    return "General";
  }, []);

  const getFeedbackStatusLabel = useCallback((status: FeedbackStatus) => {
    if (status === "in_progress") return "In Progress";
    if (status === "planned") return "Planned";
    if (status === "shipped") return "Shipped";
    if (status === "closed") return "Closed";
    return "Open";
  }, []);

  const getFeedbackAuthorLabel = useCallback((item: FeedbackItem) => {
    if (item.isAnonymous) return "Anonymous user";
    return item.authorDisplayName || item.authorEmail || "TaskTimer user";
  }, []);

  const formatFeedbackDate = useCallback((item: FeedbackItem) => {
    const createdAtMs = item.createdAt?.toMillis?.() || item.updatedAt?.toMillis?.() || item.lastActivityAt?.toMillis?.() || 0;
    if (!createdAtMs) return "Just now";
    try {
      return new Date(createdAtMs).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Just now";
    }
  }, []);

  return (
    <div className="wrap" id="app" aria-label="TaskLaunch Feedback">
      <div className="topbar" aria-label="TaskLaunch header">
        <div className="brand">
          <AppImg className="brandLogo" src="/logo/tasklaunch-logo-v2.png" alt="TaskLaunch" />
        </div>
        <SignedInHeaderBadge />
      </div>
      <div className="desktopAppShell">
        <DesktopAppRail activePage="none" useClientNavButtons={false} showMobileFooter={false} />
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

                  {feedbackStatus ? (
                    <div className="settingsDetailNote" aria-live="polite">
                      {feedbackStatus}
                    </div>
                  ) : null}
                  {feedbackError ? (
                    <div className="settingsDetailNote settingsDetailNoteWarn" aria-live="polite">
                      {feedbackError}
                    </div>
                  ) : null}

                  <div className="feedbackFormActions">
                    <button className="btn btn-ghost small settingsFeedbackUploadBtn" type="button" disabled>
                      Upload Screenshot
                    </button>
                    <button className="btn btn-accent small" id="feedbackBtn" type="button" disabled={!canSubmitFeedback} onClick={handleSubmitFeedback}>
                      {feedbackSubmitting ? "Submitting..." : "Submit Feedback"}
                    </button>
                  </div>
                </section>

                <section className="dashboardCard feedbackFormCard" aria-label="Shared feedback board">
                  <div className="feedbackFormHead">
                    <div className="feedbackFormHeadCopy">
                      <div className="dashboardCardTitle feedbackFormTitle">Shared Feedback Board</div>
                      <p className="modalSubtext feedbackFormSubtext">Browse existing issues, enhancements, and suggestions from other users.</p>
                    </div>
                  </div>

                  {feedbackLoading ? <div className="settingsDetailNote">Loading feedback...</div> : null}
                  {!feedbackLoading && !sortedFeedbackItems.length ? (
                    <div className="settingsDetailNote">No feedback has been submitted yet.</div>
                  ) : null}

                  {sortedFeedbackItems.length ? (
                    <div className="feedbackBoardList" aria-live="polite">
                      {sortedFeedbackItems.map((item) => {
                        const voteBusy = !!voteBusyById[item.feedbackId];
                        return (
                          <article key={item.feedbackId} className="feedbackBoardItem">
                            <div className="feedbackBoardItemTop">
                              <div className="feedbackBoardBadges">
                                <span className={`feedbackBoardBadge feedbackBoardBadgeType feedbackBoardBadgeType-${item.type}`}>
                                  {getFeedbackTypeLabel(item.type)}
                                </span>
                                <span className={`feedbackBoardBadge feedbackBoardBadgeStatus feedbackBoardBadgeStatus-${item.status}`}>
                                  {getFeedbackStatusLabel(item.status)}
                                </span>
                              </div>
                              <button
                                className={`btn btn-ghost small feedbackBoardVoteBtn${item.viewerHasUpvoted ? " isOn" : ""}`}
                                type="button"
                                disabled={voteBusy || !viewerUid}
                                aria-pressed={item.viewerHasUpvoted ? "true" : "false"}
                                onClick={() => handleToggleVote(item.feedbackId)}
                              >
                                {item.viewerHasUpvoted ? "Upvoted" : "Upvote"} ({item.upvoteCount})
                              </button>
                            </div>
                            <h3 className="dashboardCardTitle feedbackBoardTitle">{item.title}</h3>
                            <p className="settingsDetailText feedbackBoardDetails">{item.details}</p>
                            <div className="feedbackBoardMeta">
                              <span>{getFeedbackAuthorLabel(item)}</span>
                              <span>{formatFeedbackDate(item)}</span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
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
