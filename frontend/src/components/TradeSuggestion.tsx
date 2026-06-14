import type { TradeSuggestion as TradeSuggestionType } from "../types";

import { formatCurrency } from "../utils/format";

import { highlightSuggestionValues } from "../utils/highlightSuggestionValues";



interface TradeSuggestionProps {

  suggestion: TradeSuggestionType;

}



export function TradeSuggestion({ suggestion }: TradeSuggestionProps) {

  const metaText =

    suggestion.meta ??

    "Illustrative calculation from your positions and charge assumptions — not a trade recommendation.";



  return (

    <div

      className={`trade-suggestion calculator-output ${suggestion.type}`}

      aria-label="Breakeven calculator output"

    >

      <div className="suggestion-head">

        <span className="suggestion-label">{suggestion.label}</span>

        <strong className="suggestion-num suggestion-price">{formatCurrency(suggestion.price)}</strong>

      </div>

      <p>{highlightSuggestionValues(suggestion.reason)}</p>

      <p className="suggestion-meta">{highlightSuggestionValues(metaText)}</p>

    </div>

  );

}

