"use client";

import type { ReactNode } from "react";

type InlineConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  title: string;
  overlayClassName?: string;
  modalClassName?: string;
  titleClassName?: string;
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
  children,
}: InlineConfirmModalProps) {
  if (!open) return null;

  return (
    <div className={`overlay ${overlayClassName}`.trim()} onClick={onClose}>
      <div className={`modal ${modalClassName}`.trim()} role="dialog" aria-modal="true" aria-label={ariaLabel} onClick={(event) => event.stopPropagation()}>
        <h3 className={titleClassName}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
