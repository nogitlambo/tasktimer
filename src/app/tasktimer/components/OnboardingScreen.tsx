"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppImg from "@/components/AppImg";
import { STORAGE_KEY } from "@/app/tasktimer/lib/storage";
import { Capacitor } from "@capacitor/core";

type OnboardingStep = "welcome" | "features" | "createTask" | "appearance" | "notifications";

const STEPS: OnboardingStep[] = ["welcome", "features", "createTask", "appearance", "notifications"];

interface TaskCreatedState {
  name: string;
  created: boolean;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [taskCreated, setTaskCreated] = useState<TaskCreatedState>({ name: "", created: false });
  const [theme, setTheme] = useState<"purple" | "cyan">("purple");
  const [webPushEnabled, setWebPushEnabled] = useState(false);
  const [mobilePushEnabled, setMobilePushEnabled] = useState(false);

  useEffect(() => {
    // Load saved preferences
    if (typeof window !== "undefined") {
      try {
        const savedTheme = window.localStorage.getItem(`${STORAGE_KEY}:theme`) as "purple" | "cyan" | null;
        if (savedTheme) setTheme(savedTheme);

        const savedWebPush = window.localStorage.getItem(`${STORAGE_KEY}:webPushAlertsEnabled`);
        if (savedWebPush === "true") setWebPushEnabled(true);

        const savedMobilePush = window.localStorage.getItem(`${STORAGE_KEY}:mobilePushAlertsEnabled`);
        if (savedMobilePush === "true") setMobilePushEnabled(true);
      } catch {
        // Ignore localStorage errors
      }
    }
  }, []);

