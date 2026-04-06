"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const jiraBoardViewerUid = "mWN9rMhO4xMq410c4E4VYyThw0x2";
  const [otherFilter, setOtherFilter] = useState<"all" | FeedbackType>("all");
  const [otherStatusFilter, setOtherStatusFilter] = useState<"all" | "open" | "in_progress" | "closed" | "shipped">("all");
  const [jiraStatusByIssueKey, setJiraStatusByIssueKey] = useState<Record<string, { name: string; category: string; categoryName: string }>>({});
  const otherFilterOptions: Array<{ value: "all" | FeedbackType; label: string }> = [
    { value: "all", label: "All" },
    { value: "bug", label: "Bugs" },
    { value: "feature", label: "Feature Request" },
    { value: "general", label: "General" },
  ];
  const otherStatusFilterOptions: Array<{ value: "all" | "open" | "in_progress" | "closed" | "shipped"; label: string }> = [
    { value: "all", label: "All" },
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "closed", label: "Won't Do" },
    { value: "shipped", label: "Done" },
  ];
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
  const [expandedFeedbackById, setExpandedFeedbackById] = useState<Record<string, boolean>>({});
  const lastJiraSubmissionRef = useRef<{ signature: string; jiraIssueKey: string | null; jiraIssueBrowseUrl: string | null } | null>(null);
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

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    const currentUser = auth?.currentUser;
    const jiraIssueKeys = Array.from(
      new Set(
        (feedbackItems ?? [])
          .map((item) => String(item.jiraIssueBrowseUrl || "").match(/\/browse\/([^/?#]+)/i)?.[1] || "")
          .map((key) => key.trim())
          .filter(Boolean)
      )
    );
    if (!currentUser || !jiraIssueKeys.length) {
      setJiraStatusByIssueKey({});
      return;
    }

    let cancelled = false;
    void currentUser
      .getIdToken()
      .then(async (idToken) => {
        const response = await fetch(`/api/jira/feedback?keys=${encodeURIComponent(jiraIssueKeys.join(","))}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const result = (await response.json().catch(() => null)) as
          | { statuses?: Record<string, { name?: string; category?: string; categoryName?: string }> }
          | null;
        if (cancelled || !response.ok) return;
        const nextStatuses: Record<string, { name: string; category: string; categoryName: string }> = {};
        Object.entries(result?.statuses || {}).forEach(([key, value]) => {
          const jiraKey = String(key || "").trim();
          if (!jiraKey) return;
          nextStatuses[jiraKey] = {
            name: String(value?.name || "").trim(),
            category: String(value?.category || "").trim().toLowerCase(),
            categoryName: String(value?.categoryName || "").trim().toLowerCase(),
          };
        });
        setJiraStatusByIssueKey(nextStatuses);
      })
      .catch(() => {
        if (!cancelled) setJiraStatusByIssueKey({});
      });

    return () => {
      cancelled = true;
    };
  }, [feedbackItems]);

  const handleBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/tasklaunch");
  }, []);

  const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
  const canSubmitFeedback =
    !!viewerUid &&
    (feedbackAnonymous || isValidFeedbackEmail) &&
    !!feedbackType &&
    feedbackTitle.trim().length > 0 &&
    feedbackDetails.trim().length > 0;

  const getFeedbackValidationMessage = useCallback(() => {
    if (!viewerUid) return "You must be signed in to submit feedback.";
    if (!feedbackAnonymous && !feedbackEmail.trim()) return "Email address is required unless you log feedback as anonymous.";
    if (!feedbackAnonymous && !isValidFeedbackEmail) return "Enter a valid email address or log feedback as anonymous.";
    if (!feedbackType) return "Select a feedback type before submitting.";
    if (!feedbackTitle.trim()) return "Enter a feedback title before submitting.";
    if (!feedbackDetails.trim()) return "Enter feedback details before submitting.";
    return "";
  }, [feedbackAnonymous, feedbackDetails, feedbackEmail, feedbackTitle, feedbackType, isValidFeedbackEmail, viewerUid]);

  const getFeedbackEffectiveStatus = useCallback(
    (item: FeedbackItem): FeedbackStatus => {
      const jiraIssueKey = String(item.jiraIssueBrowseUrl || "").match(/\/browse\/([^/?#]+)/i)?.[1] || "";
      const jiraStatus = jiraStatusByIssueKey[String(jiraIssueKey || "").trim()];
      if (!jiraStatus) return item.status;
      const name = jiraStatus.name.toLowerCase();
      const category = jiraStatus.category.toLowerCase();
      const categoryName = jiraStatus.categoryName.toLowerCase();
      if (/closed|cancelled|canceled|rejected|declined|duplicate|won't fix|wont fix|invalid/.test(name)) return "closed";
      if (/shipped|released|release|deployed|complete|completed|done|fixed|resolve|resolved|implemented|merged/.test(name)) return "shipped";
      if (/in progress|progress|implement|implementing|doing|active/.test(name)) return "in_progress";
      if (/planned|plan|backlog|selected|queued|next/.test(name)) return "planned";
      if (category === "done" || /done|complete|completed/.test(categoryName)) return "shipped";
      if (category === "indeterminate") return "in_progress";
      return item.status;
    },
    [jiraStatusByIssueKey]
  );

  const sortedFeedbackItems = useMemo(() => {
    const statusWeight: Record<FeedbackStatus, number> = {
      open: 0,
      planned: 1,
      in_progress: 2,
      shipped: 3,
      closed: 4,
    };
    return [...(feedbackItems ?? [])].sort((a, b) => {
      const statusDiff = (statusWeight[getFeedbackEffectiveStatus(a)] ?? 99) - (statusWeight[getFeedbackEffectiveStatus(b)] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      if (b.upvoteCount !== a.upvoteCount) return b.upvoteCount - a.upvoteCount;
      const aLast = a.lastActivityAt?.toMillis?.() || a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const bLast = b.lastActivityAt?.toMillis?.() || b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      return bLast - aLast;
    });
  }, [feedbackItems, getFeedbackEffectiveStatus]);

  const getFeedbackSortDateMs = useCallback((item: FeedbackItem) => {
    return item.lastActivityAt?.toMillis?.() || item.updatedAt?.toMillis?.() || item.createdAt?.toMillis?.() || 0;
  }, []);

  const upvotedItems = useMemo(() => {
    return [...sortedFeedbackItems]
      .filter((item) => !!item.viewerHasUpvoted)
      .sort((a, b) => {
        if (b.upvoteCount !== a.upvoteCount) return b.upvoteCount - a.upvoteCount;
        return getFeedbackSortDateMs(b) - getFeedbackSortDateMs(a);
      });
  }, [getFeedbackSortDateMs, sortedFeedbackItems]);

  const otherItems = useMemo(() => {
    return sortedFeedbackItems;
  }, [sortedFeedbackItems]);

  const filteredOtherItems = useMemo(() => {
    return otherItems.filter((item) => {
      const matchesType = otherFilter === "all" || item.type === otherFilter;
      if (!matchesType) return false;
      if (otherStatusFilter === "all") return true;
      const effectiveStatus = getFeedbackEffectiveStatus(item);
      if (otherStatusFilter === "open") return effectiveStatus === "open" || effectiveStatus === "planned";
      return effectiveStatus === otherStatusFilter;
    });
  }, [getFeedbackEffectiveStatus, otherFilter, otherItems, otherStatusFilter]);

  const feedbackLoading = feedbackItems === null;
  const canViewJiraLinks = viewerUid === jiraBoardViewerUid;

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
    const auth = getFirebaseAuthClient();
    const currentUser = auth?.currentUser;
    if (!currentUser || !viewerUid) {
      setFeedbackSubmitting(false);
      setFeedbackError("You must be signed in to submit feedback.");
      return;
    }
    let idToken = "";
    try {
      idToken = await currentUser.getIdToken();
    } catch {
      setFeedbackSubmitting(false);
      setFeedbackError("Could not verify your sign-in session. Please try again.");
      return;
    }
    const submissionSignature = JSON.stringify({
      ownerUid: viewerUid,
      authorEmail: feedbackAnonymous ? null : feedbackEmail.trim(),
      isAnonymous: feedbackAnonymous,
      type: feedbackType,
      title: feedbackTitle.trim(),
      details: feedbackDetails.trim(),
    });
    let jiraResult = lastJiraSubmissionRef.current?.signature === submissionSignature ? lastJiraSubmissionRef.current : null;
    if (!jiraResult) {
      const response = await fetch("/api/jira/feedback", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authorDisplayName: viewerDisplayName || null,
          authorEmail: feedbackAnonymous ? null : feedbackEmail.trim(),
          authorRankThumbnailSrc: viewerRankThumbnailSrc,
          authorCurrentRankId: viewerCurrentRankId,
          isAnonymous: feedbackAnonymous,
          type: feedbackType as FeedbackType,
          title: feedbackTitle,
          details: feedbackDetails,
        }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string; jiraIssueKey?: string; jiraIssueBrowseUrl?: string } | null;
      if (!response.ok) {
        setFeedbackSubmitting(false);
        setFeedbackError(result?.error || "Could not submit feedback.");
        return;
      }
      jiraResult = {
        signature: submissionSignature,
        jiraIssueKey: result?.jiraIssueKey || null,
        jiraIssueBrowseUrl: result?.jiraIssueBrowseUrl || null,
      };
      lastJiraSubmissionRef.current = jiraResult;
    }
    const saved = await createFeedbackItem({
      ownerUid: viewerUid,
      authorDisplayName: viewerDisplayName || null,
      authorEmail: feedbackAnonymous ? null : feedbackEmail.trim(),
      authorRankThumbnailSrc: viewerRankThumbnailSrc,
      authorCurrentRankId: viewerCurrentRankId,
      isAnonymous: feedbackAnonymous,
      type: feedbackType as FeedbackType,
      title: feedbackTitle,
      details: feedbackDetails,
      jiraIssueBrowseUrl: jiraResult?.jiraIssueBrowseUrl || null,
    });
    setFeedbackSubmitting(false);
    if (!saved.ok) {
      setFeedbackError(
        jiraResult?.jiraIssueKey
          ? `${saved.message} Jira issue ${jiraResult.jiraIssueKey} was already created, so retrying this same draft will reuse it.`
          : saved.message
      );
      return;
    }
    lastJiraSubmissionRef.current = null;
    setFeedbackType("");
    setFeedbackTitle("");
    setFeedbackDetails("");
    setFeedbackStatus(jiraResult?.jiraIssueKey ? `Feedback submitted successfully. Jira issue ${jiraResult.jiraIssueKey} created.` : "Feedback submitted successfully.");
  }, [
    feedbackAnonymous,
    feedbackDetails,
    feedbackEmail,
    feedbackSubmitting,
    feedbackTitle,
    feedbackType,
    getFeedbackValidationMessage,
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
      if (result.ok && result.jiraIssueBrowseUrl) {
        try {
          const auth = getFirebaseAuthClient();
          const currentUser = auth?.currentUser;
          const idToken = currentUser ? await currentUser.getIdToken() : "";
          if (idToken) {
            await fetch("/api/jira/feedback", {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                jiraIssueBrowseUrl: result.jiraIssueBrowseUrl,
                upvoteCount: result.upvoteCount,
                upvoted: result.upvoted,
              }),
            });
          }
        } catch {
          // Best-effort Jira sync; do not block the Firestore vote update.
        }
      }
      setVoteBusyById((prev) => {
        const next = { ...prev };
        delete next[feedbackId];
        return next;
      });
      if (!result.ok) setFeedbackError(result.message);
    },
    [viewerUid, voteBusyById]
  );

  const handleToggleExpanded = useCallback((feedbackId: string) => {
    setExpandedFeedbackById((prev) => ({ ...prev, [feedbackId]: !prev[feedbackId] }));
  }, []);

  const getFeedbackTypeLabel = useCallback((type: FeedbackType) => {
    if (type === "bug") return "Bug";
    if (type === "feature") return "Feature Request";
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

  const renderFeedbackItem = useCallback(
    (item: FeedbackItem) => {
      const voteBusy = !!voteBusyById[item.feedbackId];
      const isExpanded = !!expandedFeedbackById[item.feedbackId];
      const effectiveStatus = getFeedbackEffectiveStatus(item);
      return (
        <article key={item.feedbackId} className={`feedbackBoardItem feedbackBoardItem-${item.type}`}>
          <div className="feedbackBoardCollapsedRow">
            <div className="feedbackBoardCollapsedMain">
              <div className="feedbackBoardBadges">
                <span className={`feedbackBoardBadge feedbackBoardBadgeStatus feedbackBoardBadgeStatus-${effectiveStatus}`}>
                  {getFeedbackStatusLabel(effectiveStatus)}
                </span>
                <span className={`feedbackBoardBadge feedbackBoardBadgeType feedbackBoardBadgeType-${item.type}`}>
                  {getFeedbackTypeLabel(item.type)}
                </span>
              </div>
              <h3 className="dashboardCardTitle feedbackBoardTitle">{item.title}</h3>
            </div>
            <div className="feedbackBoardCollapsedActions">
              <button
                className={`btn btn-ghost small feedbackBoardVoteBtn${item.viewerHasUpvoted ? " isOn" : ""}`}
                type="button"
                disabled={voteBusy || !viewerUid}
                aria-pressed={item.viewerHasUpvoted ? "true" : "false"}
                onClick={() => handleToggleVote(item.feedbackId)}
              >
                {item.viewerHasUpvoted ? "Upvoted" : "Upvote"} ({item.upvoteCount})
              </button>
              <button
                className="btn btn-ghost small feedbackBoardExpandBtn"
                type="button"
                aria-expanded={isExpanded ? "true" : "false"}
                onClick={() => handleToggleExpanded(item.feedbackId)}
              >
                {isExpanded ? "Hide" : "Details"}
              </button>
            </div>
          </div>
          {isExpanded ? (
            <>
              <p className="settingsDetailText feedbackBoardDetails">{item.details}</p>
              <div className="feedbackBoardMeta">
                <span>{getFeedbackAuthorLabel(item)}</span>
                <span>{formatFeedbackDate(item)}</span>
                {canViewJiraLinks && item.jiraIssueBrowseUrl ? (
                  <a className="btn btn-ghost small" href={item.jiraIssueBrowseUrl} target="_blank" rel="noreferrer">
                    Open in Jira
                  </a>
                ) : null}
              </div>
            </>
          ) : null}
        </article>
      );
    },
    [
      canViewJiraLinks,
      expandedFeedbackById,
      formatFeedbackDate,
      getFeedbackAuthorLabel,
      getFeedbackEffectiveStatus,
      getFeedbackStatusLabel,
      getFeedbackTypeLabel,
      handleToggleExpanded,
      handleToggleVote,
      viewerUid,
      voteBusyById,
    ]
  );

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

                  {feedbackStatus || feedbackError ? (
                    <div className={`settingsDetailNote${feedbackError ? " feedbackErrorNote" : " feedbackSuccessNote"}`} aria-live="polite">
                      {feedbackError || feedbackStatus}
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
                    <div className="feedbackBoardSections" aria-live="polite">
                      <section className="feedbackBoardSection" aria-label="Upvoted feedback">
                        <div className="feedbackBoardSectionHead">
                          <div className="dashboardCardTitle feedbackBoardSectionTitle">Upvoted</div>
                        </div>
                        {upvotedItems.length ? (
                          <div className="feedbackBoardList">{upvotedItems.map(renderFeedbackItem)}</div>
                        ) : (
                          <div className="settingsDetailNote feedbackBoardSectionEmpty">You have not upvoted any feedback yet.</div>
                        )}
                      </section>

                      <section className="feedbackBoardSection" aria-label="Other feedback">
                        <div className="feedbackBoardSectionHead feedbackBoardSectionHead-withFilter">
                          <div className="dashboardCardTitle feedbackBoardSectionTitle">Other</div>
                          <div className="feedbackBoardFilterWrap">
                            <div className="feedbackBoardFilter" role="group" aria-label="Filter other feedback by type">
                              <span className="feedbackBoardFilterLabel">Type</span>
                              <div className="feedbackBoardFilterPills">
                                {otherFilterOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    className={`btn btn-ghost small unitBtn feedbackBoardFilterPill${otherFilter === option.value ? " isOn" : ""}`}
                                    type="button"
                                    aria-pressed={otherFilter === option.value ? "true" : "false"}
                                    onClick={() => setOtherFilter(option.value)}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="feedbackBoardFilter" role="group" aria-label="Filter other feedback by status">
                              <span className="feedbackBoardFilterLabel">Status</span>
                              <div className="feedbackBoardFilterPills">
                                {otherStatusFilterOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    className={`btn btn-ghost small unitBtn feedbackBoardFilterPill${otherStatusFilter === option.value ? " isOn" : ""}`}
                                    type="button"
                                    aria-pressed={otherStatusFilter === option.value ? "true" : "false"}
                                    onClick={() => setOtherStatusFilter(option.value)}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        {filteredOtherItems.length ? (
                          <div className="feedbackBoardList">{filteredOtherItems.map(renderFeedbackItem)}</div>
                        ) : (
                          <div className="settingsDetailNote feedbackBoardSectionEmpty">No feedback matches the current filter.</div>
                        )}
                      </section>
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
