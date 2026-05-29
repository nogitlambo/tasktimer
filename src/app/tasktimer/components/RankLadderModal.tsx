import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type TouchEvent as ReactTouchEvent } from "react";
import RankThumbnail from "./RankThumbnail";
import {
  getResetMobileSwipeCloseState,
  getStartMobileSwipeCloseState,
  shouldCloseFromMobileSwipe,
  type MobileSwipeCloseState,
} from "./mobileSwipeClose";
import { playTaskFlipClickAudio } from "../client/secondary-click-audio";
import { RANK_LADDER, RANK_MODAL_THUMBNAIL_BY_ID } from "../lib/rewards";

type RankLadderModalProps = {
  open: boolean;
  onClose: () => void;
  rankLabel: string;
  totalXp: number;
  rankSummary: string;
  currentRankId: string;
  currentRankIndex: number;
  rankThumbnailSrc: string;
  canSelectRankInsignia: boolean;
  onSelectRankThumbnail: (rankId: string) => void | Promise<void>;
  onTestRankPromotion?: (rankId: string) => void;
};

const RANK_PROMOTION_TEST_TRIGGER_ENABLED = ["1", "true"].includes(
  String(process.env.NEXT_PUBLIC_RANK_PROMOTION_TEST_TRIGGER || "").trim().toLowerCase()
);
const MOBILE_SWIPE_CLOSE_START_ZONE_PX = 78;
const MOBILE_SWIPE_CLOSE_THRESHOLD_PX = 70;

function formatXpValue(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString();
}

