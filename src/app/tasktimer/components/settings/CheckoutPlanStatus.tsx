import type { SettingsAccountViewModel } from "./types";

export default function CheckoutPlanStatus({ account }: { account: SettingsAccountViewModel }) {
  if (account.checkoutPlanStatus !== "updating" && account.checkoutPlanStatus !== "pending") return null;
  return (
    <span role="status" aria-live="polite">
      {account.checkoutPlanStatus === "updating" ? "Updating plan..." : (
        <>Plan update pending. <button type="button" className="settingsAccountUpgradeLink" onClick={account.onRetryCheckoutPlan}>Retry</button></>
      )}
    </span>
  );
}
