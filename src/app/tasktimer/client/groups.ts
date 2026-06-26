/* eslint-disable @typescript-eslint/no-explicit-any */

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  approveFriendRequest,
  cancelOutgoingFriendRequest,
  declineFriendRequest,
  deleteFriendship,
  deleteSharedTaskSummary,
  loadFriendProfile,
  loadFriendships,
  loadIncomingFriendRequestEmailHints,
  loadIncomingRequests,
  loadOutgoingFriendRequestEmailHints,
  loadOutgoingRequests,
  loadSharedTaskSummariesForOwner,
  loadSharedTaskSummariesForViewer,
  sendFriendRequest,
  upsertSharedTaskSummary,
} from "../lib/friendsStore";
import { localDayKey } from "../lib/history";
import { formatDashboardDurationShort, startOfCurrentWeekMs } from "../lib/historyChart";
import { getRankLabelById, getRankThumbnailDescriptor } from "../lib/rewards";
import { normalizeTaskColor } from "../lib/taskColors";
import type { TaskTimerGroupsContext } from "./context";
import { hideOverlay, showOverlay } from "./overlay-visibility";

type GroupsBusyResult<T> =
  | { ok: true; value: T; timedOut: false }
  | { ok: false; message: string; timedOut: boolean; error?: unknown };

type GroupsSnapshotLoaders = {
  loadIncomingRequests: typeof loadIncomingRequests;
  loadOutgoingRequests: typeof loadOutgoingRequests;
  loadIncomingFriendRequestEmailHints: typeof loadIncomingFriendRequestEmailHints;
  loadOutgoingFriendRequestEmailHints: typeof loadOutgoingFriendRequestEmailHints;
  loadFriendships: typeof loadFriendships;
  loadFriendProfile: typeof loadFriendProfile;
  loadSharedTaskSummariesForViewer: typeof loadSharedTaskSummariesForViewer;
  loadSharedTaskSummariesForOwner: typeof loadSharedTaskSummariesForOwner;
};

type SharedTaskMetricsTask = {
  timeGoalEnabled?: boolean;
  timeGoalPeriod?: "day" | "week";
  timeGoalMinutes?: number;
  running?: boolean;
  startMs?: number | null;
};

type SharedTaskCardSummary = {
  dailyGoalMs?: number | null;
  todayLoggedMs?: number;
  weekLoggedMs?: number;
  weekGoalMs?: number | null;
  avgTimeLoggedThisWeekMs?: number;
  totalTimeLoggedMs?: number;
};

type SharedTaskHistoryEntryLike = {
  ts?: unknown;
  ms?: unknown;
};

type FriendAcceptAnimationSource = {
  friendUid: string;
  alias: string;
  avatarSrc: string;
  sourceRect: DOMRect | null;
};

type FriendProfileModalOpenOptions = {
  zoomSource?: HTMLElement | null;
};

const defaultGroupsSnapshotLoaders: GroupsSnapshotLoaders = {
  loadIncomingRequests,
  loadOutgoingRequests,
  loadIncomingFriendRequestEmailHints,
  loadOutgoingFriendRequestEmailHints,
  loadFriendships,
  loadFriendProfile,
  loadSharedTaskSummariesForViewer,
  loadSharedTaskSummariesForOwner,
};

export function getFriendProfileOpenUidFromTarget(target: unknown) {
  const btn = (target as { closest?: (selector: string) => HTMLElement | null } | null)?.closest?.("[data-friend-profile-open]");
  return String(btn?.getAttribute?.("data-friend-profile-open") || "").trim();
}

export function getFriendRequestActionCompleteStatus(action: "approve" | "decline" | "cancel") {
  return action === "approve"
    ? "Friend request approved."
    : action === "decline"
      ? "Friend request declined."
      : "Friend request cancelled.";
}

export function deriveFriendEmailByUid(
  uid: string,
  incomingRows: Array<{ senderUid?: string; senderEmail?: string | null; status?: string }>,
  outgoingRows: Array<{ receiverUid?: string; receiverEmail?: string | null; status?: string }>
) {
  const currentUid = String(uid || "").trim();
  const emailByUid: Record<string, string> = {};
  if (!currentUid) return emailByUid;
  incomingRows.forEach((row) => {
    if (row.status !== "approved") return;
    const peerUid = String(row.senderUid || "").trim();
    const email = String(row.senderEmail || "").trim();
    if (peerUid && email) emailByUid[peerUid] = email;
  });
  outgoingRows.forEach((row) => {
    if (row.status !== "approved") return;
    const peerUid = String(row.receiverUid || "").trim();
    const email = String(row.receiverEmail || "").trim();
    if (peerUid && email) emailByUid[peerUid] = email;
  });
  return emailByUid;
}

export function getSharedTaskGoalMetrics(task: SharedTaskMetricsTask | null | undefined) {
  const goalMinutes = Math.max(0, Number(task?.timeGoalMinutes || 0));
  if (!(task?.timeGoalEnabled && goalMinutes > 0)) return { dailyGoalMs: null, weekGoalMs: null };
  if (task.timeGoalPeriod === "day") {
    return {
      dailyGoalMs: Math.floor(goalMinutes * 60_000),
      weekGoalMs: Math.floor(goalMinutes * 7 * 60_000),
    };
  }
  if (task.timeGoalPeriod === "week") {
    return {
      dailyGoalMs: Math.floor((goalMinutes * 60_000) / 7),
      weekGoalMs: Math.floor(goalMinutes * 60_000),
    };
  }
  return { dailyGoalMs: null, weekGoalMs: null };
}

export function formatSharedTaskWeekPercent(summary: SharedTaskCardSummary): string {
  const weekGoalMs = summary.weekGoalMs == null ? null : Math.max(0, Number(summary.weekGoalMs || 0));
  if (!(weekGoalMs && weekGoalMs > 0)) return "No goal";
  const weekLoggedMs = Math.max(0, Number(summary.weekLoggedMs || 0));
  return `${Math.max(0, Math.min(100, Math.round((weekLoggedMs / weekGoalMs) * 100)))}%`;
}

