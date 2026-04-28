import type { AvatarOption } from "@/app/tasktimer/lib/avatarCatalog";
import type { RewardProgressV1 } from "@/app/tasktimer/lib/rewards";
import type { TaskTimerPlan } from "@/app/tasktimer/lib/entitlements";

export type SettingsPaneKey =
  | "general"
  | "preferences"
  | "appearance"
  | "notifications"
  | "privacy"
  | "userGuide"
  | "about"
  | "feedback"
  | "data"
  | "reset";

export type SettingsNavItem = {
  key: SettingsPaneKey;
  label: string;
  icon: string;
  id?: string;
};

export type SettingsFeedbackState = {
  email: string;
  anonymous: boolean;
  type: string;
  details: string;
};

export type SettingsAvatarGroup = {
  key: string;
  title: string;
  items: AvatarOption[];
};

export type SettingsAccountViewModel = {
  authStatus: string;
  authError: string;
  authBusy: boolean;
  authPlan: TaskTimerPlan;
  authPlanStatus: "confirmed" | "refreshing";
  authPlanIsProvisional: boolean;
  authUserEmail: string | null;
  authUserUid: string | null;
  authUserAlias: string;
  authUserAliasDraft: string;
  authUserAliasEditing: boolean;
  authUserAliasBusy: boolean;
  authMemberSince: string | null;
  authHasGoogleProvider: boolean;
  authGooglePhotoUrl: string | null;
  syncState: "idle" | "syncing" | "synced" | "error";
  syncMessage: string;
  syncAtMs: number | null;
  uidCopyStatus: string;
  showSignOutConfirm: boolean;
  setShowSignOutConfirm: (open: boolean) => void;
  showDeleteAccountConfirm: boolean;
  setShowDeleteAccountConfirm: (open: boolean) => void;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onCopyUid: () => Promise<void>;
  onStartAliasEdit: () => void;
  onCancelAliasEdit: () => void;
  onSaveAlias: () => Promise<void>;
  onAliasDraftChange: (value: string) => void;
  onOpenPlanAction: () => Promise<void>;
};

export type SettingsAvatarViewModel = {
  avatarOptions: AvatarOption[];
  avatarGroups: SettingsAvatarGroup[];
  selectedAvatarId: string;
  selectedAvatar: AvatarOption | null;
  avatarSyncNotice: string;
  avatarSyncNoticeIsError: boolean;
  showAvatarPickerModal: boolean;
  setShowAvatarPickerModal: (open: boolean) => void;
  showRankLadderModal: boolean;
  setShowRankLadderModal: (open: boolean) => void;
  rankThumbnailSrc: string;
  rewardProgress: RewardProgressV1;
  displayedRankLabel: string;
  rankLadderSummary: string;
  currentRankIndex: number;
  canSelectRankInsignia: boolean;
  onSelectAvatar: (avatarId: string) => Promise<void>;
  onUploadAvatar: (file: File | null) => Promise<void>;
  onSelectRankThumbnail: (rankId: string) => Promise<void>;
};
