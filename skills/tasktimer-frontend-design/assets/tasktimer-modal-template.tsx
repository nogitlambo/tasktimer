import React from "react";

type TaskTimerModalTemplateProps = {
  overlayId: string;
  ariaLabel: string;
  title: string;
  body?: React.ReactNode;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryButtonId?: string;
  secondaryButtonId?: string;
};

export default function TaskTimerModalTemplate({
  overlayId,
  ariaLabel,
  title,
  body,
  primaryLabel = "Save",
  secondaryLabel = "Close",
  primaryButtonId,
  secondaryButtonId,
}: TaskTimerModalTemplateProps) {
  return (
    <div className="overlay" id={overlayId}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <h2>{title}</h2>
        <div>{body}</div>
        <div className="footerBtns">
          <button className="btn btn-accent" id={primaryButtonId} type="button">
            {primaryLabel}
          </button>
          <button className="btn btn-ghost closePopup" id={secondaryButtonId} type="button">
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
