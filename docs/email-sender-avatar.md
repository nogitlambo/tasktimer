# Email Sender Avatar

The early access confirmation email can include the TaskLaunch logo inside the HTML body, but the app cannot directly set the sender profile image shown in recipient inbox lists through Nodemailer.

For an inbox-level sender avatar, use a mail-provider or BIMI setup for `tasklaunch.app`:

- Confirm SPF, DKIM, and DMARC are valid for the sending domain.
- Set DMARC to an enforced policy accepted by target mailbox providers.
- Prepare a BIMI-compatible SVG Tiny PS version of the logo. The PNG at `public/logo/launch-icon-original-transparent.png` cannot be used directly for BIMI.
- Host the BIMI SVG over HTTPS.
- Publish a TXT record at `default._bimi.tasklaunch.app`.
- Add a VMC or CMC certificate URL when required by the mailbox provider, including Gmail.

References:

- https://bimigroup.org/implementation-guide/
- https://support.google.com/a/answer/10911320
