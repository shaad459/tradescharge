import { useEffect, useRef, useState } from "react";
import { searchKiteInstruments } from "../api/client";
import type { KiteInstrumentSearchHit } from "../types";

export interface SelectedInstrument {
  exchange: string;
  tradingsymbol: string;
  label: string;
  instrumentToken: number;
}

interface InstrumentSearchBarProps {
  disabled?: boolean;
  selected: SelectedInstrument | null;
  onSelect: (instrument: SelectedInstrument) => void;
  onClear: () => void;
}

export function InstrumentSearchBar({
  disabled,
  selected,
  onSelect,
  onClear,
}: InstrumentSearchBarProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<KiteInstrumentSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchKiteInstruments(q)
        .then(setHits)
        .catch(() => setHits([]));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function pick(hit: KiteInstrumentSearchHit) {
    onSelect({
      exchange: hit.exchange,
      tradingsymbol: hit.tradingsymbol,
      label: hit.name ? `${hit.tradingsymbol} · ${hit.name}` : hit.tradingsymbol,
      instrumentToken: hit.instrumentToken,
    });
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="instrument-search-bar" ref={rootRef}>
      <input
        type="search"
        className="instrument-search-input"
        placeholder="Search any Kite instrument (e.g. RELIANCE, INFY, GOLDPETAL)…"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-label="Search Kite instruments"
      />
      {selected && (
        <button type="button" className="btn btn-sm" onClick={onClear} disabled={disabled}>
          Clear instrument
        </button>
      )}
      {open && hits.length > 0 && (
        <ul className="instrument-search-dropdown">
          {hits.map((hit) => (
            <li key={`${hit.exchange}:${hit.tradingsymbol}`}>
              <button type="button" onClick={() => pick(hit)}>
                <span className="instrument-search-sym">{hit.tradingsymbol}</span>
                <span className="muted">{hit.exchange}</span>
                {hit.name && <span className="instrument-search-name">{hit.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
