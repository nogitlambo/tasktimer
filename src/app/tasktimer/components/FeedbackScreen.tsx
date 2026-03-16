"use client";

import React, { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import DesktopAppRail from "./DesktopAppRail";
import SignedInHeaderBadge from "./SignedInHeaderBadge";

export default function FeedbackScreen() {
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackAnonymous, setFeedbackAnonymous] = useState(false);
  const [feedbackType, setFeedbackType] = useState("");
  const [feedbackDetails, setFeedbackDetails] = useState("");

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      const nextEmail = user?.email || null;
      setFeedbackEmail((prev) => {
        if (feedbackAnonymous) return prev;
        return prev.trim() ? prev : nextEmail || "";
      });
    });
    return () => unsub();
  }, [feedbackAnonymous]);

  const handleBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/tasktimer");
  }, []);

  const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
  const canSubmitFeedback = (feedbackAnonymous || isValidFeedbackEmail) && !!feedbackType && feedbackDetails.trim().length > 0;

  return (
    <div className="wrap" id="app" aria-label="TaskLaunch Feedback">
      <div className="topbar" aria-label="TaskLaunch header">
        <div className="brand">
          <img className="brandLogo" src="/logo/tasklaunch.svg" alt="TaskLaunch" />
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
                    <img className="feedbackFormIcon" src="/Feedback.svg" alt="" aria-hidden="true" />
                    <div className="feedbackFormHeadCopy">
                      <div className="feedbackFormTitle">Feedback Form</div>
                      <p className="feedbackFormSubtext">Share product feedback, bug reports, and feature ideas.</p>
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
                    <input
                      type="checkbox"
                      checked={feedbackAnonymous}
                      onChange={(e) => setFeedbackAnonymous(e.target.checked)}
                    />
                    <span>Log as anonymous</span>
                  </label>

                  <div className="field feedbackFormField">
                    <label htmlFor="feedbackTypeSelect">Feedback Type</label>
                    <select id="feedbackTypeSelect" value={feedbackType} onChange={(e) => setFeedbackType(e.target.value)}>
                      <option value="" disabled>
                        --Please Select--
                      </option>
                      <option value="bug">Report a bug</option>
                      <option value="general">General feedback</option>
                      <option value="feature">Request a feature/enhancement</option>
                    </select>
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

                  <div className="feedbackFormActions">
                    <button className="btn btn-ghost small settingsFeedbackUploadBtn" type="button" disabled>
                      Upload Screenshot
                    </button>
                    <button className="btn btn-accent small" id="feedbackBtn" type="button" disabled={!canSubmitFeedback}>
                      Submit Feedback
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
