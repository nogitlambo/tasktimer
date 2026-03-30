import type { TaskTimerConfirmOptions, TaskTimerConfirmOverlayContext } from "./context";

export function createTaskTimerConfirmOverlay(ctx: TaskTimerConfirmOverlayContext) {
  const { els } = ctx;
  let confirmDangerMatchValue = "";

  function openOverlay(overlay: HTMLElement | null) {
    if (!overlay) return;
    overlay.style.display = "flex";
  }

  function closeOverlay(overlay: HTMLElement | null) {
    if (!overlay) return;
    try {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } catch {
      // ignore
    }
    overlay.style.display = "none";
  }

  function syncConfirmPrimaryToggleUi() {
    const toggle = document.getElementById("confirmDeleteAllSwitch");
    if (!(toggle instanceof HTMLElement)) return;
    const isOn = !!els.confirmDeleteAll?.checked;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-checked", isOn);
    toggle.classList.toggle("on", isOn);
    toggle.setAttribute("aria-checked", isOn ? "true" : "false");
  }

  function syncConfirmDangerInputUi() {
    if (!els.confirmOkBtn) return;
    const requiresMatch = !!confirmDangerMatchValue;
    const value = String(els.confirmDangerInput?.value || "").trim();
    const matches = !requiresMatch || value === confirmDangerMatchValue;
    (els.confirmOkBtn as HTMLButtonElement).disabled = !matches;
    (els.confirmOkBtn as HTMLElement).style.display = requiresMatch && !matches ? "none" : "inline-flex";
  }

  function confirm(title: string, text: string, opts?: TaskTimerConfirmOptions) {
    ctx.setConfirmAction(opts?.onOk || null);
    ctx.setConfirmActionAlt(opts?.onAlt || null);
    confirmDangerMatchValue = String(opts?.dangerInputMatch || "").trim();

    const okLabel = opts?.okLabel || "OK";
    const altLabel = opts?.altLabel || null;

    if (els.confirmOkBtn) {
      els.confirmOkBtn.textContent = okLabel;
      (els.confirmOkBtn as HTMLElement).style.display = "inline-flex";
      (els.confirmOkBtn as HTMLButtonElement).disabled = false;
      els.confirmOkBtn.classList.remove("btn-warn");
      els.confirmOkBtn.classList.add("btn-accent");
      if (String(okLabel).toLowerCase() === "delete") {
        els.confirmOkBtn.classList.remove("btn-accent");
        els.confirmOkBtn.classList.add("btn-warn");
      }
    }

    if (els.confirmAltBtn) {
      if (altLabel) {
        els.confirmAltBtn.textContent = altLabel;
        (els.confirmAltBtn as HTMLElement).style.display = "inline-flex";
        (els.confirmAltBtn as HTMLButtonElement).disabled = false;
      } else {
        (els.confirmAltBtn as HTMLElement).style.display = "none";
        els.confirmAltBtn.textContent = "";
      }
    }

    const showChk = !!opts?.checkboxLabel;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).style.display = showChk ? "flex" : "none";
    if (showChk && els.confirmChkLabel) {
      const labelTextEl = els.confirmChkLabel.querySelector(".confirmChkLabelText");
      if (labelTextEl) labelTextEl.textContent = String(opts?.checkboxLabel || "");
      else els.confirmChkLabel.textContent = String(opts?.checkboxLabel || "");
    }
    if (els.confirmDeleteAll) els.confirmDeleteAll.checked = showChk ? !!opts?.checkboxChecked : false;
    const disableChk = showChk ? !!opts?.checkboxDisabled : false;
    if (els.confirmDeleteAll) els.confirmDeleteAll.disabled = disableChk;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-disabled", disableChk);
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-checked", !!els.confirmDeleteAll?.checked);
    syncConfirmPrimaryToggleUi();

    const showChkNote = showChk && !!opts?.checkboxNote;
    if (els.confirmChkNote) {
      (els.confirmChkNote as HTMLElement).style.display = showChkNote ? "block" : "none";
      (els.confirmChkNote as HTMLElement).textContent = showChkNote ? String(opts?.checkboxNote || "") : "";
    }

    const showChk2 = !!opts?.checkbox2Label;
    if (els.confirmChkRow2) (els.confirmChkRow2 as HTMLElement).style.display = showChk2 ? "flex" : "none";
    if (showChk2 && els.confirmChkLabel2) els.confirmChkLabel2.textContent = String(opts?.checkbox2Label || "");
    if (els.confirmLogChk) els.confirmLogChk.checked = showChk2 ? !!opts?.checkbox2Checked : false;

    const showDangerInput = !!confirmDangerMatchValue;
    if (els.confirmDangerInputRow) (els.confirmDangerInputRow as HTMLElement).style.display = showDangerInput ? "grid" : "none";
    if (els.confirmDangerInputLabel) {
      const dangerInputLabel =
        opts && Object.prototype.hasOwnProperty.call(opts, "dangerInputLabel")
          ? String(opts.dangerInputLabel ?? "")
          : `Enter ${confirmDangerMatchValue}`;
      els.confirmDangerInputLabel.textContent = showDangerInput ? dangerInputLabel : "";
    }
    if (els.confirmDangerInput) {
      els.confirmDangerInput.value = "";
      els.confirmDangerInput.placeholder = String(opts?.dangerInputPlaceholder || confirmDangerMatchValue || "");
      els.confirmDangerInput.disabled = false;
    }

    if (els.confirmTitle) els.confirmTitle.textContent = title || "Confirm";
    if (els.confirmText) {
      if (opts?.textHtml) els.confirmText.innerHTML = String(opts.textHtml || "");
      else els.confirmText.textContent = text || "";
    }

    syncConfirmDangerInputUi();

    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).style.display = "flex";
  }

  function closeConfirm() {
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).style.display = "none";
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isDeleteTaskConfirm");
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isDeleteFriendConfirm");
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isTaskAlreadyRunningConfirm");
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.remove("isResetAllDeleteConfirm");
    ctx.setConfirmAction(null);
    ctx.setConfirmActionAlt(null);
    confirmDangerMatchValue = "";
    if (els.confirmAltBtn) (els.confirmAltBtn as HTMLElement).style.display = "none";
    if (els.confirmAltBtn) (els.confirmAltBtn as HTMLButtonElement).disabled = false;
    if (els.confirmOkBtn) {
      (els.confirmOkBtn as HTMLButtonElement).disabled = false;
      els.confirmOkBtn.classList.remove("btn-warn");
      els.confirmOkBtn.classList.add("btn-accent");
    }
    if (els.confirmCancelBtn) (els.confirmCancelBtn as HTMLButtonElement).disabled = false;
    if (els.confirmDeleteAll) els.confirmDeleteAll.disabled = false;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.remove("is-disabled");
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-checked", !!els.confirmDeleteAll?.checked);
    syncConfirmPrimaryToggleUi();
    if (els.confirmChkNote) {
      (els.confirmChkNote as HTMLElement).style.display = "none";
      (els.confirmChkNote as HTMLElement).textContent = "";
    }
    if (els.confirmChkRow2) (els.confirmChkRow2 as HTMLElement).style.display = "none";
    if (els.confirmDangerInputRow) (els.confirmDangerInputRow as HTMLElement).style.display = "none";
    if (els.confirmDangerInputLabel) els.confirmDangerInputLabel.textContent = "";
    if (els.confirmDangerInput) {
      els.confirmDangerInput.value = "";
      els.confirmDangerInput.placeholder = "";
      els.confirmDangerInput.disabled = false;
    }
  }

  function setResetTaskConfirmBusy(busy: boolean, shouldLog: boolean) {
    if (els.confirmOkBtn) {
      els.confirmOkBtn.textContent = busy ? (shouldLog ? "Logging..." : "Resetting...") : shouldLog ? "Log and Reset" : "Reset";
      (els.confirmOkBtn as HTMLButtonElement).disabled = busy;
    }
    if (els.confirmCancelBtn) (els.confirmCancelBtn as HTMLButtonElement).disabled = busy;
    if (els.confirmDeleteAll) els.confirmDeleteAll.disabled = busy;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-disabled", busy);
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).classList.toggle("is-checked", !!els.confirmDeleteAll?.checked);
    syncConfirmPrimaryToggleUi();
  }

  function closeTopOverlayIfOpen() {
    const openOverlays = Array.from(document.querySelectorAll(".overlay")).filter((el) => {
      const node = el as HTMLElement;
      return getComputedStyle(node).display !== "none";
    }) as HTMLElement[];
    if (!openOverlays.length) return false;
    const top = openOverlays[openOverlays.length - 1];
    if (top.id === "editOverlay") {
      ctx.closeEdit(false);
      return true;
    }
    if (top.id === "elapsedPadOverlay") {
      ctx.closeElapsedPad(false);
      return true;
    }
    if (top.id === "confirmOverlay") {
      closeConfirm();
      return true;
    }
    if (top.id === "timeGoalCompleteOverlay") {
      return true;
    }
    if (top.id === "exportTaskOverlay") {
      ctx.closeTaskExportModal();
      return true;
    }
    if (top.id === "shareTaskModal") {
      ctx.closeShareTaskModal();
      return true;
    }
    closeOverlay(top);
    return true;
  }

  function registerConfirmOverlayEvents() {
    ctx.on(els.confirmCancelBtn, "click", closeConfirm);
    ctx.on(els.confirmDeleteAll, "change", syncConfirmPrimaryToggleUi);
    ctx.on(els.confirmDangerInput, "input", syncConfirmDangerInputUi);
    ctx.on(els.confirmAltBtn, "click", () => {
      const action = ctx.getConfirmActionAlt();
      if (typeof action === "function") action();
    });
    ctx.on(els.confirmOkBtn, "click", () => {
      const action = ctx.getConfirmAction();
      if (typeof action === "function") action();
      else closeConfirm();
    });
  }

  return {
    openOverlay,
    closeOverlay,
    confirm,
    closeConfirm,
    setResetTaskConfirmBusy,
    syncConfirmPrimaryToggleUi,
    closeTopOverlayIfOpen,
    registerConfirmOverlayEvents,
  };
}
