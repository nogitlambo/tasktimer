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
  loadIncomingRequests,
  loadOutgoingRequests,
  loadSharedTaskSummariesForOwner,
  loadSharedTaskSummariesForViewer,
  sendFriendRequest,
  upsertSharedTaskSummary,
} from "../lib/friendsStore";
import { getCalendarWeekStartMs } from "../lib/history";
import { getRankLabelById, getRankThumbnailDescriptor } from "../lib/rewards";
import type { TaskTimerGroupsContext } from "./context";
import { hideOverlay, showOverlay } from "./overlay-visibility";

type GroupsBusyResult<T> =
  | { ok: true; value: T; timedOut: false }
  | { ok: false; message: string; timedOut: boolean; error?: unknown };

export function createTaskTimerGroups(ctx: TaskTimerGroupsContext) {
  const { els } = ctx;

  function canUseSocialFeatures() {
    return ctx.hasEntitlement("socialFeatures");
  }

  function renderGroupsLockedState() {
    setGroupsStatus("Friends and shared tasks are available on Pro.");
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

  function setGroupsStatus(message: string, tone: "error" | "success" | "info" = "info") {
    const host = els.groupsFriendRequestStatus as HTMLElement | null;
    if (!host) return;
    const text = String(message || "").trim();
    host.textContent = text;
    host.style.display = text ? "block" : "none";
    host.style.color = "";
    if (!text) return;
    if (tone === "error") {
      host.style.color = "#ff8f8f";
      return;
    }
    if (tone === "success") {
      host.style.color = "var(--accent, #35e8ff)";
      return;
    }
    host.style.color = "rgba(188,214,230,.78)";
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

  function closeFriendProfileModal() {
    hideOverlay(els.friendProfileModal as HTMLElement | null);
    ctx.setActiveFriendProfileUid(null);
    ctx.setActiveFriendProfileName("");
  }

  function openFriendProfileModal(friendUid: string) {
    const uid = ctx.getCurrentUid();
    if (!uid || !els.friendProfileModal) return;
    const targetUid = String(friendUid || "").trim();
    if (!targetUid) return;

    const rankedFriends = ctx
      .getGroupsFriendships()
      .map((row) => {
        const peerUid = row.users[0] === uid ? row.users[1] : row.users[0];
        if (!peerUid) return null;
        const profile = ctx.getMergedFriendProfile(peerUid, row.profileByUid?.[peerUid]);
        const alias = String(profile?.alias || "").trim() || peerUid;
        const currentRankId = String(profile?.currentRankId || "").trim() || "unranked";
        const totalXp = Math.max(0, Math.floor(Number(profile?.totalXp || 0) || 0));
        const avatarSrc = ctx.getFriendAvatarSrc(profile);
        const sharedCount = ctx.getGroupsSharedSummaries().filter((entry) => entry.ownerUid === peerUid).length;
        const createdAtMs =
          row.createdAt && typeof (row.createdAt as any).toMillis === "function"
            ? Number((row.createdAt as any).toMillis())
            : Number.NaN;
        return { peerUid, alias, avatarSrc, currentRankId, totalXp, sharedCount, createdAtMs };
      })
      .filter(
        (row): row is {
          peerUid: string;
          alias: string;
          avatarSrc: string;
          currentRankId: string;
          totalXp: number;
          sharedCount: number;
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
      els.friendProfileAvatar.alt = `${row.alias} avatar`;
    }
    if (els.friendProfileName) els.friendProfileName.textContent = row.alias;
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
    if (els.friendProfileRank) els.friendProfileRank.textContent = `Rank: ${getRankLabelById(row.currentRankId)}`;
    if (els.friendProfileMemberSince) els.friendProfileMemberSince.textContent = `Member since ${memberSinceText}`;
    ctx.setActiveFriendProfileUid(row.peerUid);
    ctx.setActiveFriendProfileName(row.alias);
    showOverlay(els.friendProfileModal as HTMLElement | null);
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
    const weekStartMs = getCalendarWeekStartMs(new Date());
    const history = ctx.getHistoryByTaskId();
    const weekEntries = (history[taskId] || []).filter((entry) => ctx.normalizeHistoryTimestampMs((entry as any)?.ts) >= weekStartMs);
    const weekTotalMs = weekEntries.reduce((sum, entry) => sum + Math.max(0, Number((entry as any)?.ms || 0)), 0);
    const daysElapsed = Math.max(1, Math.floor((Date.now() - weekStartMs) / (24 * 60 * 60 * 1000)) + 1);
    const avgWeekMs = Math.floor(weekTotalMs / daysElapsed);
    const allHistoryMs = (history[taskId] || []).reduce((sum, entry) => sum + Math.max(0, Number((entry as any)?.ms || 0)), 0);
    const task = ctx.getTasks().find((row) => String(row.id || "") === String(taskId));
    const runningMs =
      task && task.running && Number.isFinite(Number(task.startMs))
        ? Math.max(0, Date.now() - Number(task.startMs || 0))
        : 0;
    const focusTrend7dMs = [0, 0, 0, 0, 0, 0, 0];
    weekEntries.forEach((entry) => {
      const ts = ctx.normalizeHistoryTimestampMs((entry as any)?.ts);
      if (!ts) return;
      const dayIdx = new Date(ts).getDay();
      if (dayIdx >= 0 && dayIdx <= 6) focusTrend7dMs[dayIdx] += Math.max(0, Number((entry as any)?.ms || 0));
    });
    if (runningMs > 0) {
      const dayIdx = new Date().getDay();
      if (dayIdx >= 0 && dayIdx <= 6) focusTrend7dMs[dayIdx] += runningMs;
    }
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
      avgWeekMs,
      totalMs: Math.floor(allHistoryMs + runningMs),
      focusTrend7dMs: focusTrend7dMs.map((value) => Math.max(0, Math.floor(Number(value) || 0))),
      checkpointScaleMs,
    };
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

  function buildSharedTrendBarSvgMarkup(msByDay: number[], checkpointScaleMs?: number | null): string {
    const vals = new Array(7).fill(0).map((_, i) => Math.max(0, Number((msByDay || [])[i] || 0)));
    const scaleRef = Math.max(0, Number(checkpointScaleMs || 0));
    const maxVal = Math.max(...vals, 1);
    const width = 170;
    const height = 56;
    const padX = 6;
    const padY = 6;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;
    const step = usableW / 7;
    const barW = Math.max(6, Math.min(14, step - 4));
    const checkpointLines: string[] = [];
    if (scaleRef > 0) {
      let n = 1;
      while (n <= 8) {
        const yVal = scaleRef * n;
        if (yVal > maxVal) break;
        const y = padY + usableH - (usableH * yVal) / maxVal;
        checkpointLines.push(
          `<line class="friendSharedTrendCheckpointLine" x1="${padX.toFixed(1)}" y1="${y.toFixed(
            1
          )}" x2="${(padX + usableW).toFixed(1)}" y2="${y.toFixed(1)}" />`
        );
        n += 1;
      }
    }
    const bars = vals
      .map((value, i) => {
        const h = (usableH * value) / maxVal;
        const x = padX + i * step + (step - barW) / 2;
        const y = padY + usableH - h;
        return `<rect class="friendSharedTrendBar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(
          1
        )}" height="${Math.max(1, h).toFixed(1)}" rx="1" ry="1" />`;
      })
      .join("");
    return `${checkpointLines.join("")}${bars}`;
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

  function getShareTaskFriendRows() {
    const uid = ctx.getCurrentUid();
    if (!uid || !ctx.getGroupsFriendships().length) return [] as Array<{ friendUid: string; alias: string }>;
    return ctx
      .getGroupsFriendships()
      .map((row) => {
        const friendUid = row.users[0] === uid ? row.users[1] : row.users[0];
        if (!friendUid) return null;
        const alias = String(row.profileByUid?.[friendUid]?.alias || "").trim() || friendUid;
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
          : "Choose who should receive this task and its live progress.";
    }
    if (scopeField) scopeField.style.display = mode === "share" ? "grid" : "none";
    if (friendsField) {
      friendsField.style.display = mode === "share" ? (isShareTaskSpecificScopeSelected() ? "grid" : "none") : "grid";
    }
    if (friendsLabel) {
      friendsLabel.textContent = mode === "unshare" ? "Select friend(s) to unshare" : "Select friend(s)";
    }
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
    const runningByTaskId = new Map<string, boolean>();
    ctx.getTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return;
      runningByTaskId.set(taskId, !!task.running);
    });
    const mismatched = new Set<string>();
    ownSharedSummaries.forEach((row) => {
      const ownerUid = String(row?.ownerUid || "").trim();
      if (!ownerUid || ownerUid !== uid) return;
      const taskId = String(row?.taskId || "").trim();
      if (!taskId || !runningByTaskId.has(taskId)) return;
      const summaryRunning = String(row?.timerState || "").trim().toLowerCase() === "running";
      const taskRunning = !!runningByTaskId.get(taskId);
      if (summaryRunning !== taskRunning) mismatched.add(taskId);
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
          timerState: task.running ? "running" : "stopped",
          focusTrend7dMs: metrics.focusTrend7dMs,
          checkpointScaleMs: metrics.checkpointScaleMs,
          taskCreatedAtMs: metrics.createdAtMs,
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
          timerState: shareTask.running ? "running" : "stopped",
          focusTrend7dMs: metrics.focusTrend7dMs,
          checkpointScaleMs: metrics.checkpointScaleMs,
          taskCreatedAtMs: metrics.createdAtMs,
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
      setShareTaskStatus("Task shared successfully.", "success");
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
    const [incoming, outgoing, friendships] = await Promise.all([
      loadIncomingRequests(uid),
      loadOutgoingRequests(uid),
      loadFriendships(uid),
    ]);
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
        const profile = await loadFriendProfile(peerUid);
        return [peerUid, profile] as const;
      })
    );
    const nextFriendProfileCache = {} as ReturnType<TaskTimerGroupsContext["getFriendProfileCacheByUid"]>;
    profileEntries.forEach((result) => {
      if (result.status !== "fulfilled" || !result.value) return;
      const [peerUid, profile] = result.value;
      if (!peerUid) return;
      nextFriendProfileCache[peerUid] = profile;
    });
    const [sharedForViewerResult, sharedForOwnerResult] = await Promise.allSettled([
      loadSharedTaskSummariesForViewer(uid),
      loadSharedTaskSummariesForOwner(uid),
    ]);
    return {
      incoming,
      outgoing,
      friendships,
      friendProfileCache: nextFriendProfileCache,
      sharedSummaries: sharedForViewerResult.status === "fulfilled" ? sharedForViewerResult.value || [] : [],
      ownSharedSummaries: sharedForOwnerResult.status === "fulfilled" ? sharedForOwnerResult.value || [] : [],
    };
  }

  function applyGroupsSnapshot(snapshot: Awaited<ReturnType<typeof loadGroupsSnapshot>>) {
    ctx.setGroupsIncomingRequests(snapshot.incoming);
    ctx.setGroupsOutgoingRequests(snapshot.outgoing);
    ctx.setGroupsFriendships(snapshot.friendships);
    ctx.setFriendProfileCacheByUid(snapshot.friendProfileCache);
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

  function renderGroupsRequestsList(container: HTMLElement | null, rows: any[], opts: { incoming: boolean }) {
    const titleEl = (opts.incoming ? els.groupsIncomingRequestsTitle : els.groupsOutgoingRequestsTitle) as HTMLElement | null;
    const detailsEl = (opts.incoming ? els.groupsIncomingRequestsDetails : els.groupsOutgoingRequestsDetails) as HTMLDetailsElement | null;
    const titleSuffix = opts.incoming ? "Incoming Requests" : "Outgoing Requests";
    if (titleEl) titleEl.textContent = `${rows.length} ${titleSuffix}`;
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
        const requestedAtMs =
          row.createdAt && typeof (row.createdAt as any).toMillis === "function"
            ? Number((row.createdAt as any).toMillis())
            : Number.NaN;
        const requestedDate = Number.isFinite(requestedAtMs) ? new Date(requestedAtMs).toLocaleString() : "Unknown";
        const status = String(row.status || "pending");
        const statusLabel = status[0].toUpperCase() + status.slice(1);
        const disabledAttr = groupsLoading ? ' disabled aria-disabled="true"' : "";
        const actionBtns =
          status !== "pending"
            ? ""
            : opts.incoming
              ? `<div class="footerBtns groupsIncomingRequestActions"><button class="btn btn-ghost small" type="button" data-friend-action="decline" data-request-id="${ctx.escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Decline</button><button class="btn btn-accent small" type="button" data-friend-action="approve" data-request-id="${ctx.escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Approve</button></div>`
              : `<div class="footerBtns"><button class="btn btn-ghost small" type="button" data-friend-action="cancel" data-request-id="${ctx.escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Cancel request</button></div>`;
        const identityAvatarSrc = opts.incoming
          ? ctx.getFriendAvatarSrcById(String(row.senderAvatarId || "").trim())
          : ctx.buildFriendInitialAvatarDataUrl(peerAlias);
        const identityHtml = `<div class="friendRequestIdentityRow">
          <img src="${ctx.escapeHtmlUI(identityAvatarSrc)}" alt="" aria-hidden="true" class="friendRequestAvatar" />
          <div class="friendRequestIdentityText">
            <div class="friendRequestAlias">${ctx.escapeHtmlUI(peerAlias)}</div>
          </div>
        </div>`;
        if (opts.incoming) {
          const incomingSentence = `<b>${ctx.escapeHtmlUI(peerAlias)}</b> has sent you a friend request!`;
          return `<div class="settingsDetailNote"><div>${incomingSentence}</div><div>Date Requested: ${ctx.escapeHtmlUI(
            requestedDate
          )}</div>${identityHtml}${actionBtns}</div>`;
        }
        return `<div class="settingsDetailNote"><div><b>${ctx.escapeHtmlUI(statusLabel)}</b></div>${identityHtml}${actionBtns}</div>`;
      })
      .join("");
  }

  function renderGroupsFriendsList() {
    if (!els.groupsFriendsList) return;
    syncOpenFriendSharedTaskUidsFromDom();
    const uid = ctx.getCurrentUid();
    const openIds = ctx.getOpenFriendSharedTaskUids();
    if (!uid) {
      openIds.clear();
      els.groupsFriendsList.textContent = "Sign in to view friends.";
      return;
    }
    if (!ctx.getGroupsFriendships().length) {
      openIds.clear();
      els.groupsFriendsList.textContent = "No friends yet.";
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
        const currentRankId = String(profile?.currentRankId || "").trim() || "unranked";
        const totalXp = Math.max(0, Math.floor(Number(profile?.totalXp || 0) || 0));
        const summaries = sharedSummaries.filter((entry) => entry.ownerUid === friendUid);
        const isOpen = openIds.has(friendUid);
        return { friendUid, alias, avatarSrc, currentRankId, totalXp, summaries, isOpen };
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
      .map((row, index) => {
        const summaryHtml = row.summaries
          .map((entry) => {
            const createdDate =
              entry.taskCreatedAtMs != null && Number.isFinite(Number(entry.taskCreatedAtMs))
                ? new Date(Number(entry.taskCreatedAtMs)).toLocaleDateString()
                : "Unknown";
            const timerState = String(entry.timerState || "stopped").toLowerCase() === "running" ? "Running" : "Stopped";
            const timerStateKey = timerState.toLowerCase() === "running" ? "running" : "stopped";
            const timerStateClass =
              String(entry.timerState || "stopped").toLowerCase() === "running"
                ? "friendSharedTaskState isRunning"
                : "friendSharedTaskState isStopped";
            const trendBars = buildSharedTrendBarSvgMarkup(entry.focusTrend7dMs || [], (entry as any).checkpointScaleMs);
            return `<div class="friendSharedTaskCard friendSharedTaskCardState-${ctx.escapeHtmlUI(timerStateKey)}">
              <div class="friendSharedTaskCardLayout">
                <div class="friendSharedTaskInfo">
                  <div class="friendSharedTaskTitle">${ctx.escapeHtmlUI(entry.taskName)}</div>
                  <div class="friendSharedTaskMeta">Status: <span class="${timerStateClass}">${ctx.escapeHtmlUI(timerState)}</span></div>
                  <div class="friendSharedTaskMeta">Created: ${ctx.escapeHtmlUI(createdDate)}</div>
                  <div class="friendSharedTaskMeta">Daily avg: ${ctx.escapeHtmlUI(
                    formatCompactDurationForSharedCard(Number(entry.avgTimeLoggedThisWeekMs || 0))
                  )}</div>
                  <div class="friendSharedTaskMeta">Total logged: ${ctx.escapeHtmlUI(
                    formatCompactDurationForSharedCard(Number(entry.totalTimeLoggedMs || 0))
                  )}</div>
                </div>
                <div class="friendSharedTaskTrend" aria-label="Focus Trend chart">
                  <div class="friendSharedTaskTrendLabel">Focus Trend</div>
                  <svg viewBox="0 0 170 56" role="img" aria-label="Focus trend over this week">
                    ${trendBars}
                  </svg>
                  <div class="friendSharedTaskTrendDays" aria-hidden="true">
                    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                  </div>
                </div>
              </div>
            </div>`;
          })
          .join("");
        const taskCount = row.summaries.length;
        const sharedCountLabel = `${taskCount} task${taskCount === 1 ? "" : "s"} shared with you`;
        const rankLabel = getRankLabelById(row.currentRankId);
        const totalXpLabel = `${row.totalXp.toLocaleString()} XP`;
        return `<div class="friendEntryWrap">
          <details class="friendSharedTasksDetails" data-friend-uid="${ctx.escapeHtmlUI(row.friendUid)}"${row.isOpen ? " open" : ""}>
            <summary class="settingsDetailNote friendIdentityRow leaderboardRow">
              <div class="leaderboardRank friendIdentityRank">${index + 1}</div>
              <button class="friendIdentityBtn leaderboardAvatarButton" type="button" data-friend-profile-open="${ctx.escapeHtmlUI(row.friendUid)}" aria-label="Open ${ctx.escapeHtmlUI(row.alias)} profile">
                <span class="leaderboardAvatar friendIdentityAvatarWrap" aria-hidden="true">
                  <img class="leaderboardAvatarImg friendIdentityAvatar" src="${ctx.escapeHtmlUI(row.avatarSrc)}" alt="" />
                </span>
              </button>
              <button class="friendIdentityBtn friendIdentityNameBtn leaderboardIdentity" type="button" data-friend-profile-open="${ctx.escapeHtmlUI(row.friendUid)}">
                <span class="friendIdentityText">
                  <strong class="leaderboardName friendIdentityAlias">${ctx.escapeHtmlUI(row.alias)}</strong>
                  <span class="leaderboardMeta friendIdentityMeta">${ctx.escapeHtmlUI(sharedCountLabel)}</span>
                </span>
              </button>
              <div class="leaderboardStats friendIdentityStats">
                <span class="leaderboardStatPrimary">
                  <span class="leaderboardRankLabel">${ctx.escapeHtmlUI(rankLabel)}</span>
                  <span class="leaderboardXp friendSharedTasksCountText">${ctx.escapeHtmlUI(totalXpLabel)}</span>
                </span>
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
    if (titleEl) titleEl.textContent = `${uniqueSharedTaskCount} shared by you`;
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

    const sharedByTaskId = new Map<string, { taskId: string; taskName: string; friendLabels: string[] }>();
    ownSharedSummaries.forEach((entry) => {
      const taskId = String(entry.taskId || "").trim();
      if (!taskId) return;
      const friendLabel = friendNameByUid.get(entry.friendUid) || String(entry.friendUid || "").trim() || "Unknown friend";
      const existing = sharedByTaskId.get(taskId);
      if (existing) {
        if (existing.friendLabels.indexOf(friendLabel) === -1) existing.friendLabels.push(friendLabel);
        return;
      }
      sharedByTaskId.set(taskId, {
        taskId,
        taskName: String(entry.taskName || "").trim() || "Untitled task",
        friendLabels: [friendLabel],
      });
    });

    const listHtml = Array.from(sharedByTaskId.values())
      .sort((a, b) => a.taskName.localeCompare(b.taskName, undefined, { sensitivity: "base" }))
      .map((entry) => {
        const friendLabel = entry.friendLabels.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).join(", ");
        return `<div class="friendSharedTaskCard isJumpCard" role="button" tabindex="0" data-shared-owned-task-id="${ctx.escapeHtmlUI(entry.taskId)}" title="Open task">
          <div class="friendSharedTaskInfo">
            <div class="friendSharedTaskTitle">${ctx.escapeHtmlUI(entry.taskName)}</div>
            <div class="friendSharedTaskMeta">Shared with: ${ctx.escapeHtmlUI(friendLabel)}</div>
          </div>
          <div class="friendSharedTaskActions">
            <button class="btn btn-ghost small" type="button" data-friend-action="open-unshare-task" data-task-id="${ctx.escapeHtmlUI(entry.taskId)}">Unshare</button>
          </div>
        </div>`;
      })
      .join("");

    container.classList.remove("sharedTasksEmpty");
    container.innerHTML = `<div class="friendSharedTasksGrid">${listHtml}</div>`;
  }

  function renderFriendsFooterAlertBadge() {
    const badgeEl = els.footerTest2AlertBadge as HTMLElement | null;
    if (!badgeEl) return;
    if (!canUseSocialFeatures()) {
      badgeEl.style.display = "none";
      badgeEl.textContent = "";
      return;
    }
    const uid = ctx.getCurrentUid();
    const count = uid ? Math.max(0, Number(ctx.getGroupsIncomingRequests().length) || 0) : 0;
    if (count <= 0) {
      badgeEl.style.display = "none";
      badgeEl.textContent = "";
      badgeEl.setAttribute("aria-label", "No incoming friend requests");
      return;
    }
    const countLabel = count > 99 ? "99+" : String(count);
    badgeEl.style.display = "inline-flex";
    badgeEl.textContent = countLabel;
    badgeEl.setAttribute("aria-label", `${count} incoming friend request${count === 1 ? "" : "s"}`);
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
    if (els.openFriendRequestModalBtn) els.openFriendRequestModalBtn.disabled = ctx.getGroupsLoading();
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
      setGroupsStatus("Sign in to use Groups.");
      renderGroupsPage();
      return;
    }
    const refreshSeq = ctx.getGroupsRefreshSeq() + 1;
    ctx.setGroupsRefreshSeq(refreshSeq);
    try {
      const snapshot = await loadGroupsSnapshot(uid);
      if (refreshSeq !== ctx.getGroupsRefreshSeq()) return;
      applyGroupsSnapshot(snapshot);
      if (!opts?.preserveStatus) setGroupsStatus("");
    } catch {
      if (refreshSeq !== ctx.getGroupsRefreshSeq()) return;
      if (!opts?.preserveStatus) setGroupsStatus("Could not load friend data.");
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
      setGroupsStatus("Sign in to send friend requests.");
      renderGroupsPage();
      return;
    }
    setGroupsStatus("Sending request...");
    const result = await runGroupsBusy("Sending friend request...", "Friend request timed out. Please try again.", () =>
      sendFriendRequest(uid, email, receiverEmail)
    );
    if (!result.ok) {
      const message = result.timedOut ? result.message : "Could not send friend request.";
      setFriendRequestModalStatus(`Friend request failed: ${message}`, "error");
      setGroupsStatus(message);
      renderGroupsPage();
      return;
    }
    if (!result.value.ok) {
      const failureMessage = result.value.message || "Could not find a matching email.";
      setFriendRequestModalStatus(`Friend request failed: ${failureMessage}`, "error");
      setGroupsStatus(failureMessage);
      renderGroupsPage();
      return;
    }
    setFriendRequestModalStatus("Friend request success.", "success");
    setGroupsStatus("Friend request sent.");
    renderGroupsPage();
    void refreshGroupsData({ preserveStatus: true });
    window.setTimeout(() => {
      closeFriendRequestModal();
    }, 700);
  }

  async function handleFriendRequestAction(requestId: string, action: "approve" | "decline" | "cancel") {
    const uid = ctx.getCurrentUid();
    if (!uid || !requestId) return;
    const pendingStatus =
      action === "approve" ? "Approving request..." : action === "decline" ? "Declining request..." : "Cancelling request...";
    setGroupsStatus(pendingStatus);
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
      setGroupsStatus(result.timedOut ? result.message : "Could not update friend request.");
      renderGroupsPage();
      return;
    }
    if (!result.value.ok) {
      setGroupsStatus(result.value.message || "Action failed.");
      renderGroupsPage();
      return;
    }
    const completeStatus =
      action === "approve"
        ? "Friend request approved."
        : action === "decline"
          ? "Friend request declined."
          : "Friend request cancelled.";
    setGroupsStatus(completeStatus);
    renderGroupsPage();
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
      ctx.confirm("Delete Friend", `Are you sure you want to delete ${friendName} as a friend?`, {
        okLabel: "Delete",
        cancelLabel: "Cancel",
        onOk: () => {
          if (ctx.getGroupsLoading()) return;
          const ownUid = String(ctx.getCurrentUid() || "").trim();
          const friendUid = String(ctx.getActiveFriendProfileUid() || "").trim();
          if (!ownUid) {
            ctx.closeConfirm();
            setGroupsStatus("Sign in to manage friends.");
            return;
          }
          if (!friendUid) {
            ctx.closeConfirm();
            setGroupsStatus("Friend account could not be resolved.");
            return;
          }
          ctx.closeConfirm();
          closeFriendProfileModal();
          setGroupsStatus(`Deleting ${friendName}...`);
          renderGroupsPage();
          void (async () => {
            const result = await runGroupsBusy(`Deleting ${friendName}...`, "Deleting friend timed out. Please try again.", () =>
              deleteFriendship(ownUid, friendUid)
            );
            if (!result.ok) {
              setGroupsStatus(result.timedOut ? result.message : "Could not delete friend.");
              renderGroupsPage();
              return;
            }
            if (!result.value.ok) {
              setGroupsStatus(result.value.message || "Could not delete friend.");
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
            setGroupsStatus(result.value.message || `${friendName} was removed from your friends.`);
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
      if (e?.target === els.shareTaskModal) closeShareTaskModal();
    });
    ctx.on(els.shareTaskScopeSelect, "change", () => {
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
      void handleFriendRequestAction(requestId, action);
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
      const btn = e.target?.closest?.("[data-friend-profile-open]") as HTMLElement | null;
      if (!btn) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const friendUid = String(btn.getAttribute("data-friend-profile-open") || "").trim();
      if (!friendUid) return;
      openFriendProfileModal(friendUid);
    });
    ctx.on(els.groupsFriendsList, "keydown", (e: any) => {
      if (e?.key !== "Enter" && e?.key !== " ") return;
      const btn = e.target?.closest?.("[data-friend-profile-open]") as HTMLElement | null;
      if (!btn) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const friendUid = String(btn.getAttribute("data-friend-profile-open") || "").trim();
      if (!friendUid) return;
      openFriendProfileModal(friendUid);
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
