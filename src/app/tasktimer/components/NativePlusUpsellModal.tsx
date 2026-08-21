"use client";

import type { TaskTimerPaidOffer } from "../lib/entitlements";

const PLUS_FEATURES = [
  "Everything in Free, plus:",
  "Unlock AI-guided workflow optimisation",
  "Richer dashboard analytics and insights",
  "XP award boosters",
  "Unlimited session history",
  "Manual history entry",
  "Add Friends and task sharing",
  "Backup Import/Export",
];

export type NativePlusUpsellPanel = "monthly" | "yearly";

export function getNativePlusUpsellPanelForOffer(offer: TaskTimerPaidOffer): NativePlusUpsellPanel {
  return offer === "plus_yearly" ? "yearly" : "monthly";
}

export function getNativePlusUpsellToggleCopy(panel: NativePlusUpsellPanel): string {
  return panel === "yearly" ? "Back to monthly" : "Get PLUS Yearly";
}

export default function NativePlusUpsellModal({
  open,
  busy,
  error,
  selectedOffer,
  onClose,
  onSelectOffer,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string;
  selectedOffer: TaskTimerPaidOffer;
  onClose: () => void;
  onSelectOffer: (offer: TaskTimerPaidOffer) => void;
  onConfirm: (offer: TaskTimerPaidOffer) => void | Promise<void>;
}) {
  if (!open) return null;

  const visiblePanel = getNativePlusUpsellPanelForOffer(selectedOffer);

  const showYearlyPanel = () => {
    if (busy) return;
    if (selectedOffer !== "plus_yearly") onSelectOffer("plus_yearly");
  };

  const showMonthlyPanel = () => {
    if (busy) return;
    if (selectedOffer !== "plus_monthly") onSelectOffer("plus_monthly");
  };

  const handleTogglePanel = () => {
    if (visiblePanel === "yearly") {
      showMonthlyPanel();
      return;
    }
    showYearlyPanel();
  };

  return (
    <div
      className="overlay"
      id="nativePlusUpsellOverlay"
      style={{ display: "flex" }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal nativePlusUpsellPrimitiveModal" role="dialog" aria-modal="true" aria-label="Upgrade to Plus">
        <button
          className="iconBtn nativePlusUpsellCloseBtn"
          type="button"
          aria-label="Close"
          onClick={onClose}
          disabled={busy}
      >
        x
      </button>
        <div className="nativePlusUpsellTopSection">
          <div className="nativePlusUpsellOfferViewport">
            <div
              className={`nativePlusUpsellOfferTrack${visiblePanel === "yearly" ? " isLifetimeVisible" : ""}`}
              role="list"
              aria-label="Plus offers"
            >
              <div className="nativePlusUpsellOfferPanel">
                <button
                  type="button"
                  className={`nativePlusUpsellOfferCard${selectedOffer === "plus_monthly" ? " isSelected" : ""}`}
                  onClick={showMonthlyPanel}
                  disabled={busy}
                  aria-pressed={selectedOffer === "plus_monthly"}
                >
                  <span className="nativePlusUpsellOfferHeadingRow">
                    <strong className="nativePlusUpsellOfferTitle">Get <span className="nativePlusUpsellOfferTitleAccent">PLUS</span></strong>
                  </span>
                  <span className="nativePlusUpsellPriceRow" aria-label="Plus monthly price">
                    <strong className="nativePlusUpsellPrice">$14.99</strong>
                    <span className="nativePlusUpsellBilling">Per month</span>
                  </span>
                </button>
              </div>
              <div className="nativePlusUpsellOfferPanel">
                <button
                  type="button"
                  className={`nativePlusUpsellOfferCard${selectedOffer === "plus_yearly" ? " isSelected" : ""}`}
                  onClick={showYearlyPanel}
                  disabled={busy}
                  aria-pressed={selectedOffer === "plus_yearly"}
                >
                  <span className="nativePlusUpsellOfferHeadingRow">
                    <strong className="nativePlusUpsellOfferTitle">PLUS Yearly</strong>
                  </span>
                  <span className="nativePlusUpsellPriceRow" aria-label="Plus yearly price">
                    <strong className="nativePlusUpsellPrice">$149.00</strong>
                    <span className="nativePlusUpsellBilling">Per year</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
          {visiblePanel === "monthly" ? <span className="nativePlusUpsellOfferBadge">1 MONTH FREE TRIAL</span> : null}
        </div>
        <div className="nativePlusUpsellDivider" aria-hidden="true" />
        <ul className="nativePlusUpsellFeatureList">
          {PLUS_FEATURES.map((feature) => (
            <li key={feature}>
              <span className="nativePlusUpsellFeatureIcon" aria-hidden="true">
                {">"}
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        {error ? (
          <p className="modalSubtext nativePlusUpsellError" role="alert" aria-live="polite">
            {error}
          </p>
        ) : null}
        <div className="confirmBtns nativePlusUpsellActions">
          <button
            className="btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction nativePlusUpsellPrimaryAction"
            type="button"
            onClick={() => void onConfirm(selectedOffer)}
            disabled={busy}
          >
            {busy
              ? "Starting Checkout..."
              : selectedOffer === "plus_yearly"
                ? "Get PLUS Yearly"
                : "Start my 1 month free trial"}
          </button>
        </div>
        <button
          type="button"
          className="nativePlusUpsellToggleLink"
          onClick={handleTogglePanel}
          disabled={busy}
        >
          {getNativePlusUpsellToggleCopy(visiblePanel)}
        </button>
      </div>
    </div>
  );
}