function formatCompactDurationForSharedCard(msRaw: number): string {
  const totalMs = Math.max(0, Math.floor(Number(msRaw) || 0));
  let totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  totalSeconds -= days * 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds -= hours * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${String(days).padStart(2, "0")}d`);
  if (hours > 0) parts.push(`${String(hours).padStart(2, "0")}h`);
  if (minutes > 0) parts.push(`${String(minutes).padStart(2, "0")}m`);
  if (seconds > 0) parts.push(`${String(seconds).padStart(2, "0")}s`);
  if (!parts.length) parts.push("00s");
  return parts.join(" ");
}

export function renderSharedTaskMetricRows(summary: SharedTaskCardSummary, escapeHtmlUI: (value: unknown) => string) {
  const dailyGoalMs = summary.dailyGoalMs == null ? null : Math.max(0, Number(summary.dailyGoalMs || 0));
  const goalText = dailyGoalMs && dailyGoalMs > 0 ? formatCompactDurationForSharedCard(dailyGoalMs) : "No goal";
  return `<div class="friendSharedTaskMeta">Goal: ${escapeHtmlUI(goalText)}</div>
                  <div class="friendSharedTaskMeta">Today: ${escapeHtmlUI(
                    formatCompactDurationForSharedCard(Number(summary.todayLoggedMs || 0))
                  )}</div>
                  <div class="friendSharedTaskMeta">This Week: ${escapeHtmlUI(formatSharedTaskWeekPercent(summary))}</div>
                  <div class="friendSharedTaskMeta">Daily avg: ${escapeHtmlUI(
                    formatCompactDurationForSharedCard(Number(summary.avgTimeLoggedThisWeekMs || 0))
                  )}</div>
                  <div class="friendSharedTaskMeta">Total logged: ${escapeHtmlUI(
                    formatCompactDurationForSharedCard(Number(summary.totalTimeLoggedMs || 0))
                  )}</div>`;
}

export function computeSharedTaskTimingMetrics(options: {
  task: SharedTaskMetricsTask | null | undefined;
  entries: SharedTaskHistoryEntryLike[];
  nowMs: number;
  weekStarting: Parameters<typeof startOfCurrentWeekMs>[1];
  normalizeHistoryTimestampMs: (value: unknown) => number;
}) {
  const nowValue = Math.max(0, Math.floor(Number(options.nowMs) || 0));
  const entries = Array.isArray(options.entries) ? options.entries : [];
  const weekStartMs = startOfCurrentWeekMs(nowValue, options.weekStarting);
  const todayKey = localDayKey(nowValue);
  const weekEntries = entries.filter((entry) => options.normalizeHistoryTimestampMs(entry?.ts) >= weekStartMs);
  const weekTotalMs = weekEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry?.ms || 0)), 0);
  const todayLoggedHistoryMs = entries
    .filter((entry) => localDayKey(options.normalizeHistoryTimestampMs(entry?.ts)) === todayKey)
    .reduce((sum, entry) => sum + Math.max(0, Number(entry?.ms || 0)), 0);
  const daysElapsed = Math.max(1, Math.floor((nowValue - weekStartMs) / (24 * 60 * 60 * 1000)) + 1);
  const avgWeekMs = Math.floor(weekTotalMs / daysElapsed);
  const allHistoryMs = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry?.ms || 0)), 0);
  const runningMs =
    options.task && options.task.running && Number.isFinite(Number(options.task.startMs))
      ? Math.max(0, nowValue - Number(options.task.startMs || 0))
      : 0;
  const focusTrend7dMs = [0, 0, 0, 0, 0, 0, 0];
  weekEntries.forEach((entry) => {
    const ts = options.normalizeHistoryTimestampMs(entry?.ts);
    if (!ts) return;
    const dayIdx = new Date(ts).getDay();
    if (dayIdx >= 0 && dayIdx <= 6) focusTrend7dMs[dayIdx] += Math.max(0, Number(entry?.ms || 0));
  });
  if (runningMs > 0) {
    const dayIdx = new Date(nowValue).getDay();
    if (dayIdx >= 0 && dayIdx <= 6) focusTrend7dMs[dayIdx] += runningMs;
  }
  const goalMetrics = getSharedTaskGoalMetrics(options.task);
  return {
    dailyGoalMs: goalMetrics.dailyGoalMs,
    todayLoggedMs: Math.floor(todayLoggedHistoryMs + runningMs),
    weekLoggedMs: Math.floor(weekTotalMs + runningMs),
    weekGoalMs: goalMetrics.weekGoalMs,
    avgWeekMs,
    totalMs: Math.floor(allHistoryMs + runningMs),
    focusTrend7dMs: focusTrend7dMs.map((value) => Math.max(0, Math.floor(Number(value) || 0))),
  };
}

export async function loadGroupsSnapshotForUid(uid: string, loaders: GroupsSnapshotLoaders = defaultGroupsSnapshotLoaders) {
  const [incomingResult, outgoingResult, incomingEmailResult, outgoingEmailResult, friendshipsResult] = await Promise.allSettled([
    loaders.loadIncomingRequests(uid),
    loaders.loadOutgoingRequests(uid),
    loaders.loadIncomingFriendRequestEmailHints(uid),
    loaders.loadOutgoingFriendRequestEmailHints(uid),
    loaders.loadFriendships(uid),
  ]);
  const incoming = incomingResult.status === "fulfilled" ? incomingResult.value || [] : [];
  const outgoing = outgoingResult.status === "fulfilled" ? outgoingResult.value || [] : [];
  const incomingEmailRows = incomingEmailResult.status === "fulfilled" ? incomingEmailResult.value || [] : [];
  const outgoingEmailRows = outgoingEmailResult.status === "fulfilled" ? outgoingEmailResult.value || [] : [];
  const friendships = friendshipsResult.status === "fulfilled" ? friendshipsResult.value || [] : [];
  const friendEmailByUid = deriveFriendEmailByUid(uid, incomingEmailRows, outgoingEmailRows);
  const requestPeerUids = [...incoming, ...outgoing]
    .map((row) => (row.senderUid === uid ? row.receiverUid : row.senderUid))
    .map((peerUid) => String(peerUid || "").trim())
    .filter(Boolean);
  const profileUids = Array.from(
    new Set([
      ...friendships
        .map((row) => (row.users[0] === uid ? row.users[1] : row.users[0]))
        .map((peerUid) => String(peerUid || "").trim())
        .filter(Boolean),
      ...requestPeerUids,
    ])
  );
  const profileEntries = await Promise.allSettled(
    profileUids.map(async (peerUid) => {
      const profile = await loaders.loadFriendProfile(peerUid);
      return [peerUid, profile] as const;
    })
  );
  const nextFriendProfileCache = {} as Record<string, Awaited<ReturnType<typeof loadFriendProfile>>>;
  profileEntries.forEach((result) => {
    if (result.status !== "fulfilled" || !result.value) return;
    const [peerUid, profile] = result.value;
    if (!peerUid) return;
    nextFriendProfileCache[peerUid] = profile;
  });
  const [sharedForViewerResult, sharedForOwnerResult] = await Promise.allSettled([
    loaders.loadSharedTaskSummariesForViewer(uid),
    loaders.loadSharedTaskSummariesForOwner(uid),
  ]);
  return {
    incoming,
    outgoing,
    friendships,
    friendProfileCache: nextFriendProfileCache,
    friendEmailByUid,
    sharedSummaries: sharedForViewerResult.status === "fulfilled" ? sharedForViewerResult.value || [] : [],
    ownSharedSummaries: sharedForOwnerResult.status === "fulfilled" ? sharedForOwnerResult.value || [] : [],
  };
}

export function createTaskTimerGroups(ctx: TaskTimerGroupsContext) {
  const { els } = ctx;
  let friendProfileCloseTimer: number | null = null;

  function canUseSocialFeatures() {
    return ctx.hasEntitlement("socialFeatures");
  }

  function renderGroupsLockedState() {
    if (els.groupsFriendsList) {
      els.groupsFriendsList.innerHTML = '<div class="settingsDetailNote isEmptyStatus">Upgrade to Pro to unlock friends, sharing, and social progress.</div>';
    }
    if (els.groupsSharedByYouList) {
      els.groupsSharedByYouList.innerHTML = '<div class="settingsDetailNote isEmptyStatus">Shared tasks are available on Pro.</div>';
    }
    if (els.groupsIncomingRequestsList) {
      els.groupsIncomingRequestsList.innerHTML = '<div class="settingsDetailNote isEmptyStatus">Friend requests are available on Pro.</div>';
    }
    if (els.groupsOutgoingRequestsList) {
      els.groupsOutgoingRequestsList.innerHTML = '<div class="settingsDetailNote isEmptyStatus">Outgoing requests are available on Pro.</div>';
    }
    if (els.openFriendRequestModalBtn) els.openFriendRequestModalBtn.disabled = true;
  }

  function openFriendRequestModal() {
    if (!canUseSocialFeatures()) {
      ctx.showUpgradePrompt("Friends and sharing", "pro");
      return;
    }
    showOverlay(els.friendRequestModal as HTMLElement | null);
    if (els.friendRequestEmailInput) els.friendRequestEmailInput.value = "";
    setFriendRequestModalStatus("");
    window.setTimeout(() => {
      try {
        els.friendRequestEmailInput?.focus();
      } catch {
        // ignore
      }
    }, 0);
  }

  function closeFriendRequestModal() {
    hideOverlay(els.friendRequestModal as HTMLElement | null);
    setFriendRequestModalStatus("");
  }

  function setFriendRequestModalStatus(message: string, tone: "error" | "success" | "info" = "info") {
    if (!els.friendRequestModalStatus) return;
    const text = String(message || "").trim();
    const statusEl = els.friendRequestModalStatus as HTMLElement;
    statusEl.textContent = text;
    statusEl.style.display = text ? "block" : "none";
    statusEl.style.color = "";
    if (!text) return;
    if (tone === "error") {
      statusEl.style.color = "#ff8f8f";
      return;
    }
    if (tone === "success") {
      statusEl.style.color = "var(--accent, #35e8ff)";
      return;
    }
    statusEl.style.color = "rgba(188,214,230,.78)";
  }

  function clearFriendProfileZoomState() {
    const overlay = els.friendProfileModal as HTMLElement | null;
    if (!overlay) return;
    overlay.classList.remove("isFriendProfileZoomingIn", "isFriendProfileZoomingOut");
    const modal = overlay.querySelector?.(".modal") as HTMLElement | null;
    modal?.style.removeProperty("--friend-profile-zoom-origin-x");
    modal?.style.removeProperty("--friend-profile-zoom-origin-y");
  }

  function finishFriendProfileClose() {
    if (friendProfileCloseTimer != null) {
      window.clearTimeout(friendProfileCloseTimer);
      friendProfileCloseTimer = null;
    }
    clearFriendProfileZoomState();
    hideOverlay(els.friendProfileModal as HTMLElement | null);
    ctx.setActiveFriendProfileUid(null);
    ctx.setActiveFriendProfileName("");
  }

  function applyFriendProfileZoomOrigin(zoomSource?: HTMLElement | null) {
    const overlay = els.friendProfileModal as HTMLElement | null;
    const modal = overlay?.querySelector?.(".modal") as HTMLElement | null;
    if (!overlay || !modal || !zoomSource || prefersReducedFriendMotion()) return;
    const sourceRect = zoomSource.getBoundingClientRect?.() || null;
    const modalRect = modal.getBoundingClientRect?.() || null;
    if (!isUsableFriendAnimationRect(sourceRect) || !isUsableFriendAnimationRect(modalRect)) return;
    const originX = sourceRect.left + sourceRect.width / 2 - modalRect.left;
    const originY = sourceRect.top + sourceRect.height / 2 - modalRect.top;
    modal.style.setProperty("--friend-profile-zoom-origin-x", `${Math.max(0, Math.min(modalRect.width, originX))}px`);
    modal.style.setProperty("--friend-profile-zoom-origin-y", `${Math.max(0, Math.min(modalRect.height, originY))}px`);
  }

  function animateFriendProfileOpen(zoomSource?: HTMLElement | null) {
    const overlay = els.friendProfileModal as HTMLElement | null;
    if (!overlay || prefersReducedFriendMotion() || typeof window.requestAnimationFrame !== "function") return;
    clearFriendProfileZoomState();
    applyFriendProfileZoomOrigin(zoomSource);
    overlay.classList.add("isFriendProfileZoomingIn");
    window.requestAnimationFrame(() => {
      overlay.classList.remove("isFriendProfileZoomingIn");
    });
  }

  function closeFriendProfileModal() {
    const overlay = els.friendProfileModal as HTMLElement | null;
    if (!overlay || overlay.style.display === "none" || prefersReducedFriendMotion()) {
      finishFriendProfileClose();
      return;
    }
    if (friendProfileCloseTimer != null) return;
    clearFriendProfileZoomState();
    overlay.classList.add("isFriendProfileZoomingOut");
    friendProfileCloseTimer = window.setTimeout(finishFriendProfileClose, 220);
  }

  function openFriendProfileModal(friendUid: string, opts?: FriendProfileModalOpenOptions) {
    const uid = ctx.getCurrentUid();
    if (!uid || !els.friendProfileModal) return;
    const targetUid = String(friendUid || "").trim();
    if (!targetUid) return;
    if (friendProfileCloseTimer != null) {
      window.clearTimeout(friendProfileCloseTimer);
      friendProfileCloseTimer = null;
    }

    const rankedFriends = ctx
      .getGroupsFriendships()
      .map((row) => {
        const peerUid = row.users[0] === uid ? row.users[1] : row.users[0];
        if (!peerUid) return null;
        const profile = ctx.getMergedFriendProfile(peerUid, row.profileByUid?.[peerUid]);
        const alias = String(profile?.alias || "").trim() || peerUid;
        const currentRankId = String(profile?.currentRankId || "").trim() || "unranked";
        const totalXp = Math.max(0, Math.floor(Number(profile?.totalXp || 0) || 0));
        const completedTaskCount = Math.max(0, Math.floor(Number(profile?.completedTaskCount || 0) || 0));
        const email = String(ctx.getFriendEmailByUid()[peerUid] || "").trim();
        const avatarSrc = ctx.getFriendAvatarSrc(profile);
        const sharedCount = ctx.getGroupsSharedSummaries().filter((entry) => entry.ownerUid === peerUid).length;
        const createdAtMs =
          row.createdAt && typeof (row.createdAt as any).toMillis === "function"
            ? Number((row.createdAt as any).toMillis())
            : Number.NaN;
        const summaries = ctx.getGroupsSharedSummaries().filter((entry) => entry.ownerUid === peerUid);
        const sharedTotalMs = summaries.reduce((sum, entry) => sum + Math.max(0, Number(entry.totalTimeLoggedMs || 0) || 0), 0);
        const sharedAverageMs = summaries.length
          ? Math.floor(
              summaries.reduce((sum, entry) => sum + Math.max(0, Number(entry.avgTimeLoggedThisWeekMs || 0) || 0), 0) / summaries.length
            )
          : 0;
        return { peerUid, alias, email, avatarSrc, currentRankId, totalXp, completedTaskCount, sharedCount, sharedTotalMs, sharedAverageMs, createdAtMs };
      })
      .filter(
        (row): row is {
          peerUid: string;
          alias: string;
          email: string;
          avatarSrc: string;
          currentRankId: string;
          totalXp: number;
          completedTaskCount: number;
          sharedCount: number;
          sharedTotalMs: number;
          sharedAverageMs: number;
          createdAtMs: number;
        } => !!row
      )
      .sort((a, b) => {
        if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
        const byAlias = a.alias.localeCompare(b.alias, undefined, { sensitivity: "base" });
        if (byAlias !== 0) return byAlias;
        return a.peerUid.localeCompare(b.peerUid, undefined, { sensitivity: "base" });
      });

    const row = rankedFriends.find((entry) => entry.peerUid === targetUid);
    if (!row) return;
    const memberSinceText = Number.isFinite(row.createdAtMs) ? new Date(row.createdAtMs).toLocaleDateString() : "Unknown";

    if (els.friendProfileAvatar) {
      els.friendProfileAvatar.src = row.avatarSrc;
      els.friendProfileAvatar.alt = "";
    }
    if (els.friendProfileName) els.friendProfileName.textContent = row.alias;
    if (els.friendProfileEmail) {
      els.friendProfileEmail.textContent = row.email;
      (els.friendProfileEmail as HTMLElement).style.display = row.email ? "block" : "none";
    }
    if (els.friendProfileRankImage) {
      const rankThumbnail = getRankThumbnailDescriptor(row.currentRankId);
      if (rankThumbnail.kind === "image") {
        els.friendProfileRankImage.src = rankThumbnail.src;
        els.friendProfileRankImage.style.display = "block";
        if (els.friendProfileRankPlaceholder) (els.friendProfileRankPlaceholder as HTMLElement).style.display = "none";
      } else {
        els.friendProfileRankImage.removeAttribute("src");
        els.friendProfileRankImage.style.display = "none";
        if (els.friendProfileRankPlaceholder) {
          (els.friendProfileRankPlaceholder as HTMLElement).textContent = rankThumbnail.label;
          (els.friendProfileRankPlaceholder as HTMLElement).style.display = "grid";
        }
      }
    }
    if (els.friendProfileRank) els.friendProfileRank.textContent = getRankLabelById(row.currentRankId);
    if (els.friendProfileXp) els.friendProfileXp.textContent = new Intl.NumberFormat().format(row.totalXp);
    if (els.friendProfileSharedTaskCount) els.friendProfileSharedTaskCount.textContent = String(row.sharedCount);
    if (els.friendProfileSharedTime) els.friendProfileSharedTime.textContent = formatDashboardDurationShort(row.sharedTotalMs);
    if (els.friendProfileCompletedTaskCount) els.friendProfileCompletedTaskCount.textContent = new Intl.NumberFormat().format(row.completedTaskCount);
    if (els.friendProfileMemberSince) els.friendProfileMemberSince.textContent = `Member since ${memberSinceText}`;
    ctx.setActiveFriendProfileUid(row.peerUid);
    ctx.setActiveFriendProfileName(row.alias);
    showOverlay(els.friendProfileModal as HTMLElement | null);
    animateFriendProfileOpen(opts?.zoomSource || null);
  }

  function getTaskCreatedAtMs(taskId: string): number | null {
    const task = ctx.getTasks().find((row) => String(row.id || "") === String(taskId));
    const raw = (task as any)?.createdAt;
    if (raw && typeof raw.toMillis === "function") return Math.max(0, Number(raw.toMillis()) || 0);
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
    const entries = (ctx.getHistoryByTaskId()[taskId] || []).slice();
    if (!entries.length) return null;
    const minTs = entries.reduce(
      (min, entry) => Math.min(min, ctx.normalizeHistoryTimestampMs((entry as any)?.ts)),
      Number.MAX_SAFE_INTEGER
    );
    return minTs > 0 && Number.isFinite(minTs) ? Math.floor(minTs) : null;
  }

  function computeTaskSharingMetrics(taskId: string) {
    const history = ctx.getHistoryByTaskId();
    const task = ctx.getTasks().find((row) => String(row.id || "") === String(taskId));
    const timingMetrics = computeSharedTaskTimingMetrics({
      task,
      entries: history[taskId] || [],
      nowMs: Date.now(),
      weekStarting: ctx.getWeekStarting(),
      normalizeHistoryTimestampMs: ctx.normalizeHistoryTimestampMs,
    });
    let checkpointScaleMs: number | null = null;
    if (task && Array.isArray((task as any).milestones) && (task as any).milestones.length) {
      const unitSec =
        (task as any).milestoneTimeUnit === "day"
          ? 86400
          : (task as any).milestoneTimeUnit === "minute"
            ? 60
            : 3600;
      const maxCheckpointUnits = (task as any).milestones.reduce((max: number, milestone: any) => {
        const hours = Number(milestone?.hours || 0);
        return Number.isFinite(hours) ? Math.max(max, hours) : max;
      }, 0);
      const candidate = Math.floor(maxCheckpointUnits * unitSec * 1000);
      checkpointScaleMs = candidate > 0 ? candidate : null;
    }
    return {
      createdAtMs: getTaskCreatedAtMs(taskId),
      dailyGoalMs: timingMetrics.dailyGoalMs,
      todayLoggedMs: timingMetrics.todayLoggedMs,
      weekLoggedMs: timingMetrics.weekLoggedMs,
      weekGoalMs: timingMetrics.weekGoalMs,
      avgWeekMs: timingMetrics.avgWeekMs,
      totalMs: timingMetrics.totalMs,
      focusTrend7dMs: timingMetrics.focusTrend7dMs,
      checkpointScaleMs,
    };
  }

  function getSharedFriendUidsForTask(taskId: string): string[] {
    const uid = ctx.getCurrentUid();
    if (!uid || !taskId) return [];
    return ctx
      .getOwnSharedSummaries()
      .filter((row) => row.ownerUid === uid && row.taskId === taskId)
      .map((row) => row.friendUid);
  }

  function setShareTaskStatus(message: string, tone: "error" | "success" | "info" = "info") {
    if (!els.shareTaskStatus) return;
    const text = String(message || "").trim();
    const statusEl = els.shareTaskStatus as HTMLElement;
    statusEl.textContent = text;
    statusEl.style.display = text ? "block" : "none";
    statusEl.style.color = "";
    if (!text) return;
    if (tone === "error") {
      statusEl.style.color = "#ff8f8f";
      return;
    }
    if (tone === "success") {
      statusEl.style.color = "var(--accent, #35e8ff)";
      return;
    }
    statusEl.style.color = "rgba(188,214,230,.78)";
  }

  function isShareTaskSpecificScopeSelected() {
    return String(els.shareTaskScopeSelect?.value || "all") === "specific";
  }

  function getShareTaskScopeDropdownEls() {
    const modal = els.shareTaskModal as HTMLElement | null;
    return {
      button: modal?.querySelector<HTMLButtonElement>("#shareTaskScopeDropdownButton") || null,
      label: modal?.querySelector<HTMLElement>("#shareTaskScopeDropdownLabel") || null,
      list: modal?.querySelector<HTMLElement>("#shareTaskScopeDropdownList") || null,
      options: Array.from(modal?.querySelectorAll<HTMLButtonElement>("[data-share-task-scope-option]") || []),
    };
  }

  function getShareTaskScopeLabel(value: string) {
    return value === "specific" ? "Specific friend(s)" : "All friends";
  }

  function setShareTaskScopeDropdownOpen(open: boolean) {
    const dropdownEls = getShareTaskScopeDropdownEls();
    if (dropdownEls.button) dropdownEls.button.setAttribute("aria-expanded", open ? "true" : "false");
    if (dropdownEls.list) dropdownEls.list.hidden = !open;
  }

  function syncShareTaskScopeDropdownUi() {
    const value = String(els.shareTaskScopeSelect?.value || "all");
    const dropdownEls = getShareTaskScopeDropdownEls();
    if (dropdownEls.label) dropdownEls.label.textContent = getShareTaskScopeLabel(value);
    dropdownEls.options.forEach((option) => {
      const selected = String(option.getAttribute("data-share-task-scope-option") || "all") === value;
      option.classList.toggle("isSelected", selected);
      option.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function setShareTaskScopeValue(value: string) {
    const nextValue = value === "specific" ? "specific" : "all";
    if (els.shareTaskScopeSelect) els.shareTaskScopeSelect.value = nextValue;
    syncShareTaskScopeDropdownUi();
    renderShareTaskFriendOptions();
    syncShareTaskScopeUi();
  }

  function focusShareTaskScopeOption(offset: number) {
    const dropdownEls = getShareTaskScopeDropdownEls();
    if (!dropdownEls.options.length) return;
    const currentValue = String(els.shareTaskScopeSelect?.value || "all");
    const currentIndex = Math.max(
      0,
      dropdownEls.options.findIndex((option) => String(option.getAttribute("data-share-task-scope-option") || "all") === currentValue)
    );
    const nextIndex = Math.min(dropdownEls.options.length - 1, Math.max(0, currentIndex + offset));
    dropdownEls.options[nextIndex]?.focus();
  }

  function handleShareTaskScopeDropdownKeyDown(e: any) {
    const target = e?.target as HTMLElement | null;
    if (!target?.closest?.("#shareTaskScopeDropdown")) return;
    const key = String(e?.key || "");
    const dropdownEls = getShareTaskScopeDropdownEls();
    const option = target.closest("[data-share-task-scope-option]") as HTMLElement | null;
    const button = target.closest("#shareTaskScopeDropdownButton") as HTMLElement | null;
    if (key === "Escape") {
      e?.preventDefault?.();
      setShareTaskScopeDropdownOpen(false);
      dropdownEls.button?.focus();
      return;
    }
    if (button && (key === "ArrowDown" || key === "ArrowUp")) {
      e?.preventDefault?.();
      setShareTaskScopeDropdownOpen(true);
      focusShareTaskScopeOption(key === "ArrowDown" ? 0 : dropdownEls.options.length - 1);
      return;
    }
    if (!option) return;
    if (key === "Enter" || key === " ") {
      e?.preventDefault?.();
      setShareTaskScopeValue(String(option.getAttribute("data-share-task-scope-option") || "all"));
      setShareTaskScopeDropdownOpen(false);
      dropdownEls.button?.focus();
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      e?.preventDefault?.();
      const optionIndex = dropdownEls.options.indexOf(option as HTMLButtonElement);
      const nextIndex =
        key === "Home"
          ? 0
          : key === "End"
            ? dropdownEls.options.length - 1
            : Math.min(dropdownEls.options.length - 1, Math.max(0, optionIndex + (key === "ArrowDown" ? 1 : -1)));
      dropdownEls.options[nextIndex]?.focus();
    }
  }

  function getShareTaskFriendRows() {
    const uid = ctx.getCurrentUid();
    if (!uid || !ctx.getGroupsFriendships().length) return [] as Array<{ friendUid: string; alias: string }>;
    return ctx
      .getGroupsFriendships()
      .map((row) => {
        const friendUid = row.users[0] === uid ? row.users[1] : row.users[0];
        if (!friendUid) return null;
        const profile = ctx.getMergedFriendProfile(friendUid, row.profileByUid?.[friendUid]);
        const aliasRaw = String(profile?.alias || "").trim();
        const alias = aliasRaw.includes("@") ? aliasRaw.split("@")[0] || friendUid : aliasRaw || friendUid;
        return { friendUid, alias };
      })
      .filter((row): row is { friendUid: string; alias: string } => !!row);
  }

  function getShareTaskAvailability(taskId: string) {
    const friendRows = getShareTaskFriendRows();
    const sharedFriendUidSet = new Set(getSharedFriendUidsForTask(taskId));
    const availableFriendRows = friendRows.filter((row) => !sharedFriendUidSet.has(row.friendUid));
    return {
      friendRows,
      sharedFriendUidSet,
      availableFriendRows,
      isSharedWithAllFriends: friendRows.length > 0 && availableFriendRows.length === 0,
    };
  }

  function syncShareTaskModalAvailabilityUi(opts?: { taskName?: string }) {
    const mode = ctx.getShareTaskMode() === "unshare" ? "unshare" : "share";
    const activeTaskId = String(ctx.getShareTaskTaskId() || "").trim();
    const taskName =
      String(opts?.taskName || "").trim() ||
      String(ctx.getTasks()[ctx.getShareTaskIndex() ?? -1]?.name || "").trim() ||
      "Untitled task";
    if (mode === "unshare") {
      const targetCount = getSharedFriendUidsForTask(activeTaskId).length;
      setShareTaskModalModeUi({ mode, taskName, hasChoices: targetCount > 0 });
      return;
    }
    const availability = getShareTaskAvailability(activeTaskId);
    const hasChoices = isShareTaskSpecificScopeSelected()
      ? availability.availableFriendRows.length > 0
      : availability.friendRows.length > 0 && !availability.isSharedWithAllFriends;
    setShareTaskModalModeUi({ mode, taskName, hasChoices });
    if (!availability.friendRows.length) {
      setShareTaskStatus("No friends available to share with.", "error");
      return;
    }
    if (availability.isSharedWithAllFriends) {
      setShareTaskStatus("This task is already shared with all friends.", "info");
      return;
    }
    setShareTaskStatus("");
  }

  function setShareTaskModalModeUi(opts: { mode: "share" | "unshare"; taskName: string; hasChoices?: boolean }) {
    const mode = opts.mode === "unshare" ? "unshare" : "share";
    const taskName = String(opts.taskName || "").trim() || "Untitled task";
    const hasChoices = opts.hasChoices !== false;
    const scopeField = (els.shareTaskScopeSelect?.parentElement as HTMLElement | null) || null;
    const friendsField = els.shareTaskFriendsField as HTMLElement | null;
    const friendsLabel = friendsField?.querySelector("label") as HTMLElement | null;
    if (els.shareTaskTitle) {
      els.shareTaskTitle.textContent = mode === "unshare" ? `Unshare "${taskName}"` : `Share "${taskName}"`;
    }
    const subtextEl = (els.shareTaskTitle?.nextElementSibling as HTMLElement | null) || null;
    if (subtextEl && subtextEl.classList.contains("shareTaskModalSubtext")) {
      subtextEl.textContent =
        mode === "unshare"
          ? "Choose which friends should no longer receive this task and its live progress."
          : "Select who to share this task with:";
    }
    if (scopeField) scopeField.style.display = mode === "share" ? "grid" : "none";
    if (friendsField) {
      friendsField.style.display = mode === "share" ? (isShareTaskSpecificScopeSelected() ? "grid" : "none") : "grid";
    }
    if (friendsLabel) {
      friendsLabel.textContent = mode === "unshare" ? "Select friend(s) to unshare" : "Select friend(s)";
      friendsLabel.style.display = mode === "unshare" ? "" : "none";
    }
    syncShareTaskScopeDropdownUi();
    if (els.shareTaskConfirmBtn) {
      els.shareTaskConfirmBtn.textContent = mode === "unshare" ? "Unshare" : "Share";
      els.shareTaskConfirmBtn.disabled = !hasChoices;
    }
  }

  function renderShareTaskFriendOptions() {
    const listEl = els.shareTaskFriendsList as HTMLElement | null;
    if (!listEl) return;
    const uid = ctx.getCurrentUid();
    const mode = ctx.getShareTaskMode() === "unshare" ? "unshare" : "share";
    let rows: Array<{ friendUid: string; alias: string }> = [];
    if (uid) rows = getShareTaskFriendRows();
    if (mode === "unshare") {
      const activeTaskId = String(ctx.getShareTaskTaskId() || "").trim();
      const targetUids = new Set(getSharedFriendUidsForTask(activeTaskId));
      rows = rows.filter((row) => targetUids.has(row.friendUid));
      if (!rows.length && activeTaskId) {
        rows = ctx
          .getOwnSharedSummaries()
          .filter((row) => row.ownerUid === uid && row.taskId === activeTaskId)
          .map((row) => ({ friendUid: row.friendUid, alias: String(row.friendUid || "").trim() || "Unknown friend" }));
      }
    }
    const activeTaskId = String(ctx.getShareTaskTaskId() || "").trim();
    const shareAvailability = mode === "share" ? getShareTaskAvailability(activeTaskId) : null;
    if (!uid || !rows.length) {
      listEl.innerHTML = `<div class="settingsDetailNote isEmptyStatus">${
        mode === "unshare" ? "This task is not currently shared with any friends." : "No friends available."
      }</div>`;
      return;
    }
    listEl.innerHTML = rows
      .map((row) => {
        const inputId = `shareFriend_${ctx.escapeHtmlUI(row.friendUid)}`;
        const isCurrentlyShared = !!shareAvailability?.sharedFriendUidSet.has(row.friendUid);
        return `<label class="shareTaskFriendOption" for="${inputId}">
          <input id="${inputId}" type="checkbox" data-share-friend-uid="${ctx.escapeHtmlUI(row.friendUid)}" ${mode === "share" && isCurrentlyShared ? "disabled" : ""} />
          <span class="shareTaskFriendOptionLabel">${ctx.escapeHtmlUI(row.alias)}</span>
          ${mode === "share" && isCurrentlyShared ? '<span class="shareTaskFriendOptionState">Currently shared</span>' : ""}
        </label>`;
      })
      .join("");
  }

  function syncShareTaskScopeUi() {
    if (ctx.getShareTaskMode() === "unshare") {
      if (els.shareTaskFriendsField) (els.shareTaskFriendsField as HTMLElement).style.display = "grid";
      return;
    }
    if (els.shareTaskFriendsField) {
      (els.shareTaskFriendsField as HTMLElement).style.display = isShareTaskSpecificScopeSelected() ? "grid" : "none";
    }
    syncShareTaskModalAvailabilityUi();
  }

  function closeShareTaskModal() {
    if (!els.shareTaskModal) return;
    (els.shareTaskModal as HTMLElement).style.display = "none";
    ctx.setShareTaskIndex(null);
    ctx.setShareTaskTaskId(null);
    ctx.setShareTaskMode("share");
    if (els.shareTaskScopeSelect) els.shareTaskScopeSelect.value = "all";
    syncShareTaskScopeDropdownUi();
    setShareTaskScopeDropdownOpen(false);
    if (els.shareTaskConfirmBtn) els.shareTaskConfirmBtn.disabled = false;
    setShareTaskStatus("");
  }

  function openShareTaskModal(taskIndex: number) {
    if (!canUseSocialFeatures()) {
      ctx.showUpgradePrompt("Task sharing", "pro");
      return;
    }
    const task = ctx.getTasks()[taskIndex];
    if (!task) return;
    const taskName = String(task.name || "").trim() || "Untitled task";
    ctx.setShareTaskIndex(taskIndex);
    ctx.setShareTaskTaskId(String(task.id || "").trim());
    ctx.setShareTaskMode("share");
    setShareTaskModalModeUi({ mode: "share", taskName, hasChoices: true });
    if (els.shareTaskScopeSelect) els.shareTaskScopeSelect.value = "all";
    syncShareTaskScopeDropdownUi();
    setShareTaskScopeDropdownOpen(false);
    syncShareTaskScopeUi();
    renderShareTaskFriendOptions();
    const uid = ctx.getCurrentUid();
    if (uid && !ctx.getGroupsFriendships().length) {
      void loadFriendships(uid)
        .then((rows) => {
          ctx.setGroupsFriendships(rows || []);
          renderShareTaskFriendOptions();
          syncShareTaskModalAvailabilityUi({ taskName });
        })
        .catch(() => {});
    }
    syncShareTaskModalAvailabilityUi({ taskName });
    if (els.shareTaskModal) (els.shareTaskModal as HTMLElement).style.display = "flex";
  }

  function openUnshareTaskModal(taskId: string) {
    if (!canUseSocialFeatures()) {
      ctx.showUpgradePrompt("Task sharing", "pro");
      return;
    }
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return;
    const taskName =
      String(ctx.getTasks().find((row) => String(row.id || "").trim() === normalizedTaskId)?.name || "").trim() ||
      String(ctx.getOwnSharedSummaries().find((row) => String(row.taskId || "").trim() === normalizedTaskId)?.taskName || "").trim() ||
      "Untitled task";
    ctx.setShareTaskIndex(null);
    ctx.setShareTaskTaskId(normalizedTaskId);
    ctx.setShareTaskMode("unshare");
    const openModal = () => {
      const targetCount = getSharedFriendUidsForTask(normalizedTaskId).length;
      setShareTaskModalModeUi({ mode: "unshare", taskName, hasChoices: targetCount > 0 });
      renderShareTaskFriendOptions();
      setShareTaskStatus(targetCount > 0 ? "" : "This task is not currently shared with any friends.");
      if (els.shareTaskModal) (els.shareTaskModal as HTMLElement).style.display = "flex";
    };
    if (ctx.getCurrentUid() && !ctx.getGroupsFriendships().length) {
      void loadFriendships(String(ctx.getCurrentUid() || ""))
        .then((rows) => {
          ctx.setGroupsFriendships(rows || []);
          openModal();
        })
        .catch(() => openModal());
      return;
    }
    openModal();
  }

  async function refreshOwnSharedSummaries() {
    const uid = ctx.getCurrentUid();
    if (!uid) {
      ctx.setOwnSharedSummaries([]);
      return;
    }
    try {
      ctx.setOwnSharedSummaries((await loadSharedTaskSummariesForOwner(uid)) || []);
    } catch {
      ctx.setOwnSharedSummaries([]);
    }
  }

  function getOwnedSharedSummaryMismatchedTaskIds(): string[] {
    const uid = String(ctx.getCurrentUid() || "");
    const ownSharedSummaries = ctx.getOwnSharedSummaries();
    if (!uid || !Array.isArray(ownSharedSummaries) || !ownSharedSummaries.length) return [];
    const taskStateById = new Map<string, { running: boolean; color: string | null }>();
    ctx.getTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return;
      taskStateById.set(taskId, { running: !!task.running, color: normalizeTaskColor(task.color) || null });
    });
    const mismatched = new Set<string>();
    ownSharedSummaries.forEach((row) => {
      const ownerUid = String(row?.ownerUid || "").trim();
      if (!ownerUid || ownerUid !== uid) return;
      const taskId = String(row?.taskId || "").trim();
      const taskState = taskStateById.get(taskId);
      if (!taskId || !taskState) return;
      if (Math.floor(Number(row?.schemaVersion || 1) || 1) < 3) {
        mismatched.add(taskId);
        return;
      }
      const summaryRunning = String(row?.timerState || "").trim().toLowerCase() === "running";
      const taskRunning = taskState.running;
      if (summaryRunning !== taskRunning) mismatched.add(taskId);
      const summaryColor = normalizeTaskColor(row?.taskColor) || null;
      if (summaryColor !== taskState.color) mismatched.add(taskId);
    });
    return Array.from(mismatched);
  }

  async function reconcileOwnedSharedSummaryStates() {
    const mismatchedTaskIds = getOwnedSharedSummaryMismatchedTaskIds();
    if (!mismatchedTaskIds.length) return;
    await syncSharedTaskSummariesForTasks(mismatchedTaskIds);
  }

  async function syncSharedTaskSummariesForTask(taskId: string) {
    const uid = ctx.getCurrentUid();
    if (!uid || !taskId) return;
    const task = ctx.getTasks().find((row) => String(row.id || "") === String(taskId));
    if (!task) return;
    const friendUids = getSharedFriendUidsForTask(taskId);
    if (!friendUids.length) return;
    const metrics = computeTaskSharingMetrics(taskId);
    await Promise.all(
      friendUids.map((friendUid) =>
        upsertSharedTaskSummary({
          ownerUid: uid,
          friendUid,
          taskId,
          taskName: String(task.name || ""),
          taskColor: task.color,
          timerState: task.running ? "running" : "stopped",
          focusTrend7dMs: metrics.focusTrend7dMs,
          checkpointScaleMs: metrics.checkpointScaleMs,
          taskCreatedAtMs: metrics.createdAtMs,
          dailyGoalMs: metrics.dailyGoalMs,
          todayLoggedMs: metrics.todayLoggedMs,
          weekLoggedMs: metrics.weekLoggedMs,
          weekGoalMs: metrics.weekGoalMs,
          avgTimeLoggedThisWeekMs: metrics.avgWeekMs,
          totalTimeLoggedMs: metrics.totalMs,
        })
      )
    );
    await refreshOwnSharedSummaries();
  }

  async function syncSharedTaskSummariesForTasks(taskIds: string[]) {
    const ids = Array.from(new Set((taskIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
    if (!ids.length) return;
    await Promise.all(ids.map((id) => syncSharedTaskSummariesForTask(id).catch(() => {})));
  }

  async function submitShareTaskModal() {
    const uid = ctx.getCurrentUid();
    const activeMode = ctx.getShareTaskMode() === "unshare" ? "unshare" : "share";
    if (!uid) return;
    if (activeMode === "share" && ctx.getShareTaskIndex() == null) return;
    const tasks = ctx.getTasks();
    const activeTaskId =
      activeMode === "share"
        ? String(tasks[ctx.getShareTaskIndex()!]?.id || "").trim()
        : String(ctx.getShareTaskTaskId() || "").trim();
    const shareTask = activeMode === "share" && ctx.getShareTaskIndex() != null ? tasks[ctx.getShareTaskIndex()!] : null;
    if (!activeTaskId || (activeMode === "share" && !shareTask)) return;
    const selectedTargets = Array.from(
      (els.shareTaskFriendsList as HTMLElement | null)?.querySelectorAll<HTMLInputElement>("[data-share-friend-uid]:checked") || []
    )
      .map((el) => String(el.getAttribute("data-share-friend-uid") || "").trim())
      .filter(Boolean);
    if (activeMode === "unshare") {
      if (!selectedTargets.length) {
        setShareTaskStatus("Select at least one friend.", "error");
        return;
      }
      const results = await Promise.allSettled(
        selectedTargets.map((friendUid) => deleteSharedTaskSummary(uid, friendUid, activeTaskId))
      );
      const failures = results.filter((row) => row.status === "rejected");
      await refreshOwnSharedSummaries();
      ctx.render();
      if (!failures.length) {
        setShareTaskStatus("Task unshared successfully.", "success");
        window.setTimeout(() => closeShareTaskModal(), 500);
        return;
      }
      setShareTaskStatus(`Unshared with ${selectedTargets.length - failures.length} friend(s). ${failures.length} failed.`, "error");
      return;
    }
    if (!ctx.getGroupsFriendships().length) {
      try {
        ctx.setGroupsFriendships((await loadFriendships(uid)) || []);
      } catch {
        ctx.setGroupsFriendships([]);
      }
    }
    let targets: string[] = [];
    const availability = getShareTaskAvailability(activeTaskId);
    if (isShareTaskSpecificScopeSelected()) {
      targets = selectedTargets;
      if (!targets.length) {
        setShareTaskStatus("Select at least one friend.", "error");
        return;
      }
    } else {
      targets = availability.availableFriendRows.map((row) => row.friendUid);
      if (!targets.length) {
        setShareTaskStatus(
          availability.friendRows.length ? "This task is already shared with all friends." : "No friends available to share with.",
          "error"
        );
        return;
      }
    }
    if (!shareTask) return;
    const metrics = computeTaskSharingMetrics(activeTaskId);
    const writes = await Promise.all(
      targets.map((friendUid) =>
        upsertSharedTaskSummary({
          ownerUid: uid,
          friendUid,
          taskId: activeTaskId,
          taskName: String(shareTask.name || ""),
          taskColor: shareTask.color,
          timerState: shareTask.running ? "running" : "stopped",
          focusTrend7dMs: metrics.focusTrend7dMs,
          checkpointScaleMs: metrics.checkpointScaleMs,
          taskCreatedAtMs: metrics.createdAtMs,
          dailyGoalMs: metrics.dailyGoalMs,
          todayLoggedMs: metrics.todayLoggedMs,
          weekLoggedMs: metrics.weekLoggedMs,
          weekGoalMs: metrics.weekGoalMs,
          avgTimeLoggedThisWeekMs: metrics.avgWeekMs,
          totalTimeLoggedMs: metrics.totalMs,
        })
      )
    );
    const failures = writes.filter((row) => !row.ok).length;
    if (failures) {
      const firstFailure = writes.find((row) => !row.ok);
      const reason = String(firstFailure?.message || "").trim();
      setShareTaskStatus(
        `Shared with ${writes.length - failures} friend(s). ${failures} failed.${reason ? ` ${reason}` : ""}`,
        "error"
      );
    } else {
      setShareTaskStatus("");
      ctx.showActionConfirmation("Task shared.");
    }
    await refreshOwnSharedSummaries();
    ctx.render();
    if (!failures) window.setTimeout(() => closeShareTaskModal(), 500);
  }

  function beginGroupsLoading() {
    ctx.setGroupsLoadingDepth(ctx.getGroupsLoadingDepth() + 1);
    ctx.setGroupsLoading(true);
  }

  function endGroupsLoading() {
    const nextDepth = Math.max(0, ctx.getGroupsLoadingDepth() - 1);
    ctx.setGroupsLoadingDepth(nextDepth);
    ctx.setGroupsLoading(nextDepth > 0);
  }

  function prefersReducedFriendMotion() {
    if (typeof window === "undefined") return true;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function isUsableFriendAnimationRect(rect: DOMRect | null | undefined) {
    return !!rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 4 && rect.height > 4;
  }

  function findRequestRowForActionButton(button: HTMLElement | null) {
    return button?.closest?.(".groupsIncomingRequestRow") as HTMLElement | null;
  }

  function getIncomingRequestById(requestId: string) {
    return ctx
      .getGroupsIncomingRequests()
      .find((row) => String(row?.requestId || "").trim() === requestId) || null;
  }

  function getFriendProfileZoomSourceFromTarget(target: unknown) {
    const node = target as { closest?: (selector: string) => HTMLElement | null } | null;
    return node?.closest?.(".friendSharedTasksDetails[data-friend-uid]") || node?.closest?.("[data-friend-profile-open]") || null;
  }

  function captureFriendAcceptAnimationSource(button: HTMLElement | null, requestId: string): FriendAcceptAnimationSource | null {
    const request = getIncomingRequestById(requestId);
    const friendUid = String(request?.senderUid || "").trim();
    if (!friendUid) return null;
    const row = findRequestRowForActionButton(button);
    const identityRow = (row?.querySelector?.(".friendRequestIdentityRow") as HTMLElement | null) || row;
    const avatarEl = row?.querySelector?.(".friendRequestAvatar") as HTMLImageElement | null;
    const aliasEl = row?.querySelector?.(".friendRequestAlias") as HTMLElement | null;
    const peerEmail = String(request?.senderEmail || "").trim();
    const alias = String(aliasEl?.textContent || request?.senderEmail || friendUid).trim() || peerEmail || friendUid;
    const avatarSrc = String(avatarEl?.currentSrc || avatarEl?.src || ctx.getFriendAvatarSrcById(String(request?.senderAvatarId || "").trim()) || "").trim();
    const sourceRect = identityRow?.getBoundingClientRect?.() || null;
    return {
      friendUid,
      alias,
      avatarSrc,
      sourceRect: isUsableFriendAnimationRect(sourceRect) ? sourceRect : null,
    };
  }

  function findFriendAcceptAnimationTarget(friendUid: string) {
    const list = els.groupsFriendsList as HTMLElement | null;
    if (!list || !friendUid) return null;
    const rows = Array.from(list.querySelectorAll(".friendSharedTasksDetails[data-friend-uid]"));
    return (rows.find((node) => String(node.getAttribute("data-friend-uid") || "").trim() === friendUid) as HTMLElement | undefined) || null;
  }

  function triggerFriendAcceptLandingAccent(target: HTMLElement | null) {
    if (!target) return;
    target.classList.remove("isFriendAcceptLanding");
    void target.offsetWidth;
    target.classList.add("isFriendAcceptLanding");
    window.setTimeout(() => {
      target.classList.remove("isFriendAcceptLanding");
    }, prefersReducedFriendMotion() ? 260 : 1100);
  }

  function createFriendAcceptFloatClone(source: FriendAcceptAnimationSource, sourceRect: DOMRect) {
    const clone = document.createElement("div");
    clone.className = "friendAcceptFloatClone";
    clone.setAttribute("aria-hidden", "true");
    const avatar = document.createElement("img");
    avatar.className = "friendAcceptFloatAvatar";
    avatar.alt = "";
    if (source.avatarSrc) avatar.src = source.avatarSrc;
    const label = document.createElement("strong");
    label.className = "friendAcceptFloatName";
    label.textContent = source.alias;
    clone.append(avatar, label);
    clone.style.left = `${sourceRect.left}px`;
    clone.style.top = `${sourceRect.top}px`;
    clone.style.width = `${Math.min(Math.max(sourceRect.width, 180), 320)}px`;
    document.body.appendChild(clone);
    return clone;
  }

  function animateFriendAcceptToList(source: FriendAcceptAnimationSource | null): Promise<HTMLElement | null> {
    if (!source || typeof document === "undefined" || document.hidden) return Promise.resolve(null);
    const target = findFriendAcceptAnimationTarget(source.friendUid);
    if (!target) return Promise.resolve(null);
    triggerFriendAcceptLandingAccent(target);
    if (prefersReducedFriendMotion()) return Promise.resolve(target);
    const sourceRect = source.sourceRect;
    const targetIdentity = (target.querySelector(".friendIdentityRow") as HTMLElement | null) || target;
    const targetRect = targetIdentity.getBoundingClientRect?.() || null;
    if (!sourceRect || !isUsableFriendAnimationRect(sourceRect) || !isUsableFriendAnimationRect(targetRect) || !document.body) return Promise.resolve(target);
    if (typeof window.requestAnimationFrame !== "function") return Promise.resolve(target);
    const clone = createFriendAcceptFloatClone(source, sourceRect);
    const deltaX = targetRect.left - sourceRect.left;
    const deltaY = targetRect.top + Math.max(0, (targetRect.height - sourceRect.height) / 2) - sourceRect.top;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clone.removeEventListener("transitionend", finish);
        clone.remove();
        resolve(target);
      };
      clone.addEventListener("transitionend", finish, { once: true });
      window.setTimeout(finish, 760);
      window.requestAnimationFrame(() => {
        clone.classList.add("isFriendAcceptFloatActive");
        clone.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1.04)`;
        clone.style.opacity = "0";
      });
    });
  }

  async function runGroupsBusy<T>(message: string, timeoutMessage: string, work: () => Promise<T>): Promise<GroupsBusyResult<T>> {
    beginGroupsLoading();
    renderGroupsPage();
    let workingIndicatorKey: number | null = null;
    let indicatorDelayTimer = window.setTimeout(() => {
      workingIndicatorKey = ctx.showWorkingIndicator(message);
    }, 300);
    let timeoutHandle = 0 as number;
    try {
      const result = await Promise.race<
        | { kind: "value"; value: T }
        | { kind: "error"; error: unknown }
        | { kind: "timeout" }
      >([
        work()
          .then((value) => ({ kind: "value" as const, value }))
          .catch((error) => ({ kind: "error" as const, error })),
        new Promise<{ kind: "timeout" }>((resolve) => {
          timeoutHandle = window.setTimeout(() => resolve({ kind: "timeout" }), 60000);
        }),
      ]);
      if (result.kind === "timeout") return { ok: false, message: timeoutMessage, timedOut: true };
      if (result.kind === "error") return { ok: false, message: "", timedOut: false, error: result.error };
      return { ok: true, value: result.value, timedOut: false };
    } finally {
      if (indicatorDelayTimer) {
        window.clearTimeout(indicatorDelayTimer);
        indicatorDelayTimer = 0 as number;
      }
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      if (workingIndicatorKey != null) ctx.hideWorkingIndicator(workingIndicatorKey);
      endGroupsLoading();
      renderGroupsPage();
    }
  }

  async function loadGroupsSnapshot(uid: string) {
    return loadGroupsSnapshotForUid(uid);
  }

  function applyGroupsSnapshot(snapshot: Awaited<ReturnType<typeof loadGroupsSnapshot>>) {
    ctx.setGroupsIncomingRequests(snapshot.incoming);
    ctx.setGroupsOutgoingRequests(snapshot.outgoing);
    ctx.setGroupsFriendships(snapshot.friendships);
    ctx.setFriendProfileCacheByUid(snapshot.friendProfileCache);
    ctx.setFriendEmailByUid(snapshot.friendEmailByUid);
    ctx.setGroupsSharedSummaries(snapshot.sharedSummaries);
    ctx.setOwnSharedSummaries(snapshot.ownSharedSummaries);
  }

  function syncOpenFriendSharedTaskUidsFromDom() {
    const list = els.groupsFriendsList as HTMLElement | null;
    if (!list) return;
    const openIds = ctx.getOpenFriendSharedTaskUids();
    list.querySelectorAll(".friendSharedTasksDetails[data-friend-uid]").forEach((node) => {
      const details = node as HTMLDetailsElement;
      const friendUid = String(details.getAttribute("data-friend-uid") || "").trim();
      if (!friendUid) return;
      if (details.open) openIds.add(friendUid);
      else openIds.delete(friendUid);
    });
  }

  function wireFriendSharedTaskDetailsState() {
    const list = els.groupsFriendsList as HTMLElement | null;
    if (!list) return;
    const openIds = ctx.getOpenFriendSharedTaskUids();
    list.querySelectorAll(".friendSharedTasksDetails[data-friend-uid]").forEach((node) => {
      const details = node as HTMLDetailsElement;
      const friendUid = String(details.getAttribute("data-friend-uid") || "").trim();
      if (!friendUid) return;
      details.addEventListener("toggle", () => {
        if (details.open) openIds.add(friendUid);
        else openIds.delete(friendUid);
      });
    });
  }

  function renderFriendSharedTaskTitle(taskName: unknown, taskColor: unknown) {
    const color = normalizeTaskColor(taskColor);
    const colorPill = color
      ? `<span class="taskColorPill" aria-label="Task color" style="--task-color:${ctx.escapeHtmlUI(color)}"></span>`
      : "";
    return `<div class="friendSharedTaskTitle">${colorPill}<span class="friendSharedTaskTitleText">${ctx.escapeHtmlUI(taskName)}</span></div>`;
  }

  function renderGroupsRequestsList(container: HTMLElement | null, rows: any[], opts: { incoming: boolean }) {
    const titleEl = (opts.incoming ? els.groupsIncomingRequestsTitle : els.groupsOutgoingRequestsTitle) as HTMLElement | null;
    const detailsEl = (opts.incoming ? els.groupsIncomingRequestsDetails : els.groupsOutgoingRequestsDetails) as HTMLDetailsElement | null;
    const titleSuffix = opts.incoming ? "Incoming Requests" : "Outgoing Requests";
    if (titleEl) {
      titleEl.textContent = `${rows.length} ${titleSuffix}`;
      titleEl.classList.toggle("isEmptyCount", rows.length === 0);
    }
    if (detailsEl) detailsEl.open = rows.length > 0;
    if (!container) return;
    if (!rows.length) {
      container.classList.add("isEmptyStatus");
      container.textContent = opts.incoming ? "No incoming requests." : "No outgoing requests.";
      return;
    }
    const groupsLoading = ctx.getGroupsLoading();
    container.classList.remove("isEmptyStatus");
    container.innerHTML = rows
      .map((row) => {
        const peerUid = String((opts.incoming ? row.senderUid : row.receiverUid) || "").trim();
        const peerProfile = peerUid ? ctx.getFriendProfileCacheByUid()[peerUid] || null : null;
        const peerAliasRaw = peerProfile?.alias;
        const peerEmail = opts.incoming ? row.senderEmail : row.receiverEmail;
        const peerAlias = String(peerAliasRaw || "").trim() || String(peerEmail || "").trim() || "Unknown user";
        const status = String(row.status || "pending");
        const statusLabel = status[0].toUpperCase() + status.slice(1);
        const disabledAttr = groupsLoading ? ' disabled aria-disabled="true"' : "";
        const actionBtns =
          status !== "pending"
            ? ""
            : opts.incoming
              ? `<div class="groupsIncomingRequestActions"><button class="btn btn-ghost small friendRequestDeclineBtn" type="button" data-friend-action="decline" data-request-id="${ctx.escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Decline</button><span class="friendRequestActionSeparator" aria-hidden="true">|</span><button class="btn btn-ghost small friendRequestAcceptBtn" type="button" data-friend-action="approve" data-request-id="${ctx.escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Accept</button></div>`
              : `<button class="friendRequestCancelLink" type="button" data-friend-action="cancel" data-request-id="${ctx.escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Cancel request</button>`;
        const identityAvatarSrc = opts.incoming
          ? ctx.getFriendAvatarSrcById(String(row.senderAvatarId || "").trim())
          : ctx.buildFriendInitialAvatarDataUrl(peerAlias);
        const peerEmailText = String(peerEmail || "").trim();
        const requestEmailHtml =
          peerEmailText && peerEmailText.toLowerCase() !== peerAlias.toLowerCase()
            ? `<div class="friendRequestEmail">${ctx.escapeHtmlUI(peerEmailText)}</div>`
            : "";
        const incomingActionHtml = opts.incoming ? actionBtns : "";
        const outgoingActionHtml = !opts.incoming ? actionBtns : "";
        const identityHtml = `<div class="friendRequestIdentityRow">
          <img src="${ctx.escapeHtmlUI(identityAvatarSrc)}" alt="" aria-hidden="true" class="friendRequestAvatar" />
          <div class="friendRequestIdentityText">
            <div class="friendRequestAlias">${ctx.escapeHtmlUI(peerAlias)}</div>
            ${requestEmailHtml}
            ${incomingActionHtml}
            ${outgoingActionHtml}
          </div>
        </div>`;
        if (opts.incoming) {
          return `<div class="settingsDetailNote groupsIncomingRequestRow">${identityHtml}</div>`;
        }
        return `<div class="settingsDetailNote"><div><b class="friendRequestStatusTitle">${ctx.escapeHtmlUI(statusLabel)}</b></div>${identityHtml}</div>`;
      })
      .join("");
  }

  function renderGroupsFriendsList() {
    if (!els.groupsFriendsList) return;
    syncOpenFriendSharedTaskUidsFromDom();
    els.groupsFriendsList.className = "settingsDetailNote";
    const uid = ctx.getCurrentUid();
    const openIds = ctx.getOpenFriendSharedTaskUids();
    if (!uid) {
      openIds.clear();
      els.groupsFriendsList.textContent = "Sign in to view friends.";
      return;
    }
    if (!ctx.getGroupsFriendships().length) {
      openIds.clear();
      els.groupsFriendsList.textContent = "";
      return;
    }
    const sharedSummaries = ctx.getGroupsSharedSummaries();
    const friendRows = ctx
      .getGroupsFriendships()
      .map((row) => {
        const friendUid = row.users[0] === uid ? row.users[1] : row.users[0];
        const profile = ctx.getMergedFriendProfile(friendUid, row.profileByUid?.[friendUid]);
        const alias = String(profile?.alias || "").trim() || friendUid;
        const avatarSrc = ctx.getFriendAvatarSrc(profile);
        const summaries = sharedSummaries.filter((entry) => entry.ownerUid === friendUid);
        const isOpen = openIds.has(friendUid);
        return { friendUid, alias, avatarSrc, summaries, isOpen };
      })
      .sort((a, b) => {
        const byAlias = a.alias.localeCompare(b.alias, undefined, { sensitivity: "base" });
        if (byAlias !== 0) return byAlias;
        return a.friendUid.localeCompare(b.friendUid, undefined, { sensitivity: "base" });
      });

    const visibleFriendUids = new Set(friendRows.map((row) => row.friendUid).filter(Boolean));
    openIds.forEach((friendUid) => {
      if (!visibleFriendUids.has(friendUid)) openIds.delete(friendUid);
    });

    els.groupsFriendsList.innerHTML = friendRows
      .map((row) => {
        const summaryHtml = row.summaries
          .map((entry) => {
            const timerState = String(entry.timerState || "stopped").toLowerCase() === "running" ? "Running" : "Stopped";
            const timerStateKey = timerState.toLowerCase() === "running" ? "running" : "stopped";
            const timerStateClass =
              String(entry.timerState || "stopped").toLowerCase() === "running"
                ? "friendSharedTaskState isRunning"
                : "friendSharedTaskState isStopped";
            return `<div class="dashboardCard friendSharedTaskCard friendSharedTaskCardState-${ctx.escapeHtmlUI(timerStateKey)}">
              <div class="friendSharedTaskCardLayout">
                <div class="friendSharedTaskInfo">
                  ${renderFriendSharedTaskTitle(entry.taskName, entry.taskColor)}
                  <div class="friendSharedTaskMeta">Status: <span class="${timerStateClass}">${ctx.escapeHtmlUI(timerState)}</span></div>
                  ${renderSharedTaskMetricRows(entry, ctx.escapeHtmlUI)}
                </div>
              </div>
            </div>`;
          })
          .join("");
        const taskCount = row.summaries.length;
        const sharedCountLabel = `${taskCount} task${taskCount === 1 ? "" : "s"} shared with you`;
        const sharedCountMetaHtml =
          taskCount > 0 ? `<span class="friendIdentityMeta">${ctx.escapeHtmlUI(sharedCountLabel)}</span>` : "";
        return `<div class="friendEntryWrap">
          <details class="friendSharedTasksDetails" data-friend-uid="${ctx.escapeHtmlUI(row.friendUid)}"${row.isOpen ? " open" : ""}>
            <summary class="settingsDetailNote friendIdentityRow">
              <button class="friendIdentityBtn friendAvatarButton" type="button" data-friend-profile-open="${ctx.escapeHtmlUI(row.friendUid)}" aria-label="Open ${ctx.escapeHtmlUI(row.alias)} profile">
                <span class="friendAvatar friendIdentityAvatarWrap" aria-hidden="true">
                  <img class="friendAvatarImg friendIdentityAvatar" src="${ctx.escapeHtmlUI(row.avatarSrc)}" alt="" />
                </span>
              </button>
              <div class="friendIdentityText">
                <button class="friendIdentityBtn friendIdentityNameBtn" type="button" data-friend-profile-open="${ctx.escapeHtmlUI(row.friendUid)}">
                  <strong class="friendName friendIdentityAlias">${ctx.escapeHtmlUI(row.alias)}</strong>
                </button>
                ${sharedCountMetaHtml}
              </div>
            </summary>
            <div class="friendSharedTasksList">${summaryHtml || `<div class="settingsDetailNote isEmptyStatus">No tasks shared with you.</div>`}</div>
          </details>
        </div>`;
      })
      .join("");
    wireFriendSharedTaskDetailsState();
  }

  function renderGroupsSharedByYouList() {
    const container = els.groupsSharedByYouList as HTMLElement | null;
    const titleEl = els.groupsSharedByYouTitle as HTMLElement | null;
    if (!container) return;
    const ownSharedSummaries = ctx.getOwnSharedSummaries();
    const uniqueSharedTaskCount = new Set(ownSharedSummaries.map((entry) => String(entry.taskId || "").trim()).filter(Boolean)).size;
    if (titleEl) {
      titleEl.textContent = `${uniqueSharedTaskCount} shared by you`;
      titleEl.classList.toggle("isEmptyCount", uniqueSharedTaskCount === 0);
    }
    if (!ownSharedSummaries.length) {
      container.classList.add("sharedTasksEmpty");
      container.textContent = "No shared tasks.";
      return;
    }

    const uid = ctx.getCurrentUid();
    const friendNameByUid = new Map<string, string>();
    ctx.getGroupsFriendships().forEach((friendship) => {
      const users = friendship.users;
      if (!uid || users.indexOf(uid) === -1) return;
      const friendUid = users[0] === uid ? users[1] : users[0];
      if (!friendUid) return;
      const alias = String(friendship.profileByUid?.[friendUid]?.alias || "").trim();
      friendNameByUid.set(friendUid, alias || friendUid);
    });

    const taskColorById = new Map<string, string | null>();
    ctx.getTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return;
      taskColorById.set(taskId, normalizeTaskColor(task.color) || null);
    });
    const sharedByTaskId = new Map<string, { taskId: string; taskName: string; taskColor: string | null; friendLabels: string[] }>();
    ownSharedSummaries.forEach((entry) => {
      const taskId = String(entry.taskId || "").trim();
      if (!taskId) return;
      const friendLabel = friendNameByUid.get(entry.friendUid) || String(entry.friendUid || "").trim() || "Unknown friend";
      const existing = sharedByTaskId.get(taskId);
      if (existing) {
        existing.taskColor = existing.taskColor || normalizeTaskColor(entry.taskColor) || taskColorById.get(taskId) || null;
        if (existing.friendLabels.indexOf(friendLabel) === -1) existing.friendLabels.push(friendLabel);
        return;
      }
      sharedByTaskId.set(taskId, {
        taskId,
        taskName: String(entry.taskName || "").trim() || "Untitled task",
        taskColor: normalizeTaskColor(entry.taskColor) || taskColorById.get(taskId) || null,
        friendLabels: [friendLabel],
      });
    });

    const listHtml = Array.from(sharedByTaskId.values())
      .sort((a, b) => a.taskName.localeCompare(b.taskName, undefined, { sensitivity: "base" }))
      .map((entry) => {
        const friendLabel = entry.friendLabels.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).join(", ");
        return `<div class="dashboardCard friendSharedTaskCard isJumpCard" role="button" tabindex="0" data-shared-owned-task-id="${ctx.escapeHtmlUI(entry.taskId)}" title="Open task">
          <div class="friendSharedTaskInfo">
            ${renderFriendSharedTaskTitle(entry.taskName, entry.taskColor)}
            <div class="friendSharedTaskMeta">Shared with: ${ctx.escapeHtmlUI(friendLabel)}</div>
            <div class="friendSharedTaskActions">
              <button class="btn btn-ghost small" type="button" data-friend-action="open-unshare-task" data-task-id="${ctx.escapeHtmlUI(entry.taskId)}">Change</button>
            </div>
          </div>
        </div>`;
      })
      .join("");

    container.classList.remove("sharedTasksEmpty");
    container.innerHTML = `<div class="friendSharedTasksGrid">${listHtml}</div>`;
  }

  function renderFriendsFooterAlertBadge() {
    const badgeEls = [els.footerTest2AlertBadge, els.commandCenterGroupsAlertBadge].filter(
      (badgeEl): badgeEl is HTMLElement => !!badgeEl
    );
    if (!badgeEls.length) return;
    if (!canUseSocialFeatures()) {
      badgeEls.forEach((badgeEl) => {
        badgeEl.style.display = "none";
        badgeEl.textContent = "";
      });
      return;
    }
    const uid = ctx.getCurrentUid();
    const count = uid ? Math.max(0, Number(ctx.getGroupsIncomingRequests().length) || 0) : 0;
    if (count <= 0) {
      badgeEls.forEach((badgeEl) => {
        badgeEl.style.display = "none";
        badgeEl.textContent = "";
        badgeEl.setAttribute("aria-label", "No incoming friend requests");
      });
      return;
    }
    const countLabel = count > 99 ? "99+" : String(count);
    badgeEls.forEach((badgeEl) => {
      badgeEl.style.display = "inline-flex";
      badgeEl.textContent = countLabel;
      badgeEl.setAttribute("aria-label", `${count} incoming friend request${count === 1 ? "" : "s"}`);
    });
  }

  function renderGroupsPage() {
    if (!canUseSocialFeatures()) {
      renderFriendsFooterAlertBadge();
      renderGroupsLockedState();
      return;
    }
    renderFriendsFooterAlertBadge();
    renderGroupsRequestsList(els.groupsIncomingRequestsList as HTMLElement | null, ctx.getGroupsIncomingRequests(), { incoming: true });
    renderGroupsRequestsList(els.groupsOutgoingRequestsList as HTMLElement | null, ctx.getGroupsOutgoingRequests(), { incoming: false });
    renderGroupsFriendsList();
    renderGroupsSharedByYouList();
    if (els.openFriendRequestModalBtn) els.openFriendRequestModalBtn.disabled = ctx.getGroupsLoading() || !ctx.getCurrentUid();
    if (els.friendRequestSendBtn) els.friendRequestSendBtn.disabled = ctx.getGroupsLoading();
    if (els.friendProfileDeleteBtn) els.friendProfileDeleteBtn.disabled = ctx.getGroupsLoading();
  }

  async function refreshGroupsData(opts?: { preserveStatus?: boolean }) {
    if (!canUseSocialFeatures()) {
      renderGroupsPage();
      return;
    }
    const uid = ctx.getCurrentUid();
    if (!uid) {
      ctx.setGroupsIncomingRequests([]);
      ctx.setGroupsOutgoingRequests([]);
      ctx.setGroupsFriendships([]);
      ctx.setGroupsSharedSummaries([]);
      ctx.setOwnSharedSummaries([]);
      ctx.setFriendProfileCacheByUid({});
      ctx.setFriendEmailByUid({});
      renderGroupsPage();
      return;
    }
    const refreshSeq = ctx.getGroupsRefreshSeq() + 1;
    ctx.setGroupsRefreshSeq(refreshSeq);
    try {
      const snapshot = await loadGroupsSnapshot(uid);
      if (refreshSeq !== ctx.getGroupsRefreshSeq()) return;
      applyGroupsSnapshot(snapshot);
    } catch {
      if (refreshSeq !== ctx.getGroupsRefreshSeq()) return;
      if (!opts?.preserveStatus) ctx.showActionConfirmation("Could not load friend data.");
    } finally {
      renderGroupsPage();
    }
  }

  async function handleSendFriendRequest() {
    const uid = ctx.getCurrentUid();
    const auth = getFirebaseAuthClient();
    const email = auth?.currentUser?.email || null;
    const receiverEmail = String(els.friendRequestEmailInput?.value || "").trim();
    setFriendRequestModalStatus("");
    if (!uid || !email) {
      setFriendRequestModalStatus("Sign in to send friend requests.", "error");
      renderGroupsPage();
      return;
    }
    const result = await runGroupsBusy("Sending friend request...", "Friend request timed out. Please try again.", () =>
      sendFriendRequest(uid, email, receiverEmail)
    );
    if (!result.ok) {
      const message = result.timedOut ? result.message : "Could not send friend request.";
      setFriendRequestModalStatus(`Friend request failed: ${message}`, "error");
      renderGroupsPage();
      return;
    }
    if (!result.value.ok) {
      const failureMessage = result.value.message || "Could not find a matching email.";
      setFriendRequestModalStatus(`Friend request failed: ${failureMessage}`, "error");
      renderGroupsPage();
      return;
    }
    setFriendRequestModalStatus("");
    ctx.showActionConfirmation("Friend request sent.");
    renderGroupsPage();
    void refreshGroupsData({ preserveStatus: true });
    window.setTimeout(() => {
      closeFriendRequestModal();
    }, 700);
  }

  async function handleFriendRequestAction(
    requestId: string,
    action: "approve" | "decline" | "cancel",
    acceptAnimationSource?: FriendAcceptAnimationSource | null
  ) {
    const uid = ctx.getCurrentUid();
    if (!uid || !requestId) return;
    const pendingStatus =
      action === "approve" ? "Approving request..." : action === "decline" ? "Declining request..." : "Cancelling request...";
    const timeoutStatus =
      action === "approve"
        ? "Approving request timed out. Please try again."
        : action === "decline"
          ? "Declining request timed out. Please try again."
          : "Cancelling request timed out. Please try again.";
    const result = await runGroupsBusy(pendingStatus, timeoutStatus, async () =>
      action === "approve"
        ? await approveFriendRequest(requestId, uid)
        : action === "decline"
          ? await declineFriendRequest(requestId, uid)
          : await cancelOutgoingFriendRequest(requestId, uid)
    );
    if (!result.ok) {
      ctx.showActionConfirmation(result.timedOut ? result.message : "Could not update friend request.");
      renderGroupsPage();
      return;
    }
    if (!result.value.ok) {
      ctx.showActionConfirmation(result.value.message || "Action failed.");
      renderGroupsPage();
      return;
    }
    const completeStatus = getFriendRequestActionCompleteStatus(action);
    ctx.showActionConfirmation(completeStatus);
    renderGroupsPage();
    if (action === "approve" && acceptAnimationSource) {
      await refreshGroupsData({ preserveStatus: true });
      const acceptedFriendRow = await animateFriendAcceptToList(acceptAnimationSource);
      if (acceptedFriendRow) openFriendProfileModal(acceptAnimationSource.friendUid, { zoomSource: acceptedFriendRow });
      return;
    }
    void refreshGroupsData({ preserveStatus: true });
  }

  function registerGroupsEvents() {
    ctx.on(els.openFriendRequestModalBtn, "click", (e: any) => {
      e?.preventDefault?.();
      if (ctx.getGroupsLoading()) return;
      openFriendRequestModal();
    });
    ctx.on(els.friendRequestCancelBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeFriendRequestModal();
    });
    ctx.on(els.friendRequestModal, "click", (e: any) => {
      if (e?.target === els.friendRequestModal) closeFriendRequestModal();
    });
    ctx.on(els.friendProfileCloseBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeFriendProfileModal();
    });
    ctx.on(els.friendProfileModal, "click", (e: any) => {
      if (e?.target === els.friendProfileModal) closeFriendProfileModal();
    });
    ctx.on(els.friendProfileDeleteBtn, "click", (e: any) => {
      e?.preventDefault?.();
      if (ctx.getGroupsLoading()) return;
      const fallbackName = String(els.friendProfileName?.textContent || "").trim();
      const friendName = String(ctx.getActiveFriendProfileName() || fallbackName || "this user").trim();
      ctx.confirm("Remove Friend", `Remove ${friendName} as a friend?`, {
        okLabel: "Remove",
        cancelLabel: "Cancel",
        onOk: () => {
          if (ctx.getGroupsLoading()) return;
          const ownUid = String(ctx.getCurrentUid() || "").trim();
          const friendUid = String(ctx.getActiveFriendProfileUid() || "").trim();
          if (!ownUid) {
            ctx.closeConfirm();
            ctx.showActionConfirmation("Sign in to manage friends.");
            return;
          }
          if (!friendUid) {
            ctx.closeConfirm();
            ctx.showActionConfirmation("Friend account could not be resolved.");
            return;
          }
          ctx.closeConfirm();
          closeFriendProfileModal();
          renderGroupsPage();
          void (async () => {
            const result = await runGroupsBusy(`Deleting ${friendName}...`, "Deleting friend timed out. Please try again.", () =>
              deleteFriendship(ownUid, friendUid)
            );
            if (!result.ok) {
              ctx.showActionConfirmation(result.timedOut ? result.message : "Could not delete friend.");
              renderGroupsPage();
              return;
            }
            if (!result.value.ok) {
              ctx.showActionConfirmation(result.value.message || "Could not delete friend.");
              renderGroupsPage();
              return;
            }
            ctx.setActiveFriendProfileUid(null);
            ctx.setActiveFriendProfileName("");
            ctx.setGroupsFriendships(ctx.getGroupsFriendships().filter((row) => !row.users.includes(friendUid)));
            ctx.setGroupsSharedSummaries(
              ctx
                .getGroupsSharedSummaries()
                .filter((row) => String(row.ownerUid || "").trim() !== friendUid && String(row.friendUid || "").trim() !== friendUid)
            );
            ctx.setOwnSharedSummaries(ctx.getOwnSharedSummaries().filter((row) => String(row.friendUid || "").trim() !== friendUid));
            const nextCache = { ...ctx.getFriendProfileCacheByUid() };
            delete nextCache[friendUid];
            ctx.setFriendProfileCacheByUid(nextCache);
            ctx.showActionConfirmation(result.value.message || `${friendName} was removed from your friends.`);
            renderGroupsPage();
            void refreshGroupsData({ preserveStatus: true });
          })();
        },
      });
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isDeleteFriendConfirm");
    });
    ctx.on(els.friendRequestSendBtn, "click", (e: any) => {
      e?.preventDefault?.();
      if (ctx.getGroupsLoading()) return;
      void handleSendFriendRequest();
    });
    ctx.on(els.friendRequestEmailInput, "pointerdown", () => {
      if (els.friendRequestEmailInput) els.friendRequestEmailInput.value = "";
    });
    ctx.on(els.friendRequestEmailInput, "keydown", (e: any) => {
      if (e?.key !== "Enter") return;
      e?.preventDefault?.();
      if (ctx.getGroupsLoading()) return;
      void handleSendFriendRequest();
    });
    ctx.on(els.shareTaskCancelBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeShareTaskModal();
    });
    ctx.on(els.shareTaskModal, "click", (e: any) => {
      if (e?.target === els.shareTaskModal) {
        closeShareTaskModal();
        return;
      }
      const scopeOption = e?.target?.closest?.("[data-share-task-scope-option]") as HTMLElement | null;
      if (scopeOption) {
        e?.preventDefault?.();
        setShareTaskScopeValue(String(scopeOption.getAttribute("data-share-task-scope-option") || "all"));
        setShareTaskScopeDropdownOpen(false);
        return;
      }
      const scopeButton = e?.target?.closest?.("#shareTaskScopeDropdownButton") as HTMLElement | null;
      if (scopeButton) {
        e?.preventDefault?.();
        const expanded = scopeButton.getAttribute("aria-expanded") === "true";
        setShareTaskScopeDropdownOpen(!expanded);
        return;
      }
      if (!e?.target?.closest?.("#shareTaskScopeDropdown")) setShareTaskScopeDropdownOpen(false);
    });
    ctx.on(els.shareTaskModal, "keydown", handleShareTaskScopeDropdownKeyDown);
    ctx.on(els.shareTaskScopeSelect, "change", () => {
      syncShareTaskScopeDropdownUi();
      renderShareTaskFriendOptions();
      syncShareTaskScopeUi();
    });
    ctx.on(els.shareTaskConfirmBtn, "click", (e: any) => {
      e?.preventDefault?.();
      void submitShareTaskModal();
    });
    ctx.on(els.groupsIncomingRequestsList, "click", (e: any) => {
      const btn = e.target?.closest?.("[data-friend-action][data-request-id]") as HTMLElement | null;
      if (!btn) return;
      const requestId = String(btn.getAttribute("data-request-id") || "").trim();
      const action = btn.getAttribute("data-friend-action");
      if (!requestId) return;
      if (action !== "approve" && action !== "decline" && action !== "cancel") return;
      if (ctx.getGroupsLoading()) return;
      const acceptAnimationSource = action === "approve" ? captureFriendAcceptAnimationSource(btn, requestId) : null;
      void handleFriendRequestAction(requestId, action, acceptAnimationSource);
    });
    ctx.on(els.groupsOutgoingRequestsList, "click", (e: any) => {
      const btn = e.target?.closest?.("[data-friend-action][data-request-id]") as HTMLElement | null;
      if (!btn) return;
      const requestId = String(btn.getAttribute("data-request-id") || "").trim();
      const action = btn.getAttribute("data-friend-action");
      if (!requestId) return;
      if (action !== "approve" && action !== "decline" && action !== "cancel") return;
      if (ctx.getGroupsLoading()) return;
      void handleFriendRequestAction(requestId, action);
    });
    ctx.on(els.groupsFriendsList, "click", (e: any) => {
      const friendUid = getFriendProfileOpenUidFromTarget(e.target);
      if (!friendUid) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      openFriendProfileModal(friendUid, { zoomSource: getFriendProfileZoomSourceFromTarget(e.target) });
    });
    ctx.on(els.groupsFriendsList, "keydown", (e: any) => {
      if (e?.key !== "Enter" && e?.key !== " ") return;
      const friendUid = getFriendProfileOpenUidFromTarget(e.target);
      if (!friendUid) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      openFriendProfileModal(friendUid, { zoomSource: getFriendProfileZoomSourceFromTarget(e.target) });
    });
    ctx.on(els.groupsSharedByYouList, "click", (e: any) => {
      const unshareBtn = e.target?.closest?.('[data-friend-action="open-unshare-task"]') as HTMLElement | null;
      if (unshareBtn) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        const taskId = String(unshareBtn.getAttribute("data-task-id") || "").trim();
        if (!taskId) return;
        openUnshareTaskModal(taskId);
        return;
      }
      const card = e.target?.closest?.("[data-shared-owned-task-id]") as HTMLElement | null;
      if (!card) return;
      const taskId = String(card.getAttribute("data-shared-owned-task-id") || "").trim();
      if (!taskId) return;
      ctx.jumpToTaskById(taskId);
    });
    ctx.on(els.groupsSharedByYouList, "keydown", (e: any) => {
      if (e?.key !== "Enter" && e?.key !== " ") return;
      const actionBtn = e.target?.closest?.('[data-friend-action="open-unshare-task"]') as HTMLElement | null;
      if (actionBtn) return;
      const card = e.target?.closest?.("[data-shared-owned-task-id]") as HTMLElement | null;
      if (!card) return;
      e?.preventDefault?.();
      const taskId = String(card.getAttribute("data-shared-owned-task-id") || "").trim();
      if (!taskId) return;
      ctx.jumpToTaskById(taskId);
    });
  }

  return {
    renderGroupsPage,
    renderFriendsFooterAlertBadge,
    refreshGroupsData,
    openFriendProfileModal,
    closeFriendProfileModal,
    openFriendRequestModal,
    closeFriendRequestModal,
    openShareTaskModal,
    openUnshareTaskModal,
    closeShareTaskModal,
    refreshOwnSharedSummaries,
    reconcileOwnedSharedSummaryStates,
    syncSharedTaskSummariesForTask,
    syncSharedTaskSummariesForTasks,
    registerGroupsEvents,
  };
}
