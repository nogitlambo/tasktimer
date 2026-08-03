"use client";

import { useEffect, useState } from "react";
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

export type NativePlusUpsellPanel = "monthly" | "lifetime";

export function getNativePlusUpsellPanelForOffer(offer: TaskTimerPaidOffer): NativePlusUpsellPanel {
  return offer === "plus_lifetime" ? "lifetime" : "monthly";
}

export function getNativePlusUpsellToggleCopy(panel: NativePlusUpsellPanel): string {
  return panel === "lifetime" ? "Back to monthly" : "Get PLUS Lifetime";
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
  const [visiblePanel, setVisiblePanel] = useState<NativePlusUpsellPanel>("monthly");

  useEffect(() => {
    if (!open) {
      setVisiblePanel("monthly");
      return;
    }
    setVisiblePanel(getNativePlusUpsellPanelForOffer(selectedOffer));
  }, [open, selectedOffer]);

  if (!open) return null;

  const showLifetimePanel = () => {
    if (busy) return;
    setVisiblePanel("lifetime");
    if (selectedOffer !== "plus_lifetime") onSelectOffer("plus_lifetime");
  };

  const showMonthlyPanel = () => {
    if (busy) return;
    setVisiblePanel("monthly");
    if (selectedOffer !== "plus_monthly") onSelectOffer("plus_monthly");
  };

  const handleTogglePanel = () => {
    if (visiblePanel === "lifetime") {
      showMonthlyPanel();
      return;
    }
    showLifetimePanel();
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
              className={`nativePlusUpsellOfferTrack${visiblePanel === "lifetime" ? " isLifetimeVisible" : ""}`}
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
                    <strong className="nativePlusUpsellPrice">$6.99</strong>
                    <span className="nativePlusUpsellBilling">Per month</span>
                  </span>
                </button>
              </div>
              <div className="nativePlusUpsellOfferPanel">
                <button
                  type="button"
                  className={`nativePlusUpsellOfferCard${selectedOffer === "plus_lifetime" ? " isSelected" : ""}`}
                  onClick={showLifetimePanel}
                  disabled={busy}
                  aria-pressed={selectedOffer === "plus_lifetime"}
                >
                  <span className="nativePlusUpsellOfferHeadingRow">
                    <strong className="nativePlusUpsellOfferTitle">PLUS Lifetime</strong>
                  </span>
                  <span className="nativePlusUpsellPriceRow" aria-label="Plus lifetime price">
                    <strong className="nativePlusUpsellPrice">$99.00</strong>
                    <span className="nativePlusUpsellBilling">One-off payment</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
          {visiblePanel === "monthly" ? <span className="nativePlusUpsellOfferBadge">14-DAY FREE TRIAL</span> : null}
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
