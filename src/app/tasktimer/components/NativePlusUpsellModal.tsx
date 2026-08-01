"use client";

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
  ctaLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string;
  ctaLabel: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
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
        <div className="nativePlusUpsellPriceRow" aria-label="Plus price">
          <strong className="nativePlusUpsellPrice">$1.00</strong>
          <span className="nativePlusUpsellBilling">Per month</span>
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
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
