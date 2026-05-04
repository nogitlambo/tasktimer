import { useEffect, useState } from "react";
import RankThumbnail from "./RankThumbnail";
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
};

export default function RankLadderModal(props: RankLadderModalProps) {
  const {
    open,
    onClose,
    rankLabel,
    totalXp,
    rankSummary,
    currentRankId,
    currentRankIndex,
    rankThumbnailSrc,
    canSelectRankInsignia,
    onSelectRankThumbnail,
  } = props;

  const [isMobileLayout, setIsMobileLayout] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 700px)");
    const syncLayout = () => setIsMobileLayout(mediaQuery.matches);
    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  if (!open) return null;

  const ladderRows = Array.from({ length: Math.ceil(RANK_LADDER.length / 4) }, (_, rowIndex) =>
    RANK_LADDER.slice(rowIndex * 4, rowIndex * 4 + 4).map((rank, columnIndex) => ({
      rank,
      index: rowIndex * 4 + columnIndex,
    }))
  );
  const displayRanks = (isMobileLayout ? ladderRows : [...ladderRows].reverse()).flat();

  return (
    <div className="overlay" id="rankLadderOverlay" onClick={onClose}>
      <div className="modal rankLadderModal" role="dialog" aria-modal="true" aria-label="Rank ladder" onClick={(event) => event.stopPropagation()}>
        <h2>Rank Ladder</h2>
        <p className="modalSubtext">
          {rankLabel} is your current rank at {totalXp} XP. {rankSummary}
        </p>
        <div className="rankLadderList" role="list" aria-label="Available ranks">
          {displayRanks.map(({ rank, index }) => {
            const isCurrent = rank.id === currentRankId;
            const isUnlocked = index <= currentRankIndex;
            const thresholdLabel = Number.isFinite(rank.minXp) ? `${rank.minXp} XP` : "Threshold pending";
            const rankThumbnail = RANK_MODAL_THUMBNAIL_BY_ID[rank.id] || "";
            const isSelectedThumbnail = rankThumbnailSrc === rankThumbnail && !!rankThumbnail;
            const content = (
              <>
                <div className="rankLadderItemBadge" aria-hidden="true">
                  <RankThumbnail
                    rankId={rank.id}
                    storedThumbnailSrc=""
                    className="rankLadderItemBadgeShell"
                    imageClassName="rankLadderItemBadgeImage"
                    placeholderClassName="rankLadderItemBadgePlaceholder"
                    forcePlaceholder
                    alt=""
                    size={34}
                    aria-hidden
                  />
                </div>
                <div className="rankLadderItemBody">
                  <div className="rankLadderItemTitleRow">
                    <span className="rankLadderItemTitle">{rank.label}</span>
                  </div>
                  {rank.id === "unranked" ? null : <div className="rankLadderItemMeta">Unlocks at {thresholdLabel}</div>}
                </div>
              </>
            );

            if (canSelectRankInsignia) {
              return (
                <button
                  key={rank.id}
                  type="button"
                  className={`rankLadderItem isSelectable${isCurrent ? " isCurrent" : ""}${isUnlocked ? " isUnlocked" : ""}${isSelectedThumbnail ? " isSelectedThumbnail" : ""}`}
                  role="listitem"
                  onClick={() => void onSelectRankThumbnail(rank.id)}
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
              >
                {content}
              </div>
            );
          })}
        </div>
        <div className="confirmBtns">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
