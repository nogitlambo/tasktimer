import type { ReactNode } from "react";
import AppImg from "@/components/AppImg";
import PrivacyBackButton from "./PrivacyBackButton";

const EFFECTIVE_DATE = "March 20, 2026";

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="displayFont text-[0.95rem] font-bold tracking-[0.04em] text-[#79e2ff] [font-family:var(--font-orbitron)] sm:text-[1rem]">
        <span>{number}. </span>
        <span>{title}</span>
      </h2>
      <div className="space-y-3 text-white">{children}</div>
    </section>
  );
}

function Clause({
  letter,
  children,
}: {
  letter: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-white">
      <span className="font-semibold text-white">({letter})</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#06080d] px-4 py-6 text-white [font-family:var(--font-geist-sans)] sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section className="border border-[#79e2ff]/20 bg-[#0d0f13] px-4 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_0_0_1px_rgba(255,255,255,0.03)] sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] uppercase tracking-[0.18em] text-white/60 sm:text-[0.72rem]">Legal</p>
              <h1 className="displayFont mt-1 text-[1.15rem] font-bold uppercase tracking-[0.08em] text-[#8ef2ff] [font-family:var(--font-orbitron)] sm:text-[1.35rem]">
                TaskLaunch Privacy Policy
              </h1>
              <p className="mt-2 max-w-3xl text-[0.82rem] leading-6 text-white/72 sm:text-[0.9rem]">
                How TaskLaunch collects, stores, and uses account, app, and optional social-feature data.
              </p>
            </div>
            <PrivacyBackButton />
          </div>
        </section>

        <section className="border border-[#79e2ff]/20 bg-[#0d0f13] px-4 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_0_0_1px_rgba(255,255,255,0.03)] sm:px-6 sm:py-6">
          <div className="relative mb-5 border-b border-[#79e2ff]/14 pb-4 pr-36 sm:pr-44">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.16em] text-white/58 sm:text-[0.72rem]">Policy overview</p>
              <p className="mt-1 text-[0.76rem] leading-5 text-white/72 sm:text-[0.82rem]">Effective date: {EFFECTIVE_DATE}</p>
            </div>
            <div className="pointer-events-none absolute right-0 top-0 flex h-[22px] w-[120px] items-start justify-end sm:h-[26px] sm:w-[140px]">
              <AppImg className="block h-full w-full object-contain object-right opacity-90" src="/logo/tasklaunch.svg" alt="TaskLaunch" />
            </div>
          </div>

          <div className="space-y-5 text-[0.9rem] leading-8 text-white sm:text-[0.95rem]">
            <p className="text-white/88">
              This Privacy Policy applies to all personal information collected by{" "}
              <a
                className="font-semibold text-[#79e2ff] underline decoration-[#79e2ff]/55 underline-offset-2"
                href="https://tasklaunch.app"
                target="_blank"
                rel="noreferrer"
              >
                TaskLaunch
              </a>{" "}
              (we, us, or our) through the TaskLaunch app and related services. TaskLaunch is a task timing, history,
              and productivity app. Most task, timer, settings, and history data can be stored locally on your device.
              If you sign in, TaskLaunch also uses Firebase Authentication and Cloud Firestore to provide account
              features, cloud-backed app data, and optional social features such as friends and shared task summaries.
            </p>

            <div className="h-px w-full bg-[#79e2ff]/14" />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="border border-[#79e2ff]/16 bg-white/[0.025] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                <p className="text-[0.68rem] uppercase tracking-[0.14em] text-white/58 sm:text-[0.72rem]">Collection</p>
                <p className="mt-2 text-[0.82rem] leading-6 text-white/78 sm:text-[0.88rem]">
                  We collect account details, profile data, app activity, settings, and optional social data depending
                  on how you use TaskLaunch.
                </p>
              </div>
              <div className="border border-[#79e2ff]/16 bg-white/[0.025] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                <p className="text-[0.68rem] uppercase tracking-[0.14em] text-white/58 sm:text-[0.72rem]">Storage</p>
                <p className="mt-2 text-[0.82rem] leading-6 text-white/78 sm:text-[0.88rem]">
                  TaskLaunch stores much of its runtime data locally, and signed-in flows may also use Firebase
                  Authentication and Cloud Firestore.
                </p>
              </div>
            </div>

            <div className="h-px w-full bg-[#79e2ff]/14" />

            <div className="space-y-5">
              <Section number={1} title="What information do we collect?">
                <p>
                  The kinds of personal information that we collect from you depend on how you use TaskLaunch. The
                  personal information that may be collected and held about you includes account details, profile data,
                  task and history data, settings, and optional social feature data.
                </p>
              </Section>

              <Section number={2} title="Types of information">
                <p>
                  Depending on how you use TaskLaunch, the information we collect and store may include information
                  that identifies you directly, information linked to your account, and app activity data that becomes
                  personal information once associated with your signed-in profile.
                </p>
                <div className="mt-3 space-y-2">
                  <Clause letter="a">
                    Email address and sign-in details used for email-link sign-in or Google sign-in.
                  </Clause>
                  <Clause letter="b">
                    Profile data you provide or choose to use, such as username, alias, avatar selection, custom
                    avatar, Google profile photo, rank thumbnail, and related reward or rank progress fields.
                  </Clause>
                  <Clause letter="c">
                    Task, timer, time-goal, checkpoint, milestone, session-note, history, and deleted-task data.
                  </Clause>
                  <Clause letter="d">
                    Preferences and app state such as theme, menu style, notification settings, dashboard layout, task
                    UI state, and mode settings.
                  </Clause>
                  <Clause letter="e">
                    Social feature data such as friend invite keys, friend requests, friendship profile information,
                    and shared task summary data when you choose to use those features.
                  </Clause>
                  <Clause letter="f">
                    Feedback form entries you type into the app, such as email address, feedback type, and message
                    content, if and when submission handling is enabled.
                  </Clause>
                </div>
              </Section>

              <Section number={3} title="How we collect your personal information">
                <div className="space-y-2">
                  <Clause letter="a">
                    We collect information directly from you when you create an account, sign in, enter profile
                    details, create or edit tasks, manage settings, use social features, or submit feedback through the
                    app.
                  </Clause>
                  <Clause letter="b">
                    We collect app-generated information when TaskLaunch stores timers, checkpoints, milestones,
                    session notes, history entries, dashboard state, and similar runtime data on your device.
                  </Clause>
                  <Clause letter="c">
                    When you sign in, we collect and store cloud-backed account and app records through Firebase
                    services, including Firebase Authentication and Cloud Firestore.
                  </Clause>
                  <Clause letter="d">
                    If you use Google sign-in, we receive basic Google account profile information made available
                    through that sign-in flow, such as your email address, display name, and profile photo.
                  </Clause>
                </div>
              </Section>

              <Section number={4} title="Local device storage">
                <p>
                  TaskLaunch stores a substantial amount of app data locally on your device or browser storage,
                  including tasks, timers, history, preferences, mode settings, dashboard and task UI state, draft
                  notes, avatar selections, and other runtime settings needed to operate the app.
                </p>
              </Section>

              <Section number={5} title="Cloud storage when signed in">
                <p>
                  When you sign in, TaskLaunch may store data in Firebase services, including Cloud Firestore, so that
                  your account and selected app data can be associated with your profile and used across supported
                  signed-in flows.
                </p>
                <div className="mt-3 space-y-2">
                  <Clause letter="a">
                    User profile records, including email, display name, username, avatar fields, and reward profile
                    fields.
                  </Clause>
                  <Clause letter="b">Preferences, dashboard, task UI, and account-state documents.</Clause>
                  <Clause letter="c">Tasks, task history entries, and deleted-task records.</Clause>
                  <Clause letter="d">Username reservation records and user email lookup records.</Clause>
                  <Clause letter="e">Friend requests, friendship records, and friendship profile data.</Clause>
                  <Clause letter="f">Shared task summary records for optional sharing features.</Clause>
                </div>
              </Section>

              <Section number={6} title="Purpose of collection and use">
                <div className="space-y-2">
                  <Clause letter="a">To authenticate users and keep account sessions active.</Clause>
                  <Clause letter="b">
                    To provide task timing, history, settings, rewards, and related app features.
                  </Clause>
                  <Clause letter="c">To sync signed-in app data across supported usage flows.</Clause>
                  <Clause letter="d">
                    To support optional friend, profile, and shared-task features that you choose to use.
                  </Clause>
                  <Clause letter="e">
                    To display your selected profile, avatar, and reward customization within the app.
                  </Clause>
                  <Clause letter="f">
                    To protect service integrity, manage usernames, and prevent account or profile conflicts.
                  </Clause>
                  <Clause letter="g">
                    To review and respond to support or feedback submissions if submission handling is enabled.
                  </Clause>
                </div>
              </Section>

              <Section number={7} title="How data is shared">
                <div className="space-y-2">
                  <Clause letter="a">
                    With Firebase and Google as service providers for authentication and cloud infrastructure.
                  </Clause>
                  <Clause letter="b">
                    With other users you choose to connect with through the app, including friendship profile
                    information and shared task summary information.
                  </Clause>
                  <Clause letter="c">
                    With legal or regulatory authorities if disclosure is required by law or reasonably necessary to
                    protect rights, safety, or the integrity of the service.
                  </Clause>
                </div>
                <p className="mt-3">
                  TaskLaunch does not sell personal information and does not intentionally use personal data for
                  advertising or ad targeting.
                </p>
              </Section>

              <Section number={8} title="Data visible to other users">
                <p>
                  If you use friends or sharing features, other users you connect with may see profile-related
                  information such as your alias, avatar selection, custom avatar, Google profile photo if chosen for
                  use in-app, rank thumbnail, current rank identifier, and shared task summary information you choose
                  to make available through those features.
                </p>
              </Section>

              <Section number={9} title="Authentication">
                <p>
                  TaskLaunch supports email-link sign-in and Google sign-in through Firebase Authentication. If you
                  sign in with Google, TaskLaunch may access basic Google account profile information made available
                  through the sign-in flow, such as your email address, display name, and profile photo.
                </p>
              </Section>

              <Section number={10} title="Ads">
                <p>
                  TaskLaunch does not contain ads. The app is not designed to serve third-party advertising, and it
                  does not intentionally collect or use personal data for advertising or advertising personalization.
                </p>
              </Section>

              <Section number={11} title="Account deletion and local data reset">
                <div className="space-y-2">
                  <Clause letter="a">
                    This page is the public account-deletion information page for TaskLaunch. If you signed in to
                    TaskLaunch, you can request account deletion in the app from{" "}
                    <strong className="font-semibold text-[#79e2ff]">Settings &gt; Account &gt; Delete Account</strong>.
                  </Clause>
                  <Clause letter="b">
                    To request deletion in the app: sign in to the account you want to remove, open{" "}
                    <strong className="font-semibold text-[#79e2ff]">Settings &gt; Account</strong>, expand the delete
                    disclosure, and confirm <strong className="font-semibold text-[#79e2ff]">Delete Account</strong>.
                  </Clause>
                  <Clause letter="c">
                    If you cannot access the app, or if you want help with a deletion request, email{" "}
                    <strong className="font-semibold text-[#79e2ff]">aniven82@gmail.com</strong> and include the email
                    address used for TaskLaunch sign-in.
                  </Clause>
                  <Clause letter="d">
                    Deleting the signed-in account removes the Firebase Authentication account used by TaskLaunch and
                    clears the app&apos;s account-state deletion marker used during the delete flow.
                  </Clause>
                  <Clause letter="e">
                    Local task and history data stored on your device is separate and is not automatically removed when
                    the signed-in account is deleted.
                  </Clause>
                  <Clause letter="f">
                    Local device data can be cleared separately using{" "}
                    <strong className="font-semibold text-[#79e2ff]">Settings &gt; Reset All Data</strong>.
                  </Clause>
                  <Clause letter="g">
                    Unless you separately clear local data, it remains on the device until you remove it with{" "}
                    <strong className="font-semibold text-[#79e2ff]">Reset All Data</strong> or uninstall the app.
                  </Clause>
                  <Clause letter="h">
                    If you want deletion help beyond the in-app account removal flow, contact{" "}
                    <strong className="font-semibold text-[#79e2ff]">aniven82@gmail.com</strong>. If additional
                    cloud-backed app records are identified for your account, they may require manual follow-up rather
                    than immediate in-app deletion.
                  </Clause>
                  <Clause letter="i">
                    TaskLaunch also provides a way to request deletion of some app data without requiring account
                    deletion. To remove local task and history data while keeping your sign-in account, use{" "}
                    <strong className="font-semibold text-[#79e2ff]">Settings &gt; Reset All Data</strong>.
                  </Clause>
                  <Clause letter="j">
                    If you want help deleting specific data without deleting your account, email{" "}
                    <strong className="font-semibold text-[#79e2ff]">aniven82@gmail.com</strong> with the email address
                    used for TaskLaunch sign-in and a description of the data you want deleted.
                  </Clause>
                  <Clause letter="k">
                    Data deleted through <strong className="font-semibold text-[#79e2ff]">Reset All Data</strong> is
                    removed from the local device. Using Reset All Data does not itself delete the Firebase
                    Authentication account.
                  </Clause>
                </div>
              </Section>

              <Section number={12} title="Contact">
                <div className="space-y-2">
                  <Clause letter="a">
                    For privacy questions, data requests, or support, contact{" "}
                    <strong className="font-semibold text-[#79e2ff]">aniven82@gmail.com</strong>.
                  </Clause>
                  <Clause letter="b">
                    You may also use the in-app{" "}
                    <strong className="font-semibold text-[#79e2ff]">Settings &gt; Feedback</strong> screen for
                    general support requests.
                  </Clause>
                </div>
              </Section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
