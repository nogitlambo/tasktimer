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
    onToggleEmailLoginForm,
    onGoogleSignIn,
    onSendEmailLink,
    onCompleteEmailLink,
    onAuthEmailChange,
  } = props;

  return (
    <main className="landingV2 relative min-h-screen overflow-hidden bg-[#05010b] text-white">
      <div className="landingV2Glow landingV2GlowTop pointer-events-none" aria-hidden="true" />
      <div className="landingV2Glow landingV2GlowBottom pointer-events-none" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(191,138,255,.11) 1px, transparent 1px), linear-gradient(90deg, rgba(64,225,255,.09) 1px, transparent 1px)",
          backgroundSize: "68px 68px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,.82), rgba(0,0,0,.14))",
        }}
      />

      <div className="landingV2Container relative mx-auto flex min-h-screen w-full max-w-[1625px] items-center justify-center px-6 pb-20 pt-8 sm:px-8 md:px-12">
        <section className="relative flex w-full max-w-[560px] flex-col items-center justify-center gap-4 text-center">
          <div className="relative z-10 flex flex-col items-center gap-3">
            <Image
              src="/logo/tasklaunch.svg"
              alt="TaskLaunch"
              width={560}
              height={76}
              priority
              className="h-auto w-[230px] sm:w-[280px] md:w-[340px]"
            />
          </div>

          <section
            id="landingAuthPanel"
            className="relative w-full px-6 pb-4 pt-2 text-left sm:max-w-[560px] sm:px-8"
          >
            <div className="relative">
              <p className="displayFont text-center text-[12px] uppercase tracking-[0.22em] text-[#f1c9ff]">
                LAUNCH YOUR INTENTION TODAY
              </p>
            </div>

            {!authUserEmail ? (
              <div className="relative flex flex-col gap-3 pt-8">
                <button
                  type="button"
                  onClick={onToggleEmailLoginForm}
                  aria-expanded={showEmailLoginForm ? "true" : "false"}
                  disabled={authBusy}
                  className="displayFont flex min-h-[52px] w-full items-center justify-center gap-2 rounded-none bg-[linear-gradient(180deg,rgba(39,20,53,0.96),rgba(24,12,35,0.94))] px-5 py-2 text-base font-bold text-white transition hover:bg-[linear-gradient(180deg,rgba(73,29,97,0.98),rgba(35,15,50,0.96))] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 2v.4l8 5.1 8-5.1V8H4zm16 8V10.76l-7.46 4.75a1 1 0 0 1-1.08 0L4 10.76V16h16z"
                    />
                  </svg>
                  <span>Login with email</span>
                </button>

                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={authBusy}
                  className="displayFont flex min-h-[52px] w-full items-center justify-center gap-2 rounded-none bg-[linear-gradient(180deg,rgba(39,20,53,0.96),rgba(24,12,35,0.94))] px-5 py-2 text-base font-bold text-white transition hover:bg-[linear-gradient(180deg,rgba(73,29,97,0.98),rgba(35,15,50,0.96))] disabled:cursor-not-allowed disabled:opacity-55"
                  style={showEmailLoginForm ? { display: "none" } : undefined}
                >
                  <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" aria-hidden="true">
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
                  <span>Login with Google</span>
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
                      className="h-11 w-full rounded-none border border-[#d447d2]/36 bg-[rgba(27,14,39,0.92)] px-4 text-sm text-white outline-none placeholder:text-[#d5b3ea]/48 focus:border-[#f06ee0]/58"
                    />
                  </>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  {showEmailLoginForm ? (
                    <button
                      type="button"
                      onClick={onToggleEmailLoginForm}
                      disabled={authBusy}
                      className="displayFont min-w-[172px] rounded-none border border-[#d447d2]/65 bg-transparent px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-[#f4d4ff] transition hover:bg-gradient-to-r hover:from-[#331345] hover:via-[#4b1d68] hover:to-[#2a1039] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Cancel
                    </button>
                  ) : null}
                  {showEmailLoginForm ? (
                    <button
                      type="button"
                      onClick={onSendEmailLink}
                      disabled={authBusy || !isValidAuthEmail}
                      className="displayFont min-w-[172px] rounded-none border border-[#d447d2]/65 bg-transparent px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-[#ffd7fb] transition hover:bg-gradient-to-r hover:from-[#d447d2] hover:via-[#b14ae9] hover:to-[#7f5cff] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Send Link
                    </button>
                  ) : null}
                  {isEmailLinkFlow ? (
                    <button
                      type="button"
                      onClick={onCompleteEmailLink}
                      disabled={authBusy || !isValidAuthEmail}
                      className="displayFont min-w-[172px] rounded-none border border-[#d447d2]/65 bg-transparent px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-[#f4d4ff] transition hover:bg-gradient-to-r hover:from-[#d447d2] hover:via-[#b14ae9] hover:to-[#7f5cff] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Complete Sign-In
                    </button>
                  ) : null}
                </div>

                {authStatus ? <div className="text-xs text-[#d3faff]">{authStatus}</div> : null}
                {authError ? <div className="text-xs text-[#ff9b9b]">{authError}</div> : null}
              </div>
            ) : (
              <div className="mt-8 rounded-none bg-[rgba(27,14,39,0.88)] p-4 text-center text-sm text-white/80">
                Signed in as <span className="font-semibold text-[#d8fbff]">{authUserEmail}</span>. Redirecting...
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
