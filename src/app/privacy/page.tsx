import PrivacyBackButton from "./PrivacyBackButton";

const EFFECTIVE_DATE = "March 20, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#0d0f13] px-6 py-10 [font-family:var(--font-geist-sans)] text-white">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="displayFont [font-family:var(--font-orbitron)] text-2xl font-bold tracking-tight">
            TaskLaunch Privacy Policy
          </h1>
          <PrivacyBackButton />
        </div>
        <p className="mb-6 text-sm text-white/70">Effective date: {EFFECTIVE_DATE}</p>

        <div className="space-y-5 text-sm leading-6 text-white/90">
          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              Summary
            </h2>
            <p>
              TaskLaunch is a task timing, history, and productivity app. Most task, timer, settings, and history data
              can be stored locally on your device. If you sign in, TaskLaunch also uses Firebase Authentication and
              Cloud Firestore to provide account features, cloud-backed app data, and optional social features such as
              friends and shared task summaries.
            </p>
          </section>

          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              Data We Collect
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Email address and sign-in details used for email-link sign-in or Google sign-in.</li>
              <li>
                Profile data you provide or choose to use, such as username, alias, avatar selection, custom avatar,
                Google profile photo, rank thumbnail, and related reward or rank progress fields.
              </li>
              <li>Task, timer, time-goal, checkpoint, milestone, session-note, history, and deleted-task data.</li>
              <li>Preferences and app state such as theme, menu style, notification settings, dashboard layout, task UI state, and mode settings.</li>
              <li>
                Social feature data such as friend invite keys, friend requests, friendship profile information, and
                shared task summary data when you choose to use those features.
              </li>
              <li>
                Feedback form entries you type into the app, such as email address, feedback type, and message content,
                if and when submission handling is enabled.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              Local Device Storage
            </h2>
            <p>
              TaskLaunch stores a substantial amount of app data locally on your device or browser storage, including
              tasks, timers, history, preferences, mode settings, dashboard and task UI state, draft notes, avatar
              selections, and other runtime settings needed to operate the app.
            </p>
          </section>

          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              Cloud Storage When Signed In
            </h2>
            <p>When you sign in, TaskLaunch may store data in Firebase services, including Cloud Firestore, such as:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>User profile records, including email, display name, username, avatar fields, and reward profile fields.</li>
              <li>Preferences, dashboard, task UI, and account-state documents.</li>
              <li>Tasks, task history entries, and deleted-task records.</li>
              <li>Username reservation records and user email lookup records.</li>
              <li>Friend requests, friendship records, and friendship profile data.</li>
              <li>Shared task summary records for optional sharing features.</li>
            </ul>
          </section>

          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              How We Use Data
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>To authenticate users and keep account sessions active.</li>
              <li>To provide task timing, history, settings, rewards, and related app features.</li>
              <li>To sync signed-in app data across supported usage flows.</li>
              <li>To support optional friend, profile, and shared-task features that you choose to use.</li>
              <li>To display your selected profile, avatar, and reward customization within the app.</li>
              <li>To protect service integrity, manage usernames, and prevent account or profile conflicts.</li>
              <li>To review and respond to support or feedback submissions if submission handling is enabled.</li>
            </ul>
          </section>

          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              How Data Is Shared
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>With Firebase and Google as service providers for authentication and cloud infrastructure.</li>
              <li>
                With other users you choose to connect with through the app, including friendship profile information
                and shared task summary information.
              </li>
              <li>With legal or regulatory authorities if disclosure is required by law or to protect rights and safety.</li>
            </ul>
            <p className="mt-2">
              TaskLaunch does not sell personal information and does not intentionally use personal data for advertising
              or ad targeting.
            </p>
          </section>

          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              Data Visible To Other Users
            </h2>
            <p>
              If you use friends or sharing features, other users you connect with may see profile-related information
              such as your alias, avatar selection, custom avatar, Google profile photo if chosen for use in-app, rank
              thumbnail, current rank identifier, and shared task summary information you choose to make available
              through those features.
            </p>
          </section>

          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              Authentication
            </h2>
            <p>
              TaskLaunch supports email-link sign-in and Google sign-in through Firebase Authentication. If you sign in
              with Google, TaskLaunch may access basic Google account profile information made available through the
              sign-in flow, such as your email address, display name, and profile photo.
            </p>
          </section>

          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              Ads
            </h2>
            <p>
              TaskLaunch does not contain ads. The app is not designed to serve third-party advertising, and it does
              not intentionally collect or use personal data for advertising or advertising personalization.
            </p>
          </section>

          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              Account Deletion and Local Data Reset
            </h2>
            <p>
              If you signed in to TaskLaunch, you can request account deletion in the app from{" "}
              <strong>Settings &gt; Account &gt; Delete Account</strong>.
            </p>
            <p className="mt-2">
              Deleting the signed-in account removes the Firebase Authentication account used by TaskLaunch. Local data
              stored on your device is separate and is not automatically removed when the signed-in account is deleted.
              Local device data can be cleared separately using <strong>Settings &gt; Reset All Data</strong>.
            </p>
          </section>

          <section>
            <h2 className="displayFont mb-2 [font-family:var(--font-orbitron)] text-base font-semibold text-white">
              Contact
            </h2>
            <p>
              For privacy questions, data requests, or support, contact <strong>aniven82@gmail.com</strong>.
            </p>
            <p className="mt-2">
              You may also use the in-app <strong>Settings &gt; Feedback</strong> screen for general support requests.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
