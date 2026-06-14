import { useEffect, useRef, useState } from "react";
import {
  EXPIRY_QUICK_COUNT,
  formatExpiryLabel,
  formatExpiryShort,
  isWeeklyExpiry,
} from "../utils/expiry";

interface ExpiryPickerProps {
  expiries: string[];
  value: string;
  onChange: (expiry: string) => void;
}

export function ExpiryPicker({ expiries, value, onChange }: ExpiryPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const quickExpiries = expiries.slice(0, EXPIRY_QUICK_COUNT);
  const dropdownExpiries = expiries.slice(EXPIRY_QUICK_COUNT);
  const selectedInDropdown = dropdownExpiries.includes(value);
  const dropdownActive = selectedInDropdown;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (expiries.length === 0) {
    return null;
  }

  function selectExpiry(expiry: string) {
    onChange(expiry);
    setOpen(false);
  }

  function renderQuickLabel(expiry: string) {
    const dateLabel = formatExpiryShort(expiry);
    const weekly = isWeeklyExpiry(expiry, expiries);
    return (
      <>
        {dateLabel}
        {weekly && <sup className="expiry-weekly-mark">w</sup>}
      </>
    );
  }

  const dropdownTriggerLabel = dropdownActive
    ? formatExpiryShort(value)
    : dropdownExpiries[0]
      ? formatExpiryShort(dropdownExpiries[0])
      : "More";

  return (
    <div className="expiry-picker" ref={rootRef}>
      {quickExpiries.map((expiry) => (
        <button
          key={expiry}
          type="button"
          className={`expiry-chip ${value === expiry ? "active" : "plain"}`}
          onClick={() => selectExpiry(expiry)}
        >
          {renderQuickLabel(expiry)}
        </button>
      ))}

      {dropdownExpiries.length > 0 && (
        <div className={`expiry-dropdown ${open ? "open" : ""}`}>
          <button
            type="button"
            className={`expiry-chip dropdown-trigger ${dropdownActive ? "active" : ""}`}
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((prev) => !prev)}
          >
            <span>
              {dropdownTriggerLabel}
              {dropdownActive && isWeeklyExpiry(value, expiries) && (
                <sup className="expiry-weekly-mark">w</sup>
              )}
            </span>
            <span className="expiry-chevron" aria-hidden="true">
              ▾
            </span>
          </button>

          {open && (
            <ul className="expiry-dropdown-menu" role="listbox">
              {dropdownExpiries.map((expiry) => (
                <li key={expiry} role="option" aria-selected={value === expiry}>
                  <button
                    type="button"
                    className={value === expiry ? "selected" : undefined}
                    onClick={() => selectExpiry(expiry)}
                  >
                    {formatExpiryLabel(expiry)}
                    {isWeeklyExpiry(expiry, expiries) && (
                      <sup className="expiry-weekly-mark">w</sup>
                    )}
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
