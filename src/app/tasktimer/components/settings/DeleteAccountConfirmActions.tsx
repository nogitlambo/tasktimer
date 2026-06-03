"use client";

import { useEffect, useState } from "react";

const DELETE_ACCOUNT_ARM_DELAY_SECONDS = 5;

type DeleteAccountConfirmActionsProps = {
  authBusy: boolean;
  className: string;
  onCancel: () => void;
  onDelete: () => void;
};

export function DeleteAccountConfirmActions({ authBusy, className, onCancel, onDelete }: DeleteAccountConfirmActionsProps) {
  const [isDeleteAccountArmed, setIsDeleteAccountArmed] = useState(false);
  const [deleteAccountCountdown, setDeleteAccountCountdown] = useState(DELETE_ACCOUNT_ARM_DELAY_SECONDS);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setIsDeleteAccountArmed(true);
      setDeleteAccountCountdown(0);
    }, DELETE_ACCOUNT_ARM_DELAY_SECONDS * 1000);
    const intervalId = window.setInterval(() => {
      setDeleteAccountCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => {
      window.clearTimeout(timerId);
      window.clearInterval(intervalId);
    };
  }, []);

  const deleteAccountLabel = isDeleteAccountArmed ? "Delete" : `Delete (${deleteAccountCountdown})`;

  return (
    <div className={className}>
      <button className="btn btn-ghost" type="button" onClick={onCancel}>
        Cancel
      </button>
      <button className="btn btn-warn" type="button" onClick={onDelete} disabled={authBusy || !isDeleteAccountArmed}>
        {deleteAccountLabel}
      </button>
    </div>
  );
}
