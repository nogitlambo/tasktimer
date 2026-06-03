"use client";

import { createPortal } from "react-dom";

type SignOutConfirmModalProps = {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function getSignOutConfirmActionLabel(busy: boolean) {
  return busy ? "Signing Out" : "Sign Out";
}

export default function SignOutConfirmModal({ open, busy, onCancel, onConfirm }: SignOutConfirmModalProps) {
  if (!open) return null;

  const modal = (
    <div className="overlay" id="signOutConfirmOverlay" aria-hidden="false" style={{ display: "flex" }} onClick={busy ? undefined : onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Sign Out" onClick={(event) => event.stopPropagation()}>
        <h2>Sign Out</h2>
        <p className="modalSubtext confirmText">Sign out of TaskLaunch on this device?</p>
        <div className="confirmBtns">
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-warn" type="button" onClick={onConfirm} disabled={busy}>
            {getSignOutConfirmActionLabel(busy)}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modal, document.body);
  }

  return modal;
}
