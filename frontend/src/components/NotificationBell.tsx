import { useEffect, useRef, useState } from "react";
import type { ExecutionAlert } from "../types";
import { formatIstTime } from "../utils/datetime";

interface NotificationBellProps {
  notifications: ExecutionAlert[];
  onSelect: (alert: ExecutionAlert) => void;
  onDismissAll: () => void;
}

export function NotificationBell({ notifications, onSelect, onDismissAll }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="notification-bell-wrap" ref={rootRef}>
      <button
        type="button"
        className="icon-btn notification-bell-btn"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          className="notification-bell-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-head">
            <strong>Trade alerts</strong>
            {unreadCount > 0 && (
              <button type="button" className="notification-clear-btn" onClick={onDismissAll}>
                Clear all
              </button>
            )}
          </div>
          {unreadCount === 0 ? (
            <p className="notification-empty">No new SL or target executions.</p>
          ) : (
            <ul className="notification-list">
              {notifications.map((alert) => (
                <li key={alert.id}>
                  <button
                    type="button"
                    className="notification-item"
                    onClick={() => {
                      onSelect(alert);
                      setOpen(false);
                    }}
                  >
                    <span className={`notification-tag tag-${alert.orderTag.toLowerCase()}`}>
                      {alert.orderTag}
                    </span>
                    <span className="notification-message">{alert.message}</span>
                    <span className="notification-time">{formatIstTime(alert.timestamp)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
