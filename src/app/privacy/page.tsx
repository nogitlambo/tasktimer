import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import AppImg from "@/components/AppImg";
import PrivacyBackButton from "./PrivacyBackButton";

const EFFECTIVE_DATE = "April 18, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Read the TaskLaunch privacy policy, including how account data, app data, billing data, push notifications, feedback, and launch-update subscriptions are handled.",
  alternates: {
    canonical: "/privacy",
  },
};

function PolicySection({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="privacyLandingSection">
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
          <Link href="/" className="landingV2Brand" aria-label="TaskLaunch home">
            <AppImg src="/logo/tasklaunch-logo-v2.png" alt="TaskLaunch" className="landingV2BrandLogo" />
          </Link>

          <div className="landingV2HeaderActions">
            <Link href="/" className="landingV2HeaderLink">
              Home
            </Link>
            <PrivacyBackButton />
          </div>
        </header>

        <section className="landingV2Hero isVisible" aria-label="TaskLaunch privacy policy hero">
          <div className="landingV2Grid" aria-hidden="true" />
          <div className="landingV2HeroMain">
            <div className="landingV2HeroTag">
              <span className="landingV2HeroTagDot" />
              <span>Legal</span>
            </div>

            <h1 className="landingV2HeroTitle displayFont">Privacy Policy</h1>

            <p className="landingV2HeroCopy">
              This policy explains how TaskLaunch collects, stores, uses, shares, and protects personal information
              across the public website, the signed-in app, and the coming-soon launch-updates form.
            </p>

            <div className="privacyLandingMeta">
              <div className="privacyLandingMetaCard">
                <span className="privacyLandingMetaLabel">Effective date</span>
                <strong>{EFFECTIVE_DATE}</strong>
              </div>
              <div className="privacyLandingMetaCard">
                <span className="privacyLandingMetaLabel">Primary region</span>
                <strong>Australia-first</strong>
              </div>
              <div className="privacyLandingMetaCard">
                <span className="privacyLandingMetaLabel">Contact</span>
                <strong>aniven82@gmail.com</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="privacyLandingSection">
          <div className="landingV2SectionLabel">
            <span className="landingV2SectionIndex displayFont">00</span>
            <span className="landingV2SectionLine" />
            <span className="landingV2SectionName">Table of contents</span>
          </div>
          <div className="privacyLandingToc">
            {[
              ["#collection", "Collection and storage"],
              ["#use", "Use and disclosures"],
              ["#rights", "Your choices and rights"],
              ["#billing", "Billing and subscriptions"],
              ["#feedback", "Feedback and issue tracking"],
              ["#launch-updates", "Launch-updates signup"],
              ["#retention", "Retention and deletion"],
              ["#contact", "Contact"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="privacyLandingTocLink displayFont">
                {label}
              </a>
            ))}
          </div>
        </section>

        <div className="privacyLandingBody">
          <PolicySection number={1} title="Introduction">
            <p>
              This Privacy Policy applies to TaskLaunch and related services available through{" "}
              <a href="https://tasklaunch.app" target="_blank" rel="noreferrer">
                tasklaunch.app
              </a>
              . TaskLaunch is a task timing, history, productivity, and account-based app. This policy is written with
              Australian privacy expectations in mind and describes our current information-handling practices.
            </p>
            <p>
              TaskLaunch includes a public website, a signed-in app experience, optional social features, a public
              launch-updates signup form, subscription billing flows, feedback submission flows, and push notification
              features. Different parts of the product collect different information.
            </p>
          </PolicySection>

          <PolicySection number={2} title="What information we collect">
            <div className="privacyLandingStack">
              <Clause letter="a">
                Account and identity details such as email address, Firebase Authentication identifiers, and basic
                Google sign-in profile information where you use Google sign-in.
              </Clause>
              <Clause letter="b">
                Profile data such as display name, username, avatar selections, custom avatar information, rank
                thumbnail data, and related account customisation fields.
              </Clause>
              <Clause letter="c">
                App content and activity such as tasks, timers, milestones, time goals, session notes, task history,
                deleted-task data, dashboard state, task UI state, and preferences.
              </Clause>
              <Clause letter="d">
                Social feature data such as friend requests, friendship records, and shared task summary data when you
                choose to use those features.
              </Clause>
              <Clause letter="e">
                Device and notification data such as push tokens, web push tokens, device identifiers, platform data,
                app-active state, and notification preferences where push functionality is enabled.
              </Clause>
              <Clause letter="f">
                Billing data such as Stripe customer identifiers, subscription identifiers, subscription plan/status
                fields, and checkout or retention-related billing records.
              </Clause>
              <Clause letter="g">
                Feedback and support data such as feedback titles, messages, optional screenshots, vote activity,
                author profile details, and mirrored issue-tracking details where Jira integration is enabled.
              </Clause>
              <Clause letter="h">
                Launch-updates subscription data from the public coming-soon page, including email address, normalized
                email, and limited request metadata such as user-agent and referrer.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection number={3} title="How we collect information">
            <div className="privacyLandingStack" id="collection">
              <Clause letter="a">
                Directly from you when you sign in, edit your profile, create tasks, manage preferences, use friends or
                shared task features, submit feedback, subscribe for launch updates, or interact with billing flows.
              </Clause>
              <Clause letter="b">
                Automatically from app runtime and storage behaviour, including local storage, session storage, app
                state storage, device registration flows, and push-notification registration flows.
              </Clause>
              <Clause letter="c">
                From third-party service providers used to operate the service, including Firebase Authentication,
                Cloud Firestore, Google sign-in flows, Stripe billing, and Jira issue mirroring when those integrations
                are active.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection number={4} title="Local storage and session storage">
            <p>
              TaskLaunch stores a substantial amount of runtime data locally on your device or browser. This can
              include tasks, history, preferences, navigation state, theme settings, menu style settings, push-related
              pending actions, account-related temporary state, and other data required to operate the app.
            </p>
            <p>
              We also use session storage for short-lived session or redirect-handling behaviour, such as signed-out
              redirect bypass handling. Local device storage may remain on your device until you clear it, reset app
              data, or uninstall the app.
            </p>
          </PolicySection>

          <PolicySection number={5} title="Cloud storage and app infrastructure">
            <p>
              When you sign in, TaskLaunch uses Firebase services, including Firebase Authentication and Cloud
              Firestore, to associate app data with your account and support signed-in product features.
            </p>
            <div className="privacyLandingStack">
              <Clause letter="a">Firebase Authentication is used for email-link sign-in and Google sign-in.</Clause>
              <Clause letter="b">
                Cloud Firestore may store profile records, preferences, dashboard and task UI state, tasks, task
                history, deleted-task records, social data, feedback-related records, device records for push
                notifications, and launch-updates subscription records.
              </Clause>
              <Clause letter="c">
                Some cloud-backed records are created to protect account integrity, such as username reservations and
                email lookup records.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection number={6} title="How we use information">
            <div className="privacyLandingStack" id="use">
              <Clause letter="a">To authenticate users and provide account access.</Clause>
              <Clause letter="b">
                To provide app functionality such as task timing, history, dashboard, preferences, rewards, and social
                or sharing features.
              </Clause>
              <Clause letter="c">
                To enable device registration and delivery of push notifications where you choose to enable them.
              </Clause>
              <Clause letter="d">
                To operate subscription billing, customer portal access, trial handling, subscription retention, and
                related payment administration.
              </Clause>
              <Clause letter="e">
                To receive, review, store, and respond to feedback or support submissions and, where enabled, mirror
                relevant feedback content into Jira.
              </Clause>
              <Clause letter="f">
                To manage the public coming-soon launch-updates list and send release-related communications if that
                list is used for launch updates.
              </Clause>
              <Clause letter="g">
                To protect the integrity of the service, limit abuse, enforce rate limits, resolve account conflicts,
                and comply with legal obligations.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection number={7} title="Third-party services and processors">
            <div className="privacyLandingStack">
              <Clause letter="a">
                Google and Firebase, for authentication, Cloud Firestore storage, and related platform services.
              </Clause>
              <Clause letter="b">
                Stripe, for subscription checkout, billing portal sessions, customer records, subscription state, and
                related payment administration.
              </Clause>
              <Clause letter="c">
                Atlassian Jira, where enabled, for mirroring feedback submissions and attachments into issue-tracking
                workflows.
              </Clause>
              <Clause letter="d">
                Notification delivery infrastructure used through Firebase Cloud Messaging and platform push services
                where push notifications are enabled.
              </Clause>
            </div>
            <p>
              These providers may process personal information on our behalf to help operate TaskLaunch. We do not sell
              personal information and we do not intentionally use personal information for third-party advertising or
              ad targeting.
            </p>
          </PolicySection>

          <PolicySection number={8} title="Sharing and disclosure">
            <div className="privacyLandingStack">
              <Clause letter="a">
                We may share information with service providers that help us run the service, as described above.
              </Clause>
              <Clause letter="b">
                If you use social or sharing features, some profile and task-summary information may be visible to
                other users you choose to connect with.
              </Clause>
              <Clause letter="c">
                We may disclose information where required or authorised by law, or where reasonably necessary to
                protect rights, safety, platform integrity, or investigate misuse.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection number={9} title="Push notifications">
            <p>
              If you enable mobile or web push notifications, TaskLaunch may store device registration records,
              notification tokens, device identifiers, platform information, app-active state, and notification
              preference settings to support sending and managing notifications.
            </p>
            <p>
              You can control push preferences inside the app. Disabling push notifications or removing device
              registrations may stop future notifications, but previously delivered notifications remain on your device
              until you clear them yourself.
            </p>
          </PolicySection>

          <PolicySection number={10} title="Billing and subscriptions">
            <div id="billing" />
            <p>
              If you start or manage a paid subscription, TaskLaunch uses Stripe for checkout, billing portal access,
              customer management, and subscription state handling. We may store related billing identifiers and plan
              status information in our own records to enable entitlement and account management.
            </p>
            <p>
              TaskLaunch does not intentionally store your full payment card details on its own servers. Payment
              processing is handled by Stripe under Stripe&apos;s own terms and privacy practices.
            </p>
          </PolicySection>

          <PolicySection number={11} title="Feedback and issue tracking">
            <div id="feedback" />
            <p>
              If you submit feedback, we may collect the content you submit, your account or author details, optional
              screenshots, and feedback vote activity. Where Jira integration is enabled, relevant feedback details and
              attachments may also be mirrored into Jira for product triage and support workflows.
            </p>
          </PolicySection>

          <PolicySection number={12} title="Launch-updates subscription list">
            <div id="launch-updates" />
            <p>
              The public coming-soon page includes a launch-updates signup form. If you submit your email through that
              form, TaskLaunch stores your email address, a normalized email value used for deduplication, and limited
              request metadata such as user-agent and referrer in Cloud Firestore.
            </p>
            <p>
              We use this information to manage the launch-updates list and avoid duplicate subscriptions. This policy
              does not promise general-purpose marketing communications beyond launch-related updates supported by that
              list.
            </p>
          </PolicySection>

          <PolicySection number={13} title="Overseas and cross-border handling">
            <p>
              TaskLaunch uses service providers whose systems may operate in more than one country. As a result,
              personal information may be processed, stored, or made accessible outside Australia, including through
              cloud infrastructure and service-provider systems used to operate authentication, storage, notifications,
              billing, and issue tracking.
            </p>
          </PolicySection>

          <PolicySection number={14} title="Security safeguards">
            <p>
              We take reasonable steps in the circumstances to protect the personal information we hold from misuse,
              interference, loss, and unauthorised access, modification, or disclosure. These steps include using
              hosted cloud services, account authentication controls, managed platform services, and service-level
              access controls appropriate to the current product.
            </p>
            <p>
              No internet or cloud-based service can guarantee absolute security, and you should also take care to
              protect your own devices, browsers, passwords, and sign-in methods.
            </p>
          </PolicySection>

          <PolicySection number={15} title="Retention and deletion">
            <div id="retention" />
            <div className="privacyLandingStack">
              <Clause letter="a">
                Local device data may remain on your device until you clear it, reset data, or uninstall the app.
              </Clause>
              <Clause letter="b">
                Signed-in cloud data may be retained while needed to operate the service, manage subscriptions,
                maintain service integrity, respond to support or legal issues, or comply with legal requirements.
              </Clause>
              <Clause letter="c">
                Coming-soon subscription records may be retained while needed to manage launch updates or related list
                administration.
              </Clause>
              <Clause letter="d">
                When information is no longer reasonably needed, we may delete it or de-identify it where practical,
                subject to operational and legal requirements.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection number={16} title="Your choices, access, and correction">
            <div className="privacyLandingStack" id="rights">
              <Clause letter="a">
                You can update some account, profile, and preference information directly inside the app.
              </Clause>
              <Clause letter="b">
                You can control push-notification settings inside the app where those features are available.
              </Clause>
              <Clause letter="c">
                You can delete your account from <strong>Settings &gt; Account &gt; Delete Account</strong>.
              </Clause>
              <Clause letter="d">
                You can clear local app data through <strong>Settings &gt; Reset All Data</strong>.
              </Clause>
              <Clause letter="e">
                If you want to request access to or correction of personal information we hold, or you need help with
                deletion or data questions, contact us using the details below.
              </Clause>
            </div>
          </PolicySection>

          <PolicySection number={17} title="Account deletion and local reset guidance">
            <p>
              If you signed in to TaskLaunch, you can request account deletion inside the app from{" "}
              <strong>Settings &gt; Account &gt; Delete Account</strong>. Deleting the signed-in account removes the
              Firebase Authentication account used by TaskLaunch and clears the app&apos;s account-state deletion marker
              used during the delete flow.
            </p>
            <p>
              Local task and history data stored on your device is separate and is not automatically removed when the
              signed-in account is deleted. You can separately clear local data through{" "}
              <strong>Settings &gt; Reset All Data</strong>. If you cannot access the app or need help with deletion,
              email <strong>aniven82@gmail.com</strong> and include the email address used for sign-in.
            </p>
          </PolicySection>

          <PolicySection number={18} title="Children">
            <p>
              TaskLaunch is not intended for children under 13, and we do not knowingly design the service for use by
              children as a child-directed product. If you believe a child has provided personal information to
              TaskLaunch, contact us so we can review the issue.
            </p>
          </PolicySection>

          <PolicySection number={19} title="Policy updates">
            <p>
              We may update this Privacy Policy from time to time to reflect product changes, operational changes,
              legal developments, or changes in service providers. When we update this policy, we will change the
              effective date shown on this page.
            </p>
          </PolicySection>

          <PolicySection number={20} title="Contact">
            <div id="contact" />
            <p>
              For privacy questions, data requests, correction requests, deletion help, or general privacy concerns,
              contact <strong>aniven82@gmail.com</strong>.
            </p>
          </PolicySection>
        </div>
      </div>
    </main>
  );
}
