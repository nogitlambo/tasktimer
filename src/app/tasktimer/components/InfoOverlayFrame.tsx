import type { ReactNode } from "react";

type InfoOverlayFrameProps = {
  overlayId: string;
  ariaLabel: string;
  title?: string;
  children: ReactNode;
  footerClassName?: string;
  closeLabel?: string;
};

export default function InfoOverlayFrame({
  overlayId,
  ariaLabel,
  title,
  children,
  footerClassName = "footerBtns",
  closeLabel = "Close",
}: InfoOverlayFrameProps) {
  return (
    <div className="overlay" id={overlayId}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        {title ? <h2>{title}</h2> : null}
        {children}
        <div className={footerClassName}>
          <button className="btn btn-accent closePopup" type="button">
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
