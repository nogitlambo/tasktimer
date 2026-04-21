"use client";

import Image from "next/image";

type WebSignInProps = {
  authUserEmail: string | null;
  showEmailLoginForm: boolean;
  isEmailLinkFlow: boolean;
  isValidAuthEmail: boolean;
  authEmail: string;
  authStatus: string;
  authError: string;
  authBusy: boolean;
  showLaunchingScreen: boolean;
  onToggleEmailLoginForm: () => void;
  onGoogleSignIn: () => void;
  onSendEmailLink: () => void;
  onCompleteEmailLink: () => void;
  onAuthEmailChange: (value: string) => void;
};

export default function WebSignIn(props: WebSignInProps) {
  const {
    authUserEmail,
    showEmailLoginForm,
    isEmailLinkFlow,
    isValidAuthEmail,
    authEmail,
    authStatus,
    authError,
    authBusy,
    showLaunchingScreen,
    onToggleEmailLoginForm,
    onGoogleSignIn,
    onSendEmailLink,
    onCompleteEmailLink,
    onAuthEmailChange,
  } = props;

  if (showLaunchingScreen) {
    return (
      <main className="webSignInPage relative min-h-screen overflow-hidden text-white">
        <div className="webSignInGrid" aria-hidden="true" />
        <div className="webSignInContainer">
          <section className="webSignInLaunchPanel">
            <Image
              src="/logo/tasklaunch-logo-v2.png"
              alt="TaskLaunch"
              width={560}
              height={76}
              priority
              className="webSignInLogo"
            />
            <div className="dashboardRefreshBusyPanel" role="status" aria-live="polite" aria-atomic="true">
              <h2 className="sr-only">Launching TaskLaunch</h2>
              <p className="modalSubtext confirmText">Launching TaskLaunch...</p>
              <div className="dashboardRefreshBusyProgress" aria-hidden="true">
                <span className="dashboardRefreshBusyProgressBar" />
              </div>
            </div>
          </section>
        </div>
        <footer className="webSignInFooter" aria-label="Security disclaimer">
          <p className="webSignInFooterText">
            This site is protected by reCAPTCHA Enterprise and the TaskLaunch{" "}
            <a
              className="webSignInFooterLink"
              href="https://tasklaunch.app/privacy"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </a>{" "}
            and Terms of Service apply.
          </p>
        </footer>
      </main>
    );
  }

  return (
    <main className="webSignInPage relative min-h-screen overflow-hidden text-white">
      <div className="webSignInGrid" aria-hidden="true" />

      <div className="webSignInContainer">
        <section className="webSignInAuthFrame">
          <div className="relative z-10 flex flex-col items-center gap-3">
            <Image
              src="/logo/tasklaunch-logo-v2.png"
              alt="TaskLaunch"
              width={560}
              height={76}
              priority
              className="webSignInLogo"
            />
          </div>

          <section
            id="landingAuthPanel"
            className="webSignInAuthPanel relative w-full px-6 pb-4 pt-2 text-left sm:px-8"
          >
            <div className="relative">
              <p className="webSignInKicker text-center text-[12px] uppercase tracking-[0.22em]">
                YOUR DAILY PRODUCTIVITY ENGINE
              </p>
            </div>

            {!authUserEmail ? (
              <div className="relative flex flex-col gap-3 pt-8">
                <button
                  type="button"
                  onClick={onToggleEmailLoginForm}
                  aria-expanded={showEmailLoginForm ? "true" : "false"}
                  disabled={authBusy}
                  className="webSignInAuthButton webSignInAuthButtonStandard webSignInAuthButtonPrimary self-center rounded-none"
                >
                  <span className="webSignInAuthButtonIcon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 2v.4l8 5.1 8-5.1V8H4zm16 8V10.76l-7.46 4.75a1 1 0 0 1-1.08 0L4 10.76V16h16z"
                      />
                    </svg>
                  </span>
                  <span className="webSignInAuthButtonLabel">Continue with email</span>
                </button>

                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={authBusy}
                  className="webSignInAuthButton webSignInAuthButtonStandard webSignInAuthButtonPrimary self-center rounded-none"
                  style={showEmailLoginForm ? { display: "none" } : undefined}
                >
                  <span className="webSignInAuthButtonIcon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                      <path
                        fill="#EA4335"
                        d="M12.24 10.29v3.93h5.47c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.72-.06-1.42-.19-2.09h-9.57z"
                      />
                      <path
                        fill="#4285F4"
                        d="M12 22c2.75 0 5.06-.91 6.74-2.47l-3.3-2.56c-.91.61-2.08.98-3.44.98-2.65 0-4.89-1.79-5.69-4.19H2.9v2.63A10 10 0 0 0 12 22z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M6.31 13.76A5.99 5.99 0 0 1 6 12c0-.61.11-1.2.31-1.76V7.61H2.9A10 10 0 0 0 2 12c0 1.61.39 3.13.9 4.39l3.41-2.63z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 6.05c1.49 0 2.82.51 3.87 1.51l2.9-2.9C17.05 3.05 14.74 2 12 2A10 10 0 0 0 2.9 7.61l3.41 2.63c.8-2.4 3.04-4.19 5.69-4.19z"
                      />
                    </svg>
                  </span>
                  <span className="webSignInAuthButtonLabel">Continue with Google</span>
                </button>

                {showEmailLoginForm ? (
                  <>
                    <label htmlFor="landingEmailInput" className="sr-only">
                      Email address
                    </label>
                    <input
                      id="landingEmailInput"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={authEmail}
                      onChange={(e) => onAuthEmailChange(e.target.value)}
                      className="webSignInAuthInput webSignInAuthInputStandard self-center rounded-none"
                    />
                  </>
                ) : null}

                <div className="webSignInAuthActions flex flex-wrap justify-center gap-2">
                  {showEmailLoginForm ? (
                    <button
                      type="button"
                      onClick={onToggleEmailLoginForm}
                      disabled={authBusy}
                      className="webSignInAuthButton webSignInAuthButtonCompact rounded-none"
                    >
                      Cancel
                    </button>
                  ) : null}
                  {showEmailLoginForm ? (
                    <button
                      type="button"
                      onClick={onSendEmailLink}
                      disabled={authBusy || !isValidAuthEmail}
                      className="webSignInAuthButton webSignInAuthButtonCompact rounded-none"
                    >
                      Send Link
                    </button>
                  ) : null}
                  {isEmailLinkFlow ? (
                    <button
                      type="button"
                      onClick={onCompleteEmailLink}
                      disabled={authBusy || !isValidAuthEmail}
                      className="webSignInAuthButton webSignInAuthButtonCompact rounded-none"
                    >
                      Complete Sign-In
                    </button>
                  ) : null}
                </div>

                {authStatus ? <div className="webSignInStatus text-xs">{authStatus}</div> : null}
                {authError ? <div className="webSignInError text-xs">{authError}</div> : null}
              </div>
            ) : (
              <div className="webSignInSignedIn mt-8 rounded-none p-4 text-center text-sm">
                Signed in as <strong>{authUserEmail}</strong>. Redirecting...
              </div>
            )}
          </section>
        </section>
      </div>
      <footer className="webSignInFooter" aria-label="Security disclaimer">
        <p className="webSignInFooterText">
          This site is protected by reCAPTCHA Enterprise and the TaskLaunch{" "}
          <a
            className="webSignInFooterLink"
            href="https://tasklaunch.app/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>{" "}
          and Terms of Service apply.
        </p>
      </footer>
    </main>
  );
}
