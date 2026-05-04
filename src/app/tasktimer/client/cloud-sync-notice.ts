type CloudSyncNoticeDetail = {
  code?: string;
  message?: string;
  logId?: string;
  status?: number;
  retryable?: boolean;
};

type CloudSyncNoticeRuntimeOptions = {
  host: HTMLElement | null;
  on: (
    el: EventTarget | null | undefined,
    type: string,
    fn: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions
  ) => void;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeNoticeDetail(value: unknown): CloudSyncNoticeDetail {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  return {
    code: typeof source.code === "string" ? source.code : undefined,
    message: typeof source.message === "string" ? source.message : undefined,
    logId: typeof source.logId === "string" ? source.logId : undefined,
    status: typeof source.status === "number" ? source.status : undefined,
    retryable: typeof source.retryable === "boolean" ? source.retryable : undefined,
  };
}

export function renderCloudSyncNotice(host: HTMLElement | null, detail: CloudSyncNoticeDetail) {
  if (!host) return;
  const message =
    String(detail.message || "").trim()
    || "Account sync is temporarily limited. Your task was saved locally and will retry later.";
  const logId = String(detail.logId || "").trim();
  host.classList.add("isActive");
  host.innerHTML = `
    <div class="cloudSyncNotice" role="status">
      <p class="cloudSyncNoticeTitle">Account Sync Notice</p>
      <p class="cloudSyncNoticeText">${escapeHtml(message)}</p>
      ${logId ? `<p class="cloudSyncNoticeLogId">Log ID: <button class="cloudSyncNoticeLogIdValue" type="button" data-action="copyCloudSyncLogId" data-log-id="${escapeHtml(logId)}" aria-label="Copy Log ID" title="Copy Log ID">${escapeHtml(logId)}</button></p>` : ""}
      <div class="cloudSyncNoticeActions">
        <button class="btn btn-ghost small" type="button" data-action="dismissCloudSyncNotice">Dismiss</button>
      </div>
    </div>
  `;
}

export function dismissCloudSyncNotice(host: HTMLElement | null) {
  if (!host) return;
  host.classList.remove("isActive");
  host.innerHTML = "";
}

export function registerCloudSyncNoticeRuntime(options: CloudSyncNoticeRuntimeOptions) {
  const { host, on } = options;
  on(window, "tasktimer:cloud-sync-notice", (event) => {
    const detail = normalizeNoticeDetail((event as CustomEvent).detail);
    renderCloudSyncNotice(host, detail);
  });
  on(host, "click", (event) => {
    const target = event.target as HTMLElement | null;
    const actionButton = target?.closest?.("[data-action]") as HTMLElement | null;
    const action = String(actionButton?.dataset.action || "").trim();
    if (action === "dismissCloudSyncNotice") {
      dismissCloudSyncNotice(host);
      return;
    }
    if (action === "copyCloudSyncLogId") {
      if (!actionButton) return;
      const logId = String(actionButton.dataset.logId || "").trim();
      if (!logId || !navigator.clipboard?.writeText) return;
      void navigator.clipboard.writeText(logId).then(() => {
        actionButton.textContent = logId;
        actionButton.setAttribute("aria-label", "Copied Log ID");
        actionButton.setAttribute("title", "Copied Log ID");
      });
    }
  });
}
