import { useEffect, useMemo, useState } from "react";
import { fetchCrudeFutures } from "../api/client";
import type { MarketContextQuote } from "../types";
import {
  DEFAULT_CRUDE_QUOTE_KEY,
  normalizeCrudeInput,
  parseCrudeQuoteKey,
  setCrudeQuoteKey,
} from "../utils/crudeFuturePreference";
import { formatIndexPrice, formatMacroDayChange, pnlClass } from "../utils/format";

interface EditableCrudeMacroChipProps {
  quote: MarketContextQuote | undefined;
  crudeQuoteKey: string;
  kiteLoggedIn: boolean;
  onQuoteKeyChange: (quoteKey: string) => void;
}

export function EditableCrudeMacroChip({
  quote,
  crudeQuoteKey,
  kiteLoggedIn,
  onQuoteKeyChange,
}: EditableCrudeMacroChipProps) {
  const [editing, setEditing] = useState(false);
  const [futures, setFutures] = useState<
    { monthCode: string; label: string; quoteKey: string }[]
  >([]);
  const { tradingsymbol } = parseCrudeQuoteKey(crudeQuoteKey);
  const [symbolInput, setSymbolInput] = useState(tradingsymbol);

  useEffect(() => {
    setSymbolInput(parseCrudeQuoteKey(crudeQuoteKey).tradingsymbol);
  }, [crudeQuoteKey]);

  useEffect(() => {
    fetchCrudeFutures()
      .then(setFutures)
      .catch(() => setFutures([]));
  }, []);

  const presetOptions = useMemo(() => {
    if (futures.length > 0) {
      return futures;
    }
    return [
      { monthCode: "JUN", label: "Jun", quoteKey: "MCX:CRUDEOIL26JUNFUT" },
      { monthCode: "JUL", label: "Jul", quoteKey: "MCX:CRUDEOIL26JULFUT" },
      { monthCode: "AUG", label: "Aug", quoteKey: "MCX:CRUDEOIL26AUGFUT" },
      { monthCode: "SEP", label: "Sep", quoteKey: "MCX:CRUDEOIL26SEPFUT" },
    ];
  }, [futures]);

  function applyQuoteKey(quoteKey: string) {
    const normalized = normalizeCrudeInput(quoteKey);
    setCrudeQuoteKey(normalized);
    onQuoteKeyChange(normalized);
    setEditing(false);
    const { tradingsymbol: sym } = parseCrudeQuoteKey(normalized);
    setSymbolInput(sym);
  }

  function onSaveCustom() {
    applyQuoteKey(symbolInput.includes(":") ? symbolInput : `MCX:${symbolInput}`);
  }

  const displayLabel = quote?.label ?? "Crude FUT";

  return (
    <div className={`macro-quote-chip macro-quote-chip--editable ${editing ? "is-editing" : ""}`}>
      <div className="macro-quote-head">
        <span className="macro-quote-label" title={quote?.tradingsymbol ?? crudeQuoteKey}>
          {displayLabel}
        </span>
        <button
          type="button"
          className="macro-edit-btn"
          onClick={() => setEditing((v) => !v)}
          aria-label={editing ? "Close crude contract editor" : "Change crude contract"}
          title="Change contract (e.g. Jul / Aug FUT)"
        >
          {editing ? "✕" : "✎"}
        </button>
      </div>

      {editing ? (
        <div className="macro-crude-editor">
          <div className="macro-crude-presets">
            {presetOptions.map((opt) => (
              <button
                key={opt.monthCode ?? opt.quoteKey}
                type="button"
                className={`macro-preset-btn ${crudeQuoteKey === opt.quoteKey ? "active" : ""}`}
                onClick={() => applyQuoteKey(opt.quoteKey)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="macro-crude-custom">
            <input
              type="text"
              className="macro-crude-input"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              placeholder="CRUDEOIL26JULFUT"
              list="crude-fut-symbols"
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveCustom();
              }}
            />
            <datalist id="crude-fut-symbols">
              {presetOptions.map((opt) => (
                <option key={opt.quoteKey} value={parseCrudeQuoteKey(opt.quoteKey).tradingsymbol} />
              ))}
            </datalist>
            <button type="button" className="btn btn-sm" onClick={onSaveCustom}>
              Apply
            </button>
          </div>
          <p className="macro-crude-hint muted">
            MCX Crude Oil only (e.g. CRUDEOIL26JULFUT) · saved in this browser
          </p>
        </div>
      ) : quote ? (
        <>
          <span className="macro-quote-price">{formatIndexPrice(quote.lastPrice)}</span>
          <span className={`macro-quote-change ${pnlClass(quote.change)}`}>
            {formatMacroDayChange("CRUDE_JUN", quote.change)}
          </span>
        </>
      ) : (
        <span
          className="macro-quote-price muted"
          title={kiteLoggedIn ? "Awaiting MCX quote from Kite" : "Log in for MCX crude quote"}
        >
          {kiteLoggedIn ? "…" : "Login"}
        </span>
      )}
    </div>
  );
}

export { DEFAULT_CRUDE_QUOTE_KEY };
