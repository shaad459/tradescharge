import type { ReactNode } from "react";

/** Highlight ₹ amounts and lot counts in suggestion copy. */
const SUGGESTION_VALUE_PATTERN =
  /(?:[+\u2212-]?₹[\d,]+(?:\.\d+)?|₹[\-+]?[\d,]+(?:\.\d+)?|\b\d+\s+lots?\b)/gi;

export function highlightSuggestionValues(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(SUGGESTION_VALUE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }
    nodes.push(
      <strong key={`${start}-${match[0]}`} className="suggestion-num">
        {match[0]}
      </strong>,
    );
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}
