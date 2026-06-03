"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type InlineConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  title: string;
  overlayClassName?: string;
  modalClassName?: string;
  titleClassName?: string;
  titleIcon?: ReactNode;
  portalToBody?: boolean;
  children: ReactNode;
};

export function InlineConfirmModal({
  open,
  onClose,
  ariaLabel,
  title,
  overlayClassName = "settingsInlineConfirmOverlay",
  modalClassName = "settingsInlineConfirmModal",
  titleClassName = "settingsInlineConfirmTitle",
  titleIcon,
  portalToBody = false,
  children,
}: InlineConfirmModalProps) {
  if (!open) return null;

  const modal = (
    <div className={`overlay ${overlayClassName}`.trim()} onClick={onClose}>
      <div className={`modal ${modalClassName}`.trim()} role="dialog" aria-modal="true" aria-label={ariaLabel} onClick={(event) => event.stopPropagation()}>
        <h3 className={titleClassName}>
          {titleIcon ? <span className="inlineConfirmTitleIcon">{titleIcon}</span> : null}
          <span>{title}</span>
        </h3>
        {children}
      </div>
    </div>
  );

  if (portalToBody && typeof document !== "undefined") {
    return createPortal(modal, document.body);
  }

  return modal;
}