export default function RankLadderModal(props: RankLadderModalProps) {
  const {
    open,
    onClose,
    rankLabel,
    currentRankId,
    currentRankIndex,
    rankThumbnailSrc,
    canSelectRankInsignia,
    onSelectRankThumbnail,
    onTestRankPromotion,
  } = props;

  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const currentRankItemRef = useRef<HTMLElement | null>(null);
  const swipeCloseRef = useRef<MobileSwipeCloseState>(getResetMobileSwipeCloseState());
  const setCurrentRankButtonRef = (node: HTMLButtonElement | null) => {
    currentRankItemRef.current = node;
  };
  const setCurrentRankDivRef = (node: HTMLDivElement | null) => {
    currentRankItemRef.current = node;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 700px)");
    const syncLayout = () => setIsMobileLayout(mediaQuery.matches);
    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  useLayoutEffect(() => {
    if (!open || !isMobileLayout || typeof window === "undefined") return undefined;
    const scrollContainer = scrollContainerRef.current;
    const currentRankItem = currentRankItemRef.current;
    if (!scrollContainer || !currentRankItem) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const containerRect = scrollContainer.getBoundingClientRect();
      const itemRect = currentRankItem.getBoundingClientRect();
      const itemTop = itemRect.top - containerRect.top + scrollContainer.scrollTop;
      const targetTop = itemTop - scrollContainer.clientHeight * 0.75 + itemRect.height / 2;
      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      scrollContainer.scrollTop = Math.min(Math.max(0, targetTop), maxScrollTop);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [currentRankId, isMobileLayout, open]);

  const resetSwipeClose = () => {
    swipeCloseRef.current = getResetMobileSwipeCloseState();
  };

  const closeMobilePanel = () => {
    if (isMobileLayout) playTaskFlipClickAudio();
    onClose();
  };

  const handleModalPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    resetSwipeClose();
    if (!isMobileLayout || event.button !== 0) return;

    const modalRect = event.currentTarget.getBoundingClientRect();
    const isInTopZone = event.clientY - modalRect.top <= MOBILE_SWIPE_CLOSE_START_ZONE_PX;
    if (!isInTopZone) return;

    swipeCloseRef.current = getStartMobileSwipeCloseState(event.pointerId, event.clientX, event.clientY);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture failures on older embedded browsers.
    }
  };

  const handleModalPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const swipeClose = swipeCloseRef.current;
    if (!swipeClose.active || swipeClose.consumed || swipeClose.pointerId !== event.pointerId) return;

    if (!shouldCloseFromMobileSwipe(swipeClose, event.pointerId, event.clientX, event.clientY, MOBILE_SWIPE_CLOSE_THRESHOLD_PX)) return;

    event.preventDefault();
    swipeCloseRef.current.consumed = true;
    closeMobilePanel();
  };

  const handleModalPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (swipeCloseRef.current.pointerId === event.pointerId) resetSwipeClose();
  };

  const handleModalTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    resetSwipeClose();
    if (!isMobileLayout || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const modalRect = event.currentTarget.getBoundingClientRect();
    const isInTopZone = touch.clientY - modalRect.top <= MOBILE_SWIPE_CLOSE_START_ZONE_PX;
    if (!isInTopZone) return;

    swipeCloseRef.current = getStartMobileSwipeCloseState(touch.identifier, touch.clientX, touch.clientY);
  };

  const handleModalTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const swipeClose = swipeCloseRef.current;
    if (!swipeClose.active || swipeClose.consumed || swipeClose.pointerId == null) return;

    const touch = Array.from(event.touches).find((currentTouch) => currentTouch.identifier === swipeClose.pointerId);
    if (!touch) return;
    if (!shouldCloseFromMobileSwipe(swipeClose, touch.identifier, touch.clientX, touch.clientY, MOBILE_SWIPE_CLOSE_THRESHOLD_PX)) return;

    event.preventDefault();
    swipeCloseRef.current.consumed = true;
    closeMobilePanel();
  };

  const handleModalTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const swipeClose = swipeCloseRef.current;
    if (swipeClose.pointerId == null) return;
    if (Array.from(event.changedTouches).some((touch) => touch.identifier === swipeClose.pointerId)) resetSwipeClose();
  };

  if (!open) return null;

  const ladderRows = Array.from({ length: Math.ceil(RANK_LADDER.length / 4) }, (_, rowIndex) =>
    RANK_LADDER.slice(rowIndex * 4, rowIndex * 4 + 4).map((rank, columnIndex) => ({
      rank,
      index: rowIndex * 4 + columnIndex,
    }))
  );
  const mobileDisplayRanks = RANK_LADDER.map((rank, index) => ({ rank, index })).reverse();
  const displayRanks = isMobileLayout ? mobileDisplayRanks : [...ladderRows].reverse().flat();

  return (
    <div className="overlay" id="rankLadderOverlay" onClick={closeMobilePanel}>
      <div
        className="modal rankLadderModal"
        role="dialog"
        aria-modal="true"
        aria-label="Rank ladder"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={handleModalPointerDown}
        onPointerMove={handleModalPointerMove}
        onPointerUp={handleModalPointerEnd}
        onPointerCancel={handleModalPointerEnd}
        onTouchStart={handleModalTouchStart}
        onTouchMove={handleModalTouchMove}
        onTouchEnd={handleModalTouchEnd}
        onTouchCancel={handleModalTouchEnd}
      >
        <div className="rankLadderSwipeHandle" aria-hidden="true" />
        {!isMobileLayout ? (
          <button className="iconBtn rankLadderCloseBtn" type="button" onClick={onClose} aria-label="Close rank ladder">
            <span aria-hidden="true">X</span>
          </button>
        ) : null}
        <div className="rankLadderHeader">
          <h2>Rank Ladder</h2>
          <p className="modalSubtext">Your rank is {rankLabel}.</p>
        </div>
        <div className="rankLadderModalScroll" ref={scrollContainerRef}>
          <div className="rankLadderList" role="list" aria-label="Available ranks">
            {displayRanks.map(({ rank, index }) => {
              const isCurrent = rank.id === currentRankId;
              const isUnlocked = index <= currentRankIndex;
              const thresholdLabel = Number.isFinite(rank.minXp) ? `${formatXpValue(rank.minXp)} XP` : "Threshold pending";
              const rankThumbnail = RANK_MODAL_THUMBNAIL_BY_ID[rank.id] || "";
              const isSelectedThumbnail = rankThumbnailSrc === rankThumbnail && !!rankThumbnail;
              const canTestRankPromotion = RANK_PROMOTION_TEST_TRIGGER_ENABLED && !!onTestRankPromotion;
              const isClickable = canTestRankPromotion || canSelectRankInsignia;
              const handleRankClick = () => {
                if (canTestRankPromotion) {
                  onTestRankPromotion(rank.id);
                  return;
                }
                void onSelectRankThumbnail(rank.id);
              };
              const content = (
                <>
                  <div className="rankLadderItemBadge" aria-hidden="true">
                    <RankThumbnail
                      rankId={rank.id}
                      storedThumbnailSrc=""
                      className="rankLadderItemBadgeShell"
                      imageClassName="rankLadderItemBadgeImage"
                      placeholderClassName="rankLadderItemBadgePlaceholder"
                      alt=""
                      size={34}
                      aria-hidden
                    />
                  </div>
                  <div className="rankLadderItemBody">
                    <div className="rankLadderItemTitleRow">
                      <span className="rankLadderItemTitle">{rank.label}</span>
                    </div>
                    {rank.id === "unranked" ? null : (
                      <div className="rankLadderItemMeta">
                        {isUnlocked ? `Promoted at ${thresholdLabel}` : `You need ${thresholdLabel} to be promoted to this rank`}
                      </div>
                    )}
                  </div>
                </>
              );

              if (isClickable) {
                return (
                  <button
                    key={rank.id}
                    type="button"
                    className={`rankLadderItem isSelectable${isCurrent ? " isCurrent" : ""}${isUnlocked ? " isUnlocked" : ""}${isSelectedThumbnail ? " isSelectedThumbnail" : ""}`}
                    role="listitem"
                    onClick={handleRankClick}
                    ref={isCurrent ? setCurrentRankButtonRef : undefined}
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div
                  key={rank.id}
                  className={`rankLadderItem${isCurrent ? " isCurrent" : ""}${isUnlocked ? " isUnlocked" : ""}${isSelectedThumbnail ? " isSelectedThumbnail" : ""}`}
                  role="listitem"
                  ref={isCurrent ? setCurrentRankDivRef : undefined}
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
