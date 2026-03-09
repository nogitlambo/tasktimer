export type LandingExperimentalProps = {
  showTitlePhase: boolean;
  showActions: boolean;
};

export type LandingClassicProps = {
  showLogo: boolean;
  showTitlePhase: boolean;
  showActions: boolean;
  landingDialProgress: number;
  landingHandAngle: number;
  landingAnimRun: number;
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
