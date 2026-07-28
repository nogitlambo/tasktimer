import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TaskTimerMainAppClient leaderboard user summary modal", () => {
  const source = readFileSync(resolve(__dirname, "TaskTimerMainAppClient.tsx"), "utf8");
  const baseCss = readFileSync(resolve(__dirname, "styles/00-base.css"), "utf8");
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

  it("renders the Add Task overlay inside the desktop app frame with Edit Task", () => {
    const frameOpenIndex = source.indexOf("<TaskTimerAppFrame");
    const frameCloseIndex = source.indexOf("</TaskTimerAppFrame>");
    const addOverlayIndex = source.indexOf("<AddTaskOverlay />");
    const editOverlayIndex = source.indexOf("<EditTaskOverlay />");

    expect(frameOpenIndex).toBeGreaterThan(-1);
    expect(frameCloseIndex).toBeGreaterThan(-1);
    expect(addOverlayIndex).toBeGreaterThan(frameOpenIndex);
    expect(addOverlayIndex).toBeLessThan(frameCloseIndex);
    expect(editOverlayIndex).toBeGreaterThan(frameOpenIndex);
    expect(editOverlayIndex).toBeLessThan(frameCloseIndex);
  });

  it("renders the leaderboard user summary reveal wrapper and entrance class", () => {
    expect(source).toContain('className="modal leaderboardPositionModal leaderboardPositionPrimitiveModal isLeaderboardPositionRevealing"');
    expect(source).toContain('className="friendUserSummaryBorderTrace"');
    expect(source).toContain('className="leaderboardPositionRevealBody leaderboardPositionPrimitiveBody"');
  });

  it("does not let the square button reset flatten podium card corners", () => {
    expect(baseCss).toContain("button:not(.switch):not(.leaderboardWeeklyPodiumCard)");
    expect(friendsCss).toContain(".leaderboardWeeklyPodiumCard{");
    expect(friendsCss).toContain("border-radius:18px 18px 0 0");
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
    expect(source).toContain('className: isFriend ? "isFriend" : ""');
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

  it("refreshes leaderboard standings once per minute", () => {
    expect(source).toContain("const LEADERBOARD_REFRESH_INTERVAL_MS = 60_000;");
    expect(source).toContain('document.body.getAttribute("data-app-page")');
    expect(source).toContain('appPage === "leaderboard"');
    expect(source).toContain('initialPage === "leaderboard"');
    expect(source).toContain("clearScheduledRefresh");
    expect(source).toContain("syncRefreshTimerForAppPage");
    expect(source).toContain('appPageObserver.observe(document.body, { attributes: true, attributeFilter: ["data-app-page"] });');
    expect(source).toContain("appPageObserver?.disconnect();");
    expect(source).toContain("if (refreshTimer != null || !activeUid || !isLeaderboardPageActive()) return;");
    expect(source).toContain('if (!activeUid || !isLeaderboardPageActive() || document.visibilityState !== "visible") return;');
    expect(source).toContain("}, LEADERBOARD_REFRESH_INTERVAL_MS);");
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
    expect(source).toContain("function LeaderboardSharedTableContent");
    expect(source).toContain("function LeaderboardSharedTableCells");
    expect(source).toContain("function LeaderboardMovementTable");
    expect(source).toContain("const movementRows = change.movementRows?.length ? change.movementRows : change.rows;");
    expect(source).toContain('className="leaderboardWeeklyTableWrap leaderboardMovementTableWrap"');
    expect(source).toContain('className="leaderboardSharedTablePanel leaderboardMovementSharedTablePanel"');
    expect(source).toContain("<LeaderboardSharedTableContent");
    expect(source).toContain('as: "div"');
    expect(source).toContain("rankBeforeMetric");
    expect(source).toContain('"--leaderboard-movement-from-index": previousIndex');
    expect(source).toContain('"--leaderboard-movement-to-index": index');
    expect(source).toContain('className: "leaderboardMovementTableRow"');
    expect(source).toContain('className={rowClassName}');
    expect(source).toContain("formatMetric={(profile) => formatLeaderboardMovementMetric(change, profile)}");
    expect(source).toContain("leaderboardMovementSkippedRows");
  });

  it("styles leaderboard movement content as a reduced-motion aware slide track", () => {
    expect(source).toContain('className="leaderboardMovementSlideViewport"');
    expect(source).toContain('className="leaderboardMovementSlideTrack"');
    expect(source).toContain('className="leaderboardMovementSlidePanel"');
    expect(source).toContain('"--leaderboard-movement-index": activeLeaderboardMovementIndex');
    expect(overlaysCss).toContain("#leaderboardMovementOverlay .leaderboardMovementSlideViewport");
    expect(overlaysCss).toContain("#leaderboardMovementOverlay .leaderboardMovementSlideTrack");
    expect(overlaysCss).toContain("height:100%;");
    expect(overlaysCss).toContain("flex:1 1 auto;");
    expect(overlaysCss).toContain("transform: translateX(calc(var(--leaderboard-movement-index) * -100%));");
    expect(overlaysCss).toContain("transition: transform .34s cubic-bezier(.2, .8, .2, 1);");
    expect(overlaysCss).toContain("@keyframes leaderboardMovementRowSettle");
    expect(overlaysCss).toContain("animation: leaderboardMovementRowSettle .72s cubic-bezier(.16, .86, .22, 1) .12s both;");
    expect(overlaysCss).toContain("var(--leaderboard-movement-row-height)");
    expect(overlaysCss).toContain("#leaderboardMovementOverlay .leaderboardMovementSharedTablePanel");
    expect(overlaysCss).toContain("grid-template-columns:100px minmax(240px, 1.5fr) minmax(110px, .8fr) minmax(110px, .75fr);");
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

  it("reveals global and weekly podium avatars with a first-second-third coin spin", () => {
    expect(source).toContain("function LeaderboardPodiumDeck");
    expect(source).toContain("rows={orderedWeeklyPodiumRows}");
    expect(source).toContain("rows={orderedGlobalPodiumRows}");
    expect(friendsCss).toContain("#leaderboardGlobalPanel.leaderboardCardEnter .leaderboardWeeklyPodiumAvatarFlipGroup");
    expect(friendsCss).toContain("#leaderboardWeeklyPanel.leaderboardCardEnter .leaderboardWeeklyPodiumAvatarFlipGroup");
    expect(friendsCss).toContain("@keyframes leaderboardPodiumCoinReveal");
    expect(friendsCss).toContain("animation:leaderboardPodiumCoinReveal 1.5s linear both;");
    expect(friendsCss).toContain("transform:translateZ(0) rotateY(88deg) scale(.96);");
    expect(friendsCss).toContain(".leaderboardWeeklyPodiumCard1 .leaderboardWeeklyPodiumAvatarFlipGroup");
    expect(friendsCss).toContain("animation-delay:120ms;");
    expect(friendsCss).toContain(".leaderboardWeeklyPodiumCard2 .leaderboardWeeklyPodiumAvatarFlipGroup");
    expect(friendsCss).toContain("animation-delay:520ms;");
    expect(friendsCss).toContain(".leaderboardWeeklyPodiumCard3 .leaderboardWeeklyPodiumAvatarFlipGroup");
    expect(friendsCss).toContain("animation-delay:920ms;");
  });

  it("spins the podium radial fade as an oversized circle without a cyan Global burst", () => {
    expect(source).toContain('className="leaderboardGlobalStage leaderboardWeeklyPodiumStage"');
    expect(source).toContain('className="leaderboardGlobalStage leaderboardWeeklyPodiumStage leaderboardGlobalPodiumStage"');
    expect(friendsCss).toContain("#app[aria-label=\"TaskLaunch App\"] #appPageLeaderboard .leaderboardWeeklyPodiumStage::before");
    expect(friendsCss).toContain("#app[aria-label=\"TaskLaunch App\"] #appPageLeaderboard .leaderboardWeeklyPodiumStage::after");
    expect(friendsCss).toContain("#app[aria-label=\"TaskLaunch App\"] #leaderboardGlobalPanel .leaderboardWeeklyPodiumStage::before");
    expect(friendsCss).toContain("#app[aria-label=\"TaskLaunch App\"] #leaderboardGlobalPanel .leaderboardWeeklyPodiumStage::after");
    expect(friendsCss).toContain("animation:timeGoalCompleteWheelGlow 24s linear infinite;");
    const podiumBurstRule = friendsCss.match(
      /#app\[aria-label="TaskLaunch App"\] #appPageLeaderboard \.leaderboardWeeklyPodiumStage::before\s*\{([\s\S]*?)\n\}/
    )?.[1] ?? "";
    expect(podiumBurstRule).not.toBe("");
    expect(podiumBurstRule).toContain("left:50%;");
    expect(podiumBurstRule).toContain("top:42%;");
    expect(podiumBurstRule).toContain("width:max(220%, 560px);");
    expect(podiumBurstRule).toContain("aspect-ratio:1;");
    expect(podiumBurstRule).toContain("translate:-50% -42%;");
    expect(podiumBurstRule).toContain("border-radius:50%;");
    expect(podiumBurstRule).toContain("clip-path:circle(50% at 50% 50%);");
    expect(podiumBurstRule).toContain("transform-origin:center;");
    expect(podiumBurstRule).toContain("animation:timeGoalCompleteWheelGlow 24s linear infinite;");
    expect(podiumBurstRule).toContain("will-change:transform, opacity, filter;");
    expect(podiumBurstRule).toContain("radial-gradient(circle at 50% 50%");
    expect(podiumBurstRule).toContain("from -5deg at 50% 50%");
    const podiumGlowRule = friendsCss.match(
      /#app\[aria-label="TaskLaunch App"\] #appPageLeaderboard \.leaderboardWeeklyPodiumStage::after\s*\{([\s\S]*?)\n\}/
    )?.[1] ?? "";
    expect(podiumGlowRule).not.toBe("");
    expect(podiumGlowRule).toContain("width:max(220%, 560px);");
    expect(podiumGlowRule).toContain("aspect-ratio:1;");
    expect(podiumGlowRule).toContain("translate:-50% -42%;");
    expect(podiumGlowRule).toContain("border-radius:50%;");
    expect(podiumGlowRule).toContain("clip-path:circle(50% at 50% 50%);");
    expect(podiumGlowRule).toContain("animation:timeGoalCompleteWheelGlow 24s linear infinite;");
    expect(friendsCss).toContain("radial-gradient(circle at 50% 50%, rgba(255,246,162,.16)");
    expect(podiumGlowRule).not.toContain("conic-gradient(");
    expect(friendsCss).toContain(".leaderboardGlobalStage.leaderboardWeeklyPodiumStage::after");
    expect(friendsCss).toContain("width:max(240%, 560px);");
    expect(friendsCss).not.toContain("@keyframes leaderboardPodiumCenterPulseMobile");
    expect(friendsCss).toContain("radial-gradient(circle at 50% 50%, rgba(162,246,255,.12)");
    expect(friendsCss).toContain("opacity:.09;");
    expect(podiumBurstRule).not.toContain("scale(");
    expect(podiumGlowRule).not.toContain("scale(");
    expect(friendsCss).not.toContain("filter:blur(.45px);");

    const globalPodiumBurstRule = friendsCss.match(
      /#app\[aria-label="TaskLaunch App"\] #leaderboardGlobalPanel \.leaderboardWeeklyPodiumStage::before\s*\{([\s\S]*?)\n\}/
    )?.[1] ?? "";
    const globalPodiumGlowRule = friendsCss.match(
      /#app\[aria-label="TaskLaunch App"\] #leaderboardGlobalPanel \.leaderboardWeeklyPodiumStage::after\s*\{([\s\S]*?)\n\}/
    )?.[1] ?? "";
    const mobileGlobalPodiumGlowRule = friendsCss.match(
      /#app\[aria-label="TaskLaunch App"\] #leaderboardGlobalPanel \.leaderboardGlobalStage\.leaderboardWeeklyPodiumStage::after\s*\{([\s\S]*?)\n  \}/
    )?.[1] ?? "";
    expect(globalPodiumBurstRule).toContain("rgba(53,232,255,.075)");
    expect(globalPodiumBurstRule).not.toContain("rgba(201,255,36");
    expect(globalPodiumGlowRule).toContain("rgba(53,232,255,.07)");
    expect(globalPodiumGlowRule).not.toContain("rgba(201,255,36");
    expect(mobileGlobalPodiumGlowRule).toContain('content:"";');
    expect(friendsCss).toContain("rgba(53,232,255,.07) 18%");

    const reducedMotionRule = Array.from(
      friendsCss.matchAll(/#app\[aria-label="TaskLaunch App"\] #appPageLeaderboard \.leaderboardWeeklyPodiumStage::after\s*\{([\s\S]*?)\}/g)
    ).map((match) => match[1] ?? "").find((rule) => rule.includes("animation:none;")) ?? "";
    expect(reducedMotionRule).not.toBe("");
    expect(reducedMotionRule).toContain("opacity:.12;");
    expect(reducedMotionRule).toContain("transform:none;");
    expect(reducedMotionRule).toContain("animation:none;");
  });

  it("renders the global podium stage without a video background", () => {
    const weeklyPanelStart = source.indexOf('id="leaderboardWeeklyPanel"');
    const rivalsPanelStart = source.indexOf('id="leaderboardRivalsPanel"');
    const globalPanelStart = source.indexOf('id="leaderboardGlobalPanel"');

    expect(source).not.toContain("LEADERBOARD_EARTH_VIDEO_PLAYBACK_RATE");
    expect(source).not.toContain("setGlobalLeaderboardEarthVideoRef");
    expect(source).not.toContain("leaderboardGlobalEarthVideo");
    expect(source).not.toContain('src="/leaderboard/spinning_earth.mp4"');
    expect(source).not.toContain('poster="/leaderboard/spinning-earth-poster.webp"');
    expect(source).not.toContain('className="leaderboardGlobalEarthScrim"');

    const weeklyPanelSource = source.slice(weeklyPanelStart, rivalsPanelStart);
    const rivalsPanelSource = source.slice(rivalsPanelStart, globalPanelStart);
    expect(weeklyPanelSource).not.toContain("leaderboardGlobalEarthVideo");
    expect(rivalsPanelSource).not.toContain("leaderboardGlobalEarthVideo");

    expect(friendsCss).toContain("#app[aria-label=\"TaskLaunch App\"] #leaderboardGlobalPanel .leaderboardGlobalPodiumStage");
    expect(friendsCss).not.toContain('url("/leaderboard/spinning-earth-poster.webp")');
    expect(friendsCss).not.toContain("#app[aria-label=\"TaskLaunch App\"] #leaderboardGlobalPanel .leaderboardGlobalEarthVideo");
    expect(friendsCss).not.toContain("#app[aria-label=\"TaskLaunch App\"] #leaderboardGlobalPanel .leaderboardGlobalEarthScrim");
  });

  it("shows rank insignia instead of usernames on podium cards", () => {
    expect(source).toContain('className="leaderboardWeeklyPodiumRankInsignia"');
    expect(source).toContain("<LeaderboardRankInsignia profile={row.profile} />");
    expect(source).not.toContain('className="leaderboardWeeklyPodiumUsername"');
    expect(source).not.toContain("{getLeaderboardUsernameLabel(row.profile)}");
    expect(friendsCss).toContain(".leaderboardWeeklyPodiumRankInsignia");
    expect(friendsCss).toContain(".leaderboardWeeklyPodiumRankInsignia .leaderboardRankInsignia");
  });

  it("keeps the weekly countdown above the podium crown", () => {
    const weeklyOverlayRules = Array.from(
      friendsCss.matchAll(/#app\[aria-label="TaskLaunch App"\] #leaderboardWeeklyPanel \.leaderboardWeeklyPeriodOverlay\s*\{([\s\S]*?)\}/g)
    ).map((match) => match[1] ?? "");

    expect(weeklyOverlayRules.some((rule) => rule.includes("top:8px;"))).toBe(true);
    expect(weeklyOverlayRules.some((rule) => rule.includes("background:transparent;"))).toBe(true);
    expect(weeklyOverlayRules.some((rule) => rule.includes("border:0;"))).toBe(true);
    expect(weeklyOverlayRules.some((rule) => rule.includes("box-shadow:none;"))).toBe(true);
    expect(friendsCss).toContain("font-size:clamp(13px, 1.05vw, 17px);");
    expect(friendsCss).toContain("font-size:clamp(11px, 3.2vw, 13px);");
  });

  it("delivers task-complete XP from the modal XP value after Claim", () => {
    expect(source).toContain("TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT");
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain('document.getElementById(activeAward.sourceElementKey)');
    expect(source).toContain('sourceElement?.id === "timeGoalCompleteXpValue" || sourceElement?.id === "dailyRewardXpValue"');
    expect(source).toContain('id = `modal-unit-${activeAward.sourceOverlayId}-${xpAwardPayloadSeqRef.current++}`');
    expect(source).toContain('if (activeAward.sourceModal === "timeGoalComplete" || activeAward.sourceModal === "dailyReward")');
    expect(source).toContain("runModalXpValueDelivery();");
  });

  it("opens and claims the daily reward through the shared modal XP delivery path", () => {
    expect(source).toContain("isDailyOpenRewardEligible");
    expect(source).toContain("isDailyRewardMarkedClaimedForDay(dailyRewardUid, dayKey)");
    expect(source).toContain("markDailyRewardClaimedForDay(dailyRewardUid, dayKey)");
    expect(source).toContain("openDailyRewardOverlay(document)");
    expect(source).toContain("awardDailyOpenReward(currentProgress, awardedAt)");
    expect(source).toContain("markDailyRewardClaimedForDay(dailyRewardUid, claimedDayKey)");
    expect(source).toContain('sourceModal: "dailyReward"');
    expect(source).toContain('sourceOverlayId: "dailyRewardOverlay"');
    expect(source).toContain('sourceElementKey: "dailyRewardXpValue"');
    expect(source).toContain("TASKTIMER_CLAIM_DAILY_REWARD_XP_EVENT");
    expect(source).toContain("TASKTIMER_DAILY_REWARD_XP_CLAIM_DELIVERED_EVENT");
    expect(source).toContain("dispatchDailyRewardXpClaimEvent");
    expect(source).toContain("closeDailyRewardOverlay(document)");
    expect(source).toContain('const DAILY_REWARD_AUDIO_SRC = "/daily_reward.mp3";');
    expect(source).toContain('return `<span id="dailyRewardXpValue">${Math.max(0, Math.floor(Number(xp) || 0))}</span> XP`;');
    expect(source).toContain("if (text) text.innerHTML = formatDailyRewardXpHtml(DAILY_OPEN_REWARD_XP);");
    expect(source).toContain("const dailyRewardAudioPlayer = useMemo(() => createClickAudioPlayer(DAILY_REWARD_AUDIO_SRC), []);");
    expect(source).toMatch(/openDailyRewardOverlay\(document\);\r?\n\s+if \(achievementSoundsEnabled\) dailyRewardAudioPlayer\.play\(\);/);
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
    expect(source).toMatch(/addExtraTimer\(\(\) => \{\r?\n\s+markPayloadArrived\(\);\r?\n\s+\}, XP_AWARD_UNIT_FX_DURATION_MS\);/);
    expect(source).toMatch(/playXpAwardDoneSoundOnce\(\);\r?\n\s+if \(reducedMotion\) \{/);
    expect(source).toMatch(/xpAwardUnitDeliveryAudioPlayer\.stop\(\);\r?\n\s+playXpAwardDoneSoundOnce\(\);/);
    expect(source).toContain("}, XP_AWARD_UNIT_FX_DURATION_MS);");
    expect(source).toContain("xpAwardDeliveryDoneAudioPlayer,");
    expect(source).toContain("xpAwardUnitDeliveryAudioPlayer,");
  });

  it("holds the app top bar XP until modal XP payload delivery finishes", () => {
    const modalDeliveryStart = source.indexOf("const runModalXpValueDelivery = () => {");
    const animationStart = source.indexOf("if (achievementSoundsEnabled) {", modalDeliveryStart);
    const scheduleDeliveryStart = source.indexOf("scheduleUnitPayloadDelivery();", modalDeliveryStart);
    const finishModalAwardStart = source.indexOf("const finishModalAwardWhenReady = () => {", modalDeliveryStart);
    const finishModalAwardEnd = source.indexOf("const markPayloadArrived = () => {", finishModalAwardStart);
    const tickStart = source.indexOf("const tick = (nowValue: number) => {", modalDeliveryStart);
    const tickEnd = source.indexOf("xpAnimationFrameRef.current = window.requestAnimationFrame(tick);", tickStart);
    const animationSetupSource = source.slice(animationStart, scheduleDeliveryStart);
    const finishModalAwardSource = source.slice(finishModalAwardStart, finishModalAwardEnd);
    const tickSource = source.slice(tickStart, tickEnd);

    expect(animationSetupSource).not.toContain("countAnimationStartedDuringEffect = true;");
    expect(animationSetupSource).not.toContain("xpCountAnimationStartedRef.current = true;");
    expect(animationSetupSource).toContain("setIsXpCountAnimating(false);");
    expect(tickSource).not.toContain("setDisplayedXp(nextDisplayedXp);");
    expect(tickSource).not.toContain("displayedXpRef.current = endXp;");
    expect(finishModalAwardSource).toContain("playXpAwardDoneSoundOnce();");
    expect(finishModalAwardSource).toContain("const tickHeaderCount = (nowValue: number) => {");
    expect(finishModalAwardSource).toContain("xpCountAnimationStartedRef.current = true;");
    expect(finishModalAwardSource).toContain("setIsXpCountAnimating(true);");
    expect(finishModalAwardSource).toContain("setDisplayedXp(nextDisplayedXp);");
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
