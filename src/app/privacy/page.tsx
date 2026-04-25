import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import AppImg from "@/components/AppImg";
import PrivacyBackButton from "./PrivacyBackButton";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Read the TaskLaunch privacy policy, including how account data, app data, billing data, push notifications, feedback, and launch-update subscriptions are handled.",
  alternates: {
    canonical: "/privacy",
  },
};

function PolicySection({
  id,
  number,
  title,
  children,
}: {
  id?: string;
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="privacyLandingSection" id={id}>
      <div className="landingV2SectionLabel">
        <span className="landingV2SectionIndex displayFont">{String(number).padStart(2, "0")}</span>
        <span className="landingV2SectionLine" />
        <span className="landingV2SectionName">{title}</span>
      </div>
      <div className="privacyLandingContent">{children}</div>
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
    <div className="privacyLandingClause">
      <span className="privacyLandingClauseKey">({letter})</span>
      <div>{children}</div>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="landingV2 privacyLandingPage">
      <div className="landingV2Shell">
        <header className="landingV2Header isVisible">
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/launch-icon-original-transparent.png" alt="" className="landingV2HeaderBrandIcon" />
            <span>TaskLaunch</span>
          </Link>

          <div className="landingV2HeaderActions">
            <PrivacyBackButton />
          </div>
        </header>

        <section className="landingV2Hero isVisible" aria-label="TaskLaunch privacy policy hero">
          <div className="landingV2Grid" aria-hidden="true" />
          <div className="landingV2HeroMain">
            <div className="landingV2HeroTag">
              <span className="landingV2HeroTagDot" />
              <span>TASKLAUNCH</span>
            </div>

            <h1 className="landingV2HeroTitle displayFont">Privacy Policy</h1>

            <p className="landingV2HeroCopy">UPDATED: APRIL 21, 2026</p>
          </div>
        </section>

        <section className="privacyLandingSection">
          <div className="landingV2SectionLabel">
            <span className="landingV2SectionIndex displayFont">00</span>
            <span className="landingV2SectionLine" />
            <span className="landingV2SectionName">Table of contents</span>
          </div>
          <ul className="privacyLandingToc">
            {[
              ["#introduction", "01", "Introduction"],
              ["#what-information-we-collect", "02", "What information we collect"],
              ["#how-we-collect-information", "03", "How we collect information"],
              ["#local-storage-and-session-storage", "04", "Local storage and session storage"],
              ["#cloud-storage-and-app-infrastructure", "05", "Cloud storage and app infrastructure"],
              ["#how-we-use-information", "06", "How we use information"],
              ["#third-party-services-and-processors", "07", "Third-party services and processors"],
              ["#sharing-and-disclosure", "08", "Sharing and disclosure"],
              ["#push-notifications", "09", "Push notifications"],
              ["#billing-and-subscriptions", "10", "Billing and subscriptions"],
              ["#feedback-and-issue-tracking", "11", "Feedback and issue tracking"],
              ["#launch-updates-subscription-list", "12", "Launch-updates subscription list"],
              ["#overseas-and-cross-border-handling", "13", "Overseas and cross-border handling"],
              ["#security-safeguards", "14", "Security safeguards"],
              ["#retention-and-deletion", "15", "Retention and deletion"],
              ["#your-choices-access-and-correction", "16", "Your choices, access, and correction"],
              ["#account-deletion-and-local-reset-guidance", "17", "Account deletion and local reset guidance"],
              ["#children", "18", "Children"],
              ["#policy-updates", "19", "Policy updates"],
              ["#contact", "20", "Contact"],
            ].map(([href, number, label]) => (
              <li key={href}>
                <a href={href} className="privacyLandingTocLink">
                  <span className="landingV2SectionIndex displayFont">{number}</span>
                  <span className="landingV2SectionLine" />
                  <span className="landingV2SectionName">{label}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div className="privacyLandingBody">
          <PolicySection id="introduction" number={1} title="Introduction">
            <p>
              This Privacy Policy applies to TaskLaunch features made available through{" "}
              <a href="https://tasklaunch.app" target="_blank" rel="noreferrer">
                tasklaunch.app
              </a>{" "}
              and the related signed-in app experience. It is written to describe the information-handling behavior
              that can be inferred from the current codebase and deployed product flows.
            </p>
            <p>
              TaskLaunch currently includes a public website, authenticated task and dashboard features, settings and
              account controls, social and sharing features, push notifications, feedback submission tools, Stripe
              billing flows, and a launch-updates signup form. Different features handle different categories of data.
            </p>
          </PolicySection>

          <PolicySection id="what-information-we-collect" number={2} title="What information we collect">
            <div className="privacyLandingStack">
              <Clause letter="a">
                Sign-in and account details such as Firebase Authentication identifiers, email address, and Google
                account profile details returned during Google sign-in.
              </Clause>
              <Clause letter="b">
                Profile and account customisation data such as display name, username, username reservation data,
                avatar selections, uploaded custom avatar data, and rank thumbnail information shown in the app.
              </Clause>
              <Clause letter="c">
                Task and productivity data such as tasks, timers, milestones, time goals, notes, task history, deleted
                task records, dashboard state, schedule data, reward progress, and related app preferences.
              </Clause>
              <Clause letter="d">
                Social data such as friend requests, friendship records, and shared task summary records when you use
                friends or sharing features.
              </Clause>
              <Clause letter="e">
                Device and notification data such as push registration tokens, device identifiers, platform markers,
                app-active state, and push preference settings when notification features are enabled.
              </Clause>
              <Clause letter="f">
                Billing data such as Stripe customer IDs, subscription IDs, price IDs, subscription status, and related
                entitlement or retention records used to manage paid access.
              </Clause>
              <Clause letter="g">
                Feedback data such as feedback title, message content, attached PNG screenshots, vote records, and
                author-related fields unless feedback is submitted anonymously.
              </Clause>
              <Clause letter="h">
                Launch-updates signup data such as email address, normalized email, request source, user-agent, and
                referrer captured when the public signup form is used.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection id="how-we-collect-information" number={3} title="How we collect information">
            <div className="privacyLandingStack" id="collection">
              <Clause letter="a">
                Directly from you when you sign in, edit profile settings, create and manage tasks, use social
                features, configure notifications, submit feedback, start billing flows, or join the launch-updates
                list.
              </Clause>
              <Clause letter="b">
                Automatically through app runtime behavior such as local storage, session storage, Firebase client
                state, push registration, and cloud sync between the signed-in client and backend services.
              </Clause>
              <Clause letter="c">
                From service providers that support the product, including Firebase Authentication, Cloud Firestore,
                Google sign-in flows, Firebase Cloud Messaging, Stripe, and optional Jira mirroring for feedback.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection id="local-storage-and-session-storage" number={4} title="Local storage and session storage">
            <p>
              TaskLaunch stores a substantial amount of runtime data locally on your browser or device. Based on the
              current implementation, this primarily includes browser or device-local storage mechanisms such as local
              storage, session storage where applicable, and IndexedDB-backed persistence. This can include task state,
              history-related state, navigation state, theme and menu style preferences, notification preferences,
              pending push action state, mode settings, and other app behavior needed to continue the user experience
              on the same device.
            </p>
            <p>
              Session storage is also used for short-lived browser behavior, including signed-out redirect bypass
              handling and related auth transition state. Current web auth persistence also relies on browser-local
              persistence and IndexedDB-backed state. TaskLaunch does not treat cookies as its primary app storage
              layer, but some authentication, security, or abuse-prevention services used with the product may use
              cookies or similar technologies under their own implementations. Local data can remain on your device
              until you clear it, reset app data, clear browser storage, or uninstall the app.
            </p>
          </PolicySection>

          <PolicySection id="cloud-storage-and-app-infrastructure" number={5} title="Cloud storage and app infrastructure">
            <p>
              When you sign in, TaskLaunch uses Firebase services to support account access and cloud-backed app
              features. Current code paths show Firebase Authentication for sign-in and Cloud Firestore for many
              account, task, feedback, subscription, social, and notification-related records. Current web
              implementation also initializes Firebase App Check with reCAPTCHA Enterprise for security and abuse
              prevention support.
            </p>
            <div className="privacyLandingStack">
              <Clause letter="a">Firebase Authentication is used for email-link sign-in and Google sign-in.</Clause>
              <Clause letter="b">
                Cloud Firestore records can include user profile fields, tasks, task history, deleted task data,
                preferences, friend and sharing records, feedback items, feedback limit records, push device records,
                subscription records, and launch-updates signup records.
              </Clause>
              <Clause letter="c">
                Some additional records are created to support account integrity and lookup behavior, including username
                reservation records and user email lookup records.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection id="how-we-use-information" number={6} title="How we use information">
            <div className="privacyLandingStack" id="use">
              <Clause letter="a">To sign users in, keep sessions working, and provide access to account-backed features.</Clause>
              <Clause letter="b">
                To operate app functionality such as tasks, timing, dashboard views, preferences, history, scheduling,
                rewards, friends, and shared task summaries.
              </Clause>
              <Clause letter="c">
                To register devices, store push settings, and send notification traffic where those features are
                enabled.
              </Clause>
              <Clause letter="d">
                To start and manage subscription checkout, billing portal sessions, entitlement state, and subscription
                retention logic tied to Stripe-backed billing.
              </Clause>
              <Clause letter="e">
                To receive and manage feedback, apply submission and voting limits, and optionally mirror feedback into
                Jira when that integration is enabled.
              </Clause>
              <Clause letter="f">
                To operate the launch-updates signup list and prevent duplicate subscriptions to that list.
              </Clause>
              <Clause letter="g">
                To support account deletion, cloud cleanup, abuse controls, and other integrity or operational checks
                implemented in the app and backend routes.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection id="third-party-services-and-processors" number={7} title="Third-party services and processors">
            <div className="privacyLandingStack">
              <Clause letter="a">
                Google and Firebase are used for authentication, data storage, app infrastructure, and push delivery
                support.
              </Clause>
              <Clause letter="b">
                Stripe is used for subscription checkout, customer records, billing portal access, and subscription
                lifecycle events.
              </Clause>
              <Clause letter="c">
                Atlassian Jira may receive mirrored feedback details and screenshot attachments when Jira integration is
                configured and working.
              </Clause>
              <Clause letter="d">
                Platform push delivery services may be involved when Firebase Cloud Messaging sends notifications to
                supported web or mobile devices.
              </Clause>
            </div>
            <p>
              These services help operate TaskLaunch features. This page only describes their use as they appear in the
              current product code and does not replace the separate terms or privacy policies of those providers.
              Third-party services used for authentication, security, billing, or issue tracking may also use cookies
              or similar technologies under their own implementations.
            </p>
          </PolicySection>

          <PolicySection id="sharing-and-disclosure" number={8} title="Sharing and disclosure">
            <div className="privacyLandingStack">
              <Clause letter="a">
                Information may be shared with service providers that support authentication, hosting, storage,
                notifications, billing, and feedback processing.
              </Clause>
              <Clause letter="b">
                If you use friends or sharing features, some profile and task-summary information can be visible to
                users connected through those features.
              </Clause>
              <Clause letter="c">
                Information may also be disclosed when needed to enforce product integrity, respond to misuse, satisfy
                legal requirements, or complete account deletion and subscription-management workflows.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection id="push-notifications" number={9} title="Push notifications">
            <p>
              If you enable web or mobile push notifications, TaskLaunch can store per-device records under your
              account, including token values, device IDs, provider information, native-or-web indicators, app-active
              state, and timestamps used for delivery logic.
            </p>
            <p>
              Push preference settings are also stored so the app can determine whether mobile or web push should be
              used. If you disable notifications or remove access at the device level, future notifications may stop,
              but notifications already delivered to your device remain under that device&apos;s own controls.
            </p>
          </PolicySection>

          <PolicySection id="billing-and-subscriptions" number={10} title="Billing and subscriptions">
            <div id="billing" />
            <p>
              If you use paid subscription features, TaskLaunch can create Stripe checkout sessions and Stripe billing
              portal sessions tied to your account. The application stores subscription-related identifiers and status
              fields needed to determine entitlement and preserve subscription access during some account-deletion
              flows.
            </p>
            <p>
              Current code supports storage of Stripe customer IDs, subscription IDs, price IDs, status fields, and
              related subscription timing fields. TaskLaunch does not intentionally store full payment card details on
              its own servers.
            </p>
          </PolicySection>

          <PolicySection id="feedback-and-issue-tracking" number={11} title="Feedback and issue tracking">
            <div id="feedback" />
            <p>
              If you submit feedback, TaskLaunch stores the feedback title and message, and it can also accept PNG
              screenshot attachments. Depending on whether you submit anonymously, related author data can include your
              email address, display name, rank thumbnail, and current rank ID.
            </p>
            <p>
              The current implementation also records vote activity and submission-rate controls. When Jira mirroring is
              configured, the app may create or update a Jira issue and upload screenshot attachments there as well.
            </p>
          </PolicySection>

          <PolicySection id="launch-updates-subscription-list" number={12} title="Launch-updates subscription list">
            <div id="launch-updates" />
            <p>
              The public launch-updates signup form stores the submitted email address and a normalized copy of that
              address in Cloud Firestore. The current backend also records the request source, user-agent, referrer,
              and created/updated timestamps for that signup entry.
            </p>
            <p>
              This data is used to manage the launch-updates list and reduce duplicate entries. This section describes
              the current signup implementation only and should not be read as a promise of broader marketing practices.
            </p>
          </PolicySection>

          <PolicySection id="overseas-and-cross-border-handling" number={13} title="Overseas and cross-border handling">
            <p>
              TaskLaunch relies on third-party infrastructure providers whose systems can operate across multiple
              countries. Because Firebase, Stripe, and related provider systems may process or store data outside the
              country where you use the app, some information may be handled on cross-border infrastructure.
            </p>
          </PolicySection>

          <PolicySection id="security-safeguards" number={14} title="Security safeguards">
            <p>
              The product uses managed authentication, hosted infrastructure, and service-level access controls offered
              by the providers integrated into the app. The codebase also includes account verification, authenticated
              API routes, and deletion flows intended to limit unauthorized access to account data.
            </p>
            <p>
              No internet-connected service can guarantee absolute security. You should also protect your own devices,
              sign-in methods, and browser or app environment.
            </p>
          </PolicySection>

          <PolicySection id="retention-and-deletion" number={15} title="Retention and deletion">
            <div id="retention" />
            <div className="privacyLandingStack">
              <Clause letter="a">
                Local device data can remain until you reset the app, clear browser or device storage, or uninstall the
                app.
              </Clause>
              <Clause letter="b">
                Cloud-backed account data can remain while needed to operate the signed-in product, maintain
                subscriptions, enforce rate limits, support feedback workflows, or complete deletion and integrity
                operations.
              </Clause>
              <Clause letter="c">
                Launch-updates signup records can remain while needed to manage that signup list.
              </Clause>
              <Clause letter="d">
                Current account-deletion code removes cloud-backed user records including user data, subscription
                records, friend requests, friendships, shared task summaries, authored feedback, feedback votes,
                feedback limits, scheduled push records, usernames, and user email lookup records.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection id="your-choices-access-and-correction" number={16} title="Your choices, access, and correction">
            <div className="privacyLandingStack" id="rights">
              <Clause letter="a">
                You can update some account and profile details inside the app, including username and avatar-related
                settings.
              </Clause>
              <Clause letter="b">
                You can control web and mobile push preferences inside the app where those features are available.
              </Clause>
              <Clause letter="c">
                You can delete your account from <strong>Settings &gt; Account &gt; Delete Account</strong>.
              </Clause>
              <Clause letter="d">
                You can reset local app data from <strong>Settings &gt; Reset All Data</strong>.
              </Clause>
              <Clause letter="e">
                If you need help correcting data, understanding deletion behavior, or raising a privacy question, use
                the contact details shown below.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection id="account-deletion-and-local-reset-guidance" number={17} title="Account deletion and local reset guidance">
            <p>
              The current account-deletion flow removes the Firebase Authentication account and then calls backend
              cleanup routes to delete cloud-backed records tied to that account. The app also includes logic to retain
              some subscription access information before deletion when an active subscription exists.
            </p>
            <p>
              Local app data on your device is separate from cloud deletion. If you want to remove locally stored task
              and preference data from the same device, use <strong>Settings &gt; Reset All Data</strong> in addition
              to any account-deletion action.
            </p>
          </PolicySection>

          <PolicySection id="children" number={18} title="Children">
            <p>
              The current codebase does not indicate that TaskLaunch is designed as a children&apos;s product. If you
              believe personal information relating to a child has been submitted through the product, contact TaskLaunch
              using the address below so the issue can be reviewed.
            </p>
          </PolicySection>

          <PolicySection id="policy-updates" number={19} title="Policy updates">
            <p>
              This page may be updated as product behavior, integrations, or data flows change. When updates are made,
              the revised version will be posted on this page.
            </p>
          </PolicySection>

          <PolicySection id="contact" number={20} title="Contact">
            <p>
              For privacy questions, deletion help, or requests relating to information handled by the current
              TaskLaunch product, contact <strong>support@tasklaunch.app</strong>.
            </p>
          </PolicySection>
        </div>
      </div>
    </main>
  );
}
