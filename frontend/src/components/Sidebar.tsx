import { useMemo, useState } from "react";
import type { AccountData } from "../types";
import { formatCurrency, pnlClass } from "../utils/format";
import { formatIstDateTime } from "../utils/datetime";

interface SidebarProps {
  accountData: AccountData | null;
  embedded?: boolean;
  kiteLoggedIn?: boolean;
  logoutLoading?: boolean;
  onLogout?: () => void;
}

type SidebarTab = "account" | "transactions";

export function Sidebar({
  accountData,
  embedded = false,
  kiteLoggedIn = false,
  logoutLoading = false,
  onLogout,
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>("account");

  const transactions = accountData?.transactions ?? [];
  const txnTotals = useMemo(() => {
    let grossTurnover = 0;
    let totalCharges = 0;
    let netCashflow = 0;
    for (const txn of transactions) {
      grossTurnover += txn.price * txn.quantity;
      totalCharges += txn.charges;
      netCashflow += txn.netAmount;
    }
    return { grossTurnover, totalCharges, netCashflow };
  }, [transactions]);

  const logoutFooter =
    kiteLoggedIn && onLogout ? (
      <div className="sidebar-footer">
        <button
          type="button"
          className="btn sidebar-logout-btn"
          onClick={onLogout}
          disabled={logoutLoading}
        >
          {logoutLoading ? "Logging out…" : "Logout from Kite"}
        </button>
      </div>
    ) : null;

  if (!accountData) {
    return (
      <aside className={`sidebar ${embedded ? "sidebar-embedded" : "panel"}`}>
        <div className="sidebar-loading">Loading account…</div>
        {logoutFooter}
      </aside>
    );
  }

  const { account, balance, availableMargin, utilisedMargin, mode } = accountData;

  return (
    <aside className={`sidebar ${embedded ? "sidebar-embedded" : "panel"}`}>
      <div className="sidebar-tabs">
        <button
          type="button"
          className={`sidebar-tab ${tab === "account" ? "active" : ""}`}
          onClick={() => setTab("account")}
        >
          Account
        </button>
        <button
          type="button"
          className={`sidebar-tab ${tab === "transactions" ? "active" : ""}`}
          onClick={() => setTab("transactions")}
        >
          Transactions
        </button>
      </div>

      {tab === "account" ? (
        <div className="sidebar-content">
          <div className="account-profile">
            <div className="account-avatar">{account.userName.charAt(0)}</div>
            <div>
              <strong>{account.userName}</strong>
              <p>{account.broker}</p>
            </div>
          </div>

          <dl className="account-details">
            <div>
              <dt>Client ID</dt>
              <dd>{account.clientId}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{account.email}</dd>
            </div>
            <div>
              <dt>Segment</dt>
              <dd>{account.segment}</dd>
            </div>
            <div>
              <dt>PAN</dt>
              <dd>{account.pan}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>
                <span className={`badge ${mode}`}>{mode}</span>
              </dd>
            </div>
          </dl>

          <div className="account-balances">
            <div className="account-balance-row">
              <span>Balance</span>
              <strong>{formatCurrency(balance)}</strong>
            </div>
            <div className="account-balance-row">
              <span>Available margin</span>
              <strong>{formatCurrency(availableMargin)}</strong>
            </div>
            <div className="account-balance-row">
              <span>Utilised margin</span>
              <strong>{formatCurrency(utilisedMargin)}</strong>
            </div>
          </div>
        </div>
      ) : (
        <div className="sidebar-content transactions-list">
          <div className="transactions-summary">
            <div className="transactions-summary-metric">
              <span>Gross turnover</span>
              <strong>{formatCurrency(txnTotals.grossTurnover)}</strong>
            </div>
            <div className="transactions-summary-metric">
              <span>Total charges</span>
              <strong>{formatCurrency(txnTotals.totalCharges)}</strong>
            </div>
            <div className="transactions-summary-metric">
              <span>Net cashflow</span>
              <strong className={pnlClass(txnTotals.netCashflow)}>
                {formatCurrency(txnTotals.netCashflow)}
              </strong>
            </div>
          </div>
          {transactions.map((txn) => (
            <article key={txn.id} className="transaction-item">
              <div className="transaction-head">
                <span className={`txn-type ${txn.type.toLowerCase()}`}>{txn.type}</span>
                <time>{formatIstDateTime(txn.timestamp)}</time>
              </div>
              <div className="transaction-symbol">{txn.symbol}</div>
              <div className="transaction-meta">
                <span>
                  {txn.quantity} qty @ {formatCurrency(txn.price)}
                </span>
                <span>Gross {formatCurrency(txn.price * txn.quantity)}</span>
                <span>Charges {formatCurrency(txn.charges)}</span>
              </div>
              <div className={`transaction-net ${pnlClass(txn.netAmount)}`}>
                Net {formatCurrency(txn.netAmount)}
              </div>
            </article>
          ))}
        </div>
      )}

      {logoutFooter}
    </aside>
  );
}
