import PrivacyBackButton from "./PrivacyBackButton";

const EFFECTIVE_DATE = "February 26, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#0d0f13] px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">TaskTimer Privacy Policy</h1>
          <PrivacyBackButton />
        </div>
        <p className="mb-6 text-sm text-white/70">Effective date: {EFFECTIVE_DATE}</p>

        <div className="space-y-5 text-sm leading-6 text-white/90">
          <section>
            <h2 className="mb-2 text-base font-semibold text-white">Summary</h2>
            <p>
              TaskTimer is a task timing and history tracking app. Most timer, task, settings, and history data is
              stored locally on your device. If you choose to sign in, TaskTimer uses Firebase Authentication to manage
              your sign-in account.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">Data We Process</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Sign-in data you provide for authentication (for example, email address or Google sign-in).</li>
              <li>Task, timer, mode, and history data stored locally on your device.</li>
              <li>Basic profile fields you choose to set, such as alias and avatar selection.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">How Data Is Used</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>To authenticate you and keep your session active when you sign in.</li>
              <li>To provide task timing, history, and settings features.</li>
              <li>To store local preferences (theme, modes, notifications, and related app settings).</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">Storage and Sharing</h2>
            <p>
              TaskTimer stores most app data locally on your device using browser/WebView storage. Authentication is
              handled through Firebase Authentication. TaskTimer does not sell your personal data.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">Account Deletion</h2>
            <p>
              If you signed in to TaskTimer, you can delete your sign-in account in the app from{" "}
              <strong>Settings &gt; Account &gt; Delete Account</strong>.
            </p>
            <p className="mt-2">
              Deleting the sign-in account removes the Firebase Authentication account used by TaskTimer. Local task and
              history data stored on your device is not automatically removed by account deletion. You can remove local
              device data separately using <strong>Settings &gt; Reset All</strong>.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">Contact</h2>
            <p>
              For privacy or support questions, use the in-app <strong>Settings &gt; Feedback</strong> screen.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