  const handleNext = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1]);
    }
  };

  const handleComplete = () => {
    // Save onboarding completion and preferences
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(`${STORAGE_KEY}:onboardingCompleted`, "true");
        window.localStorage.setItem(`${STORAGE_KEY}:theme`, theme);
        window.localStorage.setItem(`${STORAGE_KEY}:webPushAlertsEnabled`, String(webPushEnabled));
        window.localStorage.setItem(`${STORAGE_KEY}:mobilePushAlertsEnabled`, String(mobilePushEnabled));
      } catch {
        // Ignore localStorage errors
      }
    }
    // Redirect to tasks page with highlight
    router.replace("/tasklaunch?page=tasks&highlight=addTask");
  };

  const handleThemeChange = (newTheme: "purple" | "cyan") => {
    setTheme(newTheme);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(`${STORAGE_KEY}:theme`, newTheme);
        document.documentElement.setAttribute("data-theme", newTheme);
      } catch {
        // Ignore localStorage errors
      }
    }
  };

  const currentStepIndex = STEPS.indexOf(currentStep);
  const stepNumber = currentStepIndex + 1;
  const totalSteps = STEPS.length;

  return (
    <div className="onboardingScreen">
      <div className="onboardingOverlay overlay" style={{ display: "flex" }}>
        <div className="onboardingModal modal" role="dialog" aria-modal="true" aria-label="Onboarding">
          {/* Progress Indicator */}
          <div className="onboardingProgress">
            <div className="progressDots">
              {STEPS.map((step, index) => (
                <div
                  key={step}
                  className={`progressDot ${index < currentStepIndex ? "completed" : index === currentStepIndex ? "active" : ""}`}
                  aria-label={`Step ${index + 1}`}
                />
              ))}
            </div>
            <span className="progressText">
              Step {stepNumber} of {totalSteps}
            </span>
          </div>

          {/* Step: Welcome */}
          {currentStep === "welcome" && (
            <div className="onboardingStep">
              <div className="onboardingStepContent">
                <div className="onboardingIcon">
                  <AppImg src="/Timer.svg" alt="TaskTimer logo" />
                </div>
                <h2>Welcome to TaskTimer</h2>
                <p className="onboardingSubtext">
                  Focus better, track progress, and achieve your goals with intelligent task timing and insights.
                </p>
              </div>
              <div className="onboardingActions">
                <button className="btn btn-accent" onClick={handleNext}>
                  Get Started
                </button>
              </div>
            </div>
          )}

          {/* Step: Features */}
          {currentStep === "features" && (
            <div className="onboardingStep">
              <h2>Key Features</h2>
              <div className="featuresGrid">
                <div className="featureCard">
                  <div className="featureIcon">
                    <AppImg src="/Focus_Mode.svg" alt="Focus modes" />
                  </div>
                  <h3>Focus Modes</h3>
                  <p>Three customizable focus modes to match your workflow and preferences</p>
                </div>
                <div className="featureCard">
                  <div className="featureIcon">
                    <AppImg src="/Task_Organization.svg" alt="Task organization" />
                  </div>
                  <h3>Task Organization</h3>
                  <p>Create, organize, and prioritize your tasks with ease</p>
                </div>
                <div className="featureCard">
                  <div className="featureIcon">
                    <AppImg src="/Progress_Tracking.svg" alt="Progress tracking" />
                  </div>
                  <h3>Progress Tracking</h3>
                  <p>Visualize your progress and celebrate your achievements</p>
                </div>
              </div>
              <div className="onboardingActions">
                <button className="btn btn-ghost" onClick={handleBack}>
                  Back
                </button>
                <button className="btn btn-accent" onClick={handleNext}>
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step: Create Task */}
          {currentStep === "createTask" && (
            <div className="onboardingStep">
              <h2>Create Your First Task</h2>
              <p className="onboardingSubtext">Let's get started by creating your first task. You can add more anytime.</p>
              <div className="taskCreationContainer">
                <input
                  type="text"
                  className="taskCreationInput"
                  placeholder="Enter task name..."
                  value={taskCreated.name}
                  onChange={(e) => setTaskCreated({ ...taskCreated, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && taskCreated.name.trim()) {
                      setTaskCreated({ ...taskCreated, created: true });
                    }
                  }}
                />
                {taskCreated.name && !taskCreated.created && (
                  <button
                    className="btn btn-accent taskCreationSubmit"
                    onClick={() => {
                      if (taskCreated.name.trim()) {
                        setTaskCreated({ ...taskCreated, created: true });
                      }
                    }}
                  >
                    Add Task
                  </button>
                )}
                {taskCreated.created && (
                  <div className="taskCreatedConfirm">
                    <p className="taskCreatedText">Task created! Let's continue.</p>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setTaskCreated({ ...taskCreated, created: false, name: "" })}
                    >
                      Add Another
                    </button>
                  </div>
                )}
              </div>
              <div className="onboardingActions">
                <button className="btn btn-ghost" onClick={handleBack}>
                  Back
                </button>
                <button className="btn btn-accent" onClick={handleNext} disabled={!taskCreated.created}>
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step: Appearance */}
          {currentStep === "appearance" && (
            <div className="onboardingStep">
              <h2>Choose Your Theme</h2>
              <p className="onboardingSubtext">Pick a theme that works best for you. You can change this anytime.</p>
              <div className="themeSelector">
                <label className={`themeOption ${theme === "purple" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="theme"
                    value="purple"
                    checked={theme === "purple"}
                    onChange={(e) => handleThemeChange(e.target.value as "purple" | "cyan")}
                  />
                  <span className="themeName">Purple</span>
                  <span className="themePreview purplePreview" />
                </label>
                <label className={`themeOption ${theme === "cyan" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="theme"
                    value="cyan"
                    checked={theme === "cyan"}
                    onChange={(e) => handleThemeChange(e.target.value as "purple" | "cyan")}
                  />
                  <span className="themeName">Cyan</span>
                  <span className="themePreview cyanPreview" />
                </label>
              </div>
              <div className="onboardingActions">
                <button className="btn btn-ghost" onClick={handleBack}>
                  Back
                </button>
                <button className="btn btn-accent" onClick={handleNext}>
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step: Notifications */}
          {currentStep === "notifications" && (
            <div className="onboardingStep">
              <h2>Enable Notifications</h2>
              <p className="onboardingSubtext">Get notified about your focus sessions and task updates.</p>
              <div className="notificationToggles">
                {!Capacitor.isNativePlatform() && (
                  <label className="notificationToggleRow">
                    <span className="toggleLabel">Web Push Notifications</span>
                    <input
                      type="checkbox"
                      className="toggleInput"
                      checked={webPushEnabled}
                      onChange={(e) => setWebPushEnabled(e.target.checked)}
                    />
                    <div className={`switch ${webPushEnabled ? "on" : ""}`} role="switch" aria-checked={webPushEnabled} />
                  </label>
                )}
                {Capacitor.isNativePlatform() && (
                  <label className="notificationToggleRow">
                    <span className="toggleLabel">Mobile Push Notifications</span>
                    <input
                      type="checkbox"
                      className="toggleInput"
                      checked={mobilePushEnabled}
                      onChange={(e) => setMobilePushEnabled(e.target.checked)}
                    />
                    <div className={`switch ${mobilePushEnabled ? "on" : ""}`} role="switch" aria-checked={mobilePushEnabled} />
                  </label>
                )}
              </div>
              <div className="onboardingActions">
                <button className="btn btn-ghost" onClick={handleBack}>
                  Back
                </button>
                <button className="btn btn-accent" onClick={handleComplete}>
                  Complete Setup
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
