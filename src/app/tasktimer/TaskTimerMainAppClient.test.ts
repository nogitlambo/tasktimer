import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TaskTimerMainAppClient leaderboard user summary modal", () => {
  const source = readFileSync(resolve(__dirname, "TaskTimerMainAppClient.tsx"), "utf8");
  const shellCss = readFileSync(resolve(__dirname, "styles/01-shell.css"), "utf8");
  const overlaysCss = readFileSync(resolve(__dirname, "styles/04-overlays.css"), "utf8");
  const friendsCss = readFileSync(resolve(__dirname, "styles/08-friends.css"), "utf8");

  it("renders the leaderboard user summary overlay outside the app page scroller", () => {
    const frameCloseIndex = source.indexOf("</TaskTimerAppFrame>");
    const overlayIndex = source.indexOf('id="leaderboardPositionOverlay"');

    expect(frameCloseIndex).toBeGreaterThan(-1);
    expect(overlayIndex).toBeGreaterThan(-1);
    expect(overlayIndex).toBeGreaterThan(frameCloseIndex);
  });

  it("renders the leaderboard user summary reveal wrapper and entrance class", () => {
    expect(source).toContain('className="modal leaderboardPositionModal leaderboardPositionPrimitiveModal isLeaderboardPositionRevealing"');
    expect(source).toContain('className="friendUserSummaryBorderTrace"');
    expect(source).toContain('className="leaderboardPositionRevealBody leaderboardPositionPrimitiveBody"');
  });

  it("does not let leaderboard swipe handling capture profile-open clicks", () => {
    expect(source).toContain("data-leaderboard-profile-open=");
    expect(source).toContain("if (isLeaderboardProfileOpenTarget(event.target)) return;");
    expect(source).toContain('target?.closest("[data-leaderboard-profile-open]")');
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("event.stopPropagation();");
  });

  it("does not let leaderboard swipe handling capture weekly awards info clicks", () => {
    expect(source).toContain('className="iconBtn leaderboardWeeklyAwardsInfoBtn"');
    expect(source).toContain("function isLeaderboardAwardsInfoTarget");
    expect(source).toContain("if (isLeaderboardAwardsInfoTarget(event.target)) return;");
    expect(source).toContain('target?.closest(".leaderboardWeeklyAwardsInfoBtn")');
    expect(source).toContain("setWeeklyAwardsInfoOpen(true)");
  });

  it("routes friend leaderboard table rows through the Friend Info event", () => {
    expect(source).toContain("friendUidSet={leaderboardFriendUidSet}");
    expect(source).toContain('isFriend ? " isFriend" : ""');
    expect(source).not.toContain("leaderboardFriendBadge");
    expect(source).toContain("TASKTIMER_OPEN_FRIEND_PROFILE_EVENT");
    expect(source).toContain("setSelectedLeaderboardProfile(profile)");
    expect(source).toContain("detail: { friendUid: row.profile.uid }");
  });

  it("uses one leaderboard loading message without legacy per-panel copy", () => {
    expect(source).toContain('const LEADERBOARD_LOADING_TEXT = "Loading leaderboard standings";');
    expect(source).toContain('className="leaderboardLoadingText"');
    expect(source).toContain('aria-label={`${LEADERBOARD_LOADING_TEXT}...`}');
    expect(source).toContain('leaderboardState === "loading" ? renderLeaderboardLoadingText()');
    expect(source).not.toContain("Loading weekly leaderboard.");
    expect(source).not.toContain("Loading rivals.");
    expect(source).not.toContain("Loading leaderboard standings.");
  });

  it("keeps leaderboard loads visible for two seconds and ignores stale results", () => {
    expect(source).toContain("const LEADERBOARD_LOADING_MIN_MS = 2_000;");
    expect(source).toContain("waitForMinimumLoadingDuration");
    expect(source).toContain("leaderboardLoadSeqRef");
    expect(source).toContain("leaderboardLoadSeqRef.current !== loadSeq");
    expect(source).not.toContain("preserveReadyState");
  });

  it("renders the leaderboard movement overlay outside the app page scroller", () => {
    const frameCloseIndex = source.indexOf("</TaskTimerAppFrame>");
    const overlayIndex = source.indexOf('id="leaderboardMovementOverlay"');

    expect(frameCloseIndex).toBeGreaterThan(-1);
    expect(overlayIndex).toBeGreaterThan(-1);
    expect(overlayIndex).toBeGreaterThan(frameCloseIndex);
    expect(source).toContain('className="overlay primitiveSciFiModalOverlay leaderboardMovementPrimitiveOverlay"');
    expect(source).toContain('className="primitiveSciFiModal leaderboardMovementModal leaderboardMovementPrimitiveModal"');
  });

  it("queues leaderboard movements and blocks them behind XP and rank UI", () => {
    expect(source).toContain("LEADERBOARD_POSITION_CHANGED_EVENT");
    expect(source).toContain("const next = current.concat(changes);");
    expect(source).toContain("leaderboardMovementQueueRef.current = next;");
    expect(source).toContain("activeLeaderboardMovementSequenceRef.current = next;");
    expect(source).toContain("const leaderboardMovementBlocked = Boolean(");
    expect(source).toContain("xpAnimationState.pending ||");
    expect(source).toContain("xpAnimationState.active ||");
    expect(source).toContain("pendingRankPromotion ||");
    expect(source).toContain("activeRankPromotion");
  });

  it("keeps one leaderboard movement modal open while body clicks advance the sequence", () => {
    expect(source).not.toContain("LEADERBOARD_MOVEMENT_AUTO_ADVANCE_MS");
    expect(source).not.toContain("leaderboardMovementTimerRef");
    expect(source).toContain("const [activeLeaderboardMovementSequence, setActiveLeaderboardMovementSequence] = useState<LeaderboardPositionChangeSnapshot[]>([]);");
    expect(source).toContain("const [activeLeaderboardMovementIndex, setActiveLeaderboardMovementIndex] = useState(0);");
    expect(source).toContain("const hasNextLeaderboardMovement = activeLeaderboardMovementIndex < activeLeaderboardMovementSequence.length - 1;");
    expect(source).toContain("const advanceLeaderboardMovementModal = () => {");
    expect(source).toContain("setActiveLeaderboardMovementIndex((current) => Math.min(current + 1, activeLeaderboardMovementSequence.length - 1));");
    expect(source).toContain("onClick={advanceLeaderboardMovementModal}");
    expect(source).toContain("activeLeaderboardMovementSequence.map((change, index) => (");
  });

  it("clears the leaderboard movement sequence and queue on backdrop or close", () => {
    expect(source).toContain("const closeLeaderboardMovementModal = () => {");
    expect(source).toContain("setActiveLeaderboardMovementSequence([]);");
    expect(source).toContain("setActiveLeaderboardMovementIndex(0);");
    expect(source).toContain("setLeaderboardMovementQueue([]);");
    expect(source).toContain("onClick={closeLeaderboardMovementModal}");
    expect(source).toContain("event.stopPropagation();");
    expect(source).toContain("closeLeaderboardMovementModal();");
  });

  it("animates and highlights rows in the leaderboard movement modal", () => {
    expect(source).toContain("function LeaderboardMovementTable");
    expect(source).toContain("const movementRows = change.movementRows?.length ? change.movementRows : change.rows;");
    expect(source).toContain('"--leaderboard-movement-from-index": previousIndex');
    expect(source).toContain('"--leaderboard-movement-to-index": index');
    expect(source).toContain('leaderboardMovementTableRow${row.isCurrentUser ? " isCurrentUser" : ""}');
    expect(source).toContain("formatLeaderboardMovementMetric(change, row.profile)");
    expect(source).toContain("leaderboardMovementSkippedRows");
  });

  it("styles leaderboard movement content as a reduced-motion aware slide track", () => {
    expect(source).toContain('className="leaderboardMovementSlideViewport"');
    expect(source).toContain('className="leaderboardMovementSlideTrack"');
    expect(source).toContain('className="leaderboardMovementSlidePanel"');
    expect(source).toContain('"--leaderboard-movement-index": activeLeaderboardMovementIndex');
    expect(overlaysCss).toContain("#leaderboardMovementOverlay .leaderboardMovementSlideViewport");
    expect(overlaysCss).toContain("#leaderboardMovementOverlay .leaderboardMovementSlideTrack");
    expect(overlaysCss).toContain("transform: translateX(calc(var(--leaderboard-movement-index) * -100%));");
    expect(overlaysCss).toContain("transition: transform .34s cubic-bezier(.2, .8, .2, 1);");
    expect(overlaysCss).toContain("@keyframes leaderboardMovementRowSettle");
    expect(overlaysCss).toContain("animation: leaderboardMovementRowSettle .72s cubic-bezier(.16, .86, .22, 1) .12s both;");
    expect(overlaysCss).toContain("var(--leaderboard-movement-row-height)");
    expect(overlaysCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(overlaysCss).toContain("#leaderboardMovementOverlay .leaderboardMovementTable .leaderboardMovementTableRow");
    expect(overlaysCss).toContain("animation: none;");
    expect(overlaysCss).toContain("transition: none;");
  });

  it("styles leaderboard loading text with Orbitron and repeating dots", () => {
    expect(shellCss).toContain("#app[aria-label=\"TaskLaunch App\"] .leaderboardLoadingText");
    expect(shellCss).toContain("font-family: var(--font-orbitron), Orbitron, \"Segoe UI Variable\", \"Segoe UI\", Arial, sans-serif !important;");
    expect(shellCss).toContain("font-size: 15.12px !important;");
    expect(shellCss).toContain("@keyframes leaderboardLoadingDots");
    expect(shellCss).toContain("animation: leaderboardLoadingDots 1.2s steps(1, end) infinite;");
  });

  it("centers loading feedback in every leaderboard panel", () => {
    const sharedPanelTextRule = friendsCss.match(
      /#app\[aria-label="TaskLaunch App"\] #appPageLeaderboard \.leaderboardPanelText\s*\{([\s\S]*?)\}/
    )?.[1] ?? "";

    expect(source.match(/className="leaderboardPanelText"/g)).toHaveLength(3);
    expect(sharedPanelTextRule).not.toBe("");
    expect(sharedPanelTextRule).toContain("position:absolute;");
    expect(sharedPanelTextRule).toContain("inset:0;");
    expect(sharedPanelTextRule).toContain("display:flex;");
    expect(sharedPanelTextRule).toContain("align-items:center;");
    expect(sharedPanelTextRule).toContain("justify-content:center;");
    expect(sharedPanelTextRule).toContain("text-align:center;");
  });

  it("delivers task-complete XP from the modal XP value after Claim", () => {
    expect(source).toContain("TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT");
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain('document.getElementById("timeGoalCompleteXpValue")');
    expect(source).toContain('if (sourceElement?.id === "timeGoalCompleteXpValue")');
    expect(source).toContain('id = `modal-unit-${activeAward.sourceOverlayId}-${xpAwardPayloadSeqRef.current++}`');
    expect(source).toContain('if (activeAward.sourceModal === "timeGoalComplete")');
    expect(source).toContain("runModalXpValueDelivery();");
  });

  it("keeps modal XP delivery undimmed and emits unit payloads from the XP value", () => {
    expect(source).toMatch(/setIsXpAwardSpotlightActive\(false\);\r?\n\s+setXpAnimationState\(\(current\) => notifyXpAwardOverlayClosed\(current, detail\.overlayId\)\);/);
    expect(source).toMatch(/setIsXpAwardSpotlightActive\(false\);\r?\n\s+setXpAwardFx\(\{ visible: false, payloads: \[\] \}\);/);
    expect(source).toContain("const sourceRect = sourceElement?.getBoundingClientRect?.() || null;");
    expect(source).toContain("const unitOriginRect = isUsableXpAwardRect(sourceRect) ? sourceRect as DOMRect : activeAward.sourceRect;");
    expect(source).toContain("const style = buildXpPayloadStyle(unitOriginRect, targetRect);");
    expect(source).toContain('text: "*"');
    expect(source).toContain('className: "xpAwardFxPayloadUnit xpAwardFxPayloadStar"');
    expect(source).not.toContain('text: "+1 XP"');
  });

  it("plays the XP increase sound in sync with each modal XP unit launch", () => {
    expect(source).toContain('import { createClickAudioPlayer } from "./client/click-audio-player";');
    expect(source).toContain('const XP_AWARD_UNIT_DELIVERY_AUDIO_SRC = "/xp_increase.mp3";');
    expect(source).toContain('const XP_AWARD_DELIVERY_DONE_AUDIO_SRC = "/xp_increase_done.mp3";');
    expect(source).toContain("const xpAwardUnitDeliveryAudioPlayer = useMemo(() => createClickAudioPlayer(XP_AWARD_UNIT_DELIVERY_AUDIO_SRC), []);");
    expect(source).toContain("const xpAwardDeliveryDoneAudioPlayer = useMemo(() => createClickAudioPlayer(XP_AWARD_DELIVERY_DONE_AUDIO_SRC), []);");
    expect(source).toContain("const playXpAwardUnitDeliverySound = () => {");
    expect(source).toContain("const playXpAwardDoneSoundOnce = () => {");
    expect(source).toContain("if (didPlayDoneSound) return;");
    expect(source).toContain("if (!achievementSoundsEnabled) return;");
    expect(source).toContain("xpAwardUnitDeliveryAudioPlayer.play();");
    expect(source).toContain("xpAwardUnitDeliveryAudioPlayer.stop();");
    expect(source).toContain("xpAwardDeliveryDoneAudioPlayer.play();");
    expect(source).toContain("xpAwardUnitDeliveryAudioPlayer.warm();");
    expect(source).toContain("xpAwardDeliveryDoneAudioPlayer.warm();");
    expect(source).toMatch(/playXpAwardUnitDeliverySound\(\);\r?\n\s+playXpAwardUnitDeliveryHaptic\(\);\r?\n\s+setXpAwardFx\(\(current\) => \(\{/);
    expect(source).toMatch(/addExtraTimer\(\(\) => \{\r?\n\s+updateDeliveredXp\(\);\r?\n\s+\}, XP_AWARD_UNIT_FX_DURATION_MS\);/);
    expect(source).toMatch(/playXpAwardDoneSoundOnce\(\);\r?\n\s+finishAward/);
    expect(source).toMatch(/setModalRemainingXp\(0\);\r?\n\s+xpAwardUnitDeliveryAudioPlayer\.stop\(\);/);
    expect(source).toContain("}, XP_AWARD_UNIT_FX_DURATION_MS);");
    expect(source).toContain("xpAwardDeliveryDoneAudioPlayer,");
    expect(source).toContain("xpAwardUnitDeliveryAudioPlayer,");
  });

  it("plays rate-limited haptics in sync with each modal XP unit launch", () => {
    const modalDeliveryStart = source.indexOf("const runModalXpValueDelivery = () => {");
    const modalDeliveryEnd = source.indexOf("const scheduleUnitPayloadDelivery = () => {", modalDeliveryStart);
    const modalDeliverySetupEnd = source.indexOf("const startedAt = performance.now();", modalDeliveryStart);
    const modalUnitLaunchSource = source.slice(modalDeliveryStart, modalDeliveryEnd);
    const modalDeliverySetupSource = source.slice(modalDeliveryStart, modalDeliverySetupEnd);

    expect(source).toContain("shouldPlayRateLimitedXpAwardDeliveryHaptic");
    expect(modalUnitLaunchSource).toContain("let lastDeliveryHapticAtMs: number | null = null;");
    expect(modalUnitLaunchSource).toContain("const playXpAwardUnitDeliveryHaptic = () => {");
    expect(modalUnitLaunchSource).toContain("lastPlayedAtMs: lastDeliveryHapticAtMs");
    expect(modalUnitLaunchSource).toContain("lastDeliveryHapticAtMs = nowMs;");
    expect(modalUnitLaunchSource).toContain("playXpAwardDeliveryHaptic({");
    expect(modalUnitLaunchSource).toMatch(/playXpAwardUnitDeliverySound\(\);\r?\n\s+playXpAwardUnitDeliveryHaptic\(\);/);
    expect(modalDeliverySetupSource).not.toMatch(/setIsXpCountAnimating\(true\);\r?\n\s+if \(shouldPlayXpAwardDeliveryHaptic\(startXp, endXp, interactionHapticsEnabled\)\)/);
  });

  it("counts the task-complete modal XP value down to zero", () => {
    expect(source).toContain("const setModalRemainingXp = (xp: number) => {");
    expect(source).toContain("sourceElement.textContent = String(Math.max(0, Math.floor(Number(xp) || 0)));");
    expect(source).toContain("setModalRemainingXp(targetCountdownXp);");
    expect(source).toContain("setModalRemainingXp(nextRemaining);");
    expect(source).toContain("setModalRemainingXp(0);");
  });

  it("spaces modal XP payload launches evenly instead of batching them per countdown frame", () => {
    expect(source).toContain("const scheduleUnitPayloadDelivery = () => {");
    expect(source).toContain("const launchIntervalMs = countdownDurationMs / totalUnits;");
    expect(source).toContain("addExtraTimer(launchUnitPayload, Math.round(unitIndex * launchIntervalMs));");
    expect(source).toContain("scheduleUnitPayloadDelivery();");
    expect(source).not.toContain("for (let value = previousRemaining; value > nextRemaining; value -= 1)");
  });

  it("keeps the XP award spotlight transparent without backdrop blur and defines unit animation CSS", () => {
    const spotlightRule = shellCss.match(/\.xpAwardSpotlightLayer\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(spotlightRule).not.toBe("");
    expect(spotlightRule).toContain("background:transparent;");
    expect(spotlightRule).not.toContain("rgba(");
    expect(spotlightRule).not.toContain("backdrop-filter");
    expect(overlaysCss).toContain(".xpAwardFxPayloadStar");
    expect(overlaysCss).toContain("animation: xpAwardPayloadUnit 760ms");
    expect(overlaysCss).toContain("width: 22px;");
    expect(overlaysCss).toContain("height: 22px;");
    expect(overlaysCss).toContain("font-size: 23px;");
    expect(overlaysCss).toContain("color: #ffd45a;");
  });
});
