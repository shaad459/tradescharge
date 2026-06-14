import { Sidebar } from "./Sidebar";
import { FeedbackForm } from "./FeedbackForm";
import type { AccountData } from "../types";
interface AccountDrawerProps {
  open: boolean;
  accountData: AccountData | null;
  kiteLoggedIn: boolean;
  kiteUserId?: string;
  logoutLoading?: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export function AccountDrawer({
  open,
  accountData,
  kiteLoggedIn,
  kiteUserId,
  logoutLoading = false,
  onClose,
  onLogout,
}: AccountDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="drawer-overlay" onClick={onClose} role="presentation">
      <aside
        className="drawer panel"
        onClick={(e) => e.stopPropagation()}
        aria-label="Account and transactions"
      >
        <div className="drawer-head">
          <h2>Menu</h2>
          <button type="button" className="btn btn-secondary btn-sm drawer-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <Sidebar
            accountData={accountData}
            embedded
            kiteLoggedIn={kiteLoggedIn}
            logoutLoading={logoutLoading}
            onLogout={onLogout}
          />
          <FeedbackForm kiteUserId={kiteUserId} />
        </div>
      </aside>
    </div>
  );
}
