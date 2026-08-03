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
        <div className="nativePlusUpsellHeader">
          <h2>
            Get <span className="nativePlusUpsellTitleAccent">PLUS</span>
          </h2>
          <span className="nativePlusUpsellBadge">14-DAY FREE TRIAL</span>
        </div>
        <p className="modalSubtext nativePlusUpsellIntro">Advanced tools for power users</p>
        <div className="nativePlusUpsellOfferList" role="list" aria-label="Plus offers">
          <button
            type="button"
            className={`nativePlusUpsellOfferCard${selectedOffer === "plus_monthly" ? " isSelected" : ""}`}
            onClick={() => onSelectOffer("plus_monthly")}
            disabled={busy}
            aria-pressed={selectedOffer === "plus_monthly"}
          >
            <span className="nativePlusUpsellOfferHeadingRow">
              <strong className="nativePlusUpsellOfferTitle">PLUS</strong>
              <span className="nativePlusUpsellOfferBadge">14-DAY FREE TRIAL</span>
            </span>
            <span className="nativePlusUpsellPriceRow" aria-label="Plus monthly price">
              <strong className="nativePlusUpsellPrice">$6.99</strong>
              <span className="nativePlusUpsellBilling">Per month</span>
            </span>
          </button>
          <button
            type="button"
            className={`nativePlusUpsellOfferCard${selectedOffer === "plus_lifetime" ? " isSelected" : ""}`}
            onClick={() => onSelectOffer("plus_lifetime")}
            disabled={busy}
            aria-pressed={selectedOffer === "plus_lifetime"}
          >
            <span className="nativePlusUpsellOfferHeadingRow">
              <strong className="nativePlusUpsellOfferTitle">PLUS Lifetime</strong>
              <span className="nativePlusUpsellOfferBadge">ONE-TIME</span>
            </span>
            <span className="nativePlusUpsellPriceRow" aria-label="Plus lifetime price">
              <strong className="nativePlusUpsellPrice">Lifetime</strong>
              <span className="nativePlusUpsellBilling">One-time purchase</span>
            </span>
          </button>
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
              : selectedOffer === "plus_lifetime"
                ? "Get PLUS Lifetime"
                : "Start my 14-day free trial"}
          </button>
        </div>
      </div>
    </div>
  );
}
