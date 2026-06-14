import json
from collections import defaultdict
from pathlib import Path

AUDIT = Path("d:/Tradescharge/backend/data/kite-audit/29d648fef2ad84510ae9e08a/2026-05-26/latest.json")
USER_NET = 4460.73


def fifo_gross(trs: list) -> float:
    trs = sorted(trs, key=lambda t: t["fill_timestamp"])
    lots: list[list[float]] = []
    gross = 0.0
    for t in trs:
        q = t.get("quantity") or t.get("filled", 0)
        p = t["average_price"]
        if t["transaction_type"] == "BUY":
            lots.append([p, q])
        else:
            rem = q
            while rem > 0 and lots:
                bp, bq = lots[0]
                m = min(rem, bq)
                gross += (p - bp) * m
                rem -= m
                bq -= m
                if bq <= 0:
                    lots.pop(0)
                else:
                    lots[0][1] = bq
    return round(gross, 2)


def main() -> None:
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    trades = audit["raw"]["trades"]
    enriched = audit["derived"]["enrichedClosed"]

    by: dict[str, list] = defaultdict(list)
    for t in trades:
        if t.get("exchange") not in ("NFO", "BFO"):
            continue
        k = f"{t['exchange']}:{t['tradingsymbol']}:{t['product']}"
        by[k].append(t)

    kite_by: dict[str, float] = {}
    for r in audit["raw"]["positions"]["day"]:
        if r.get("quantity", 0) == 0 and (
            r.get("day_buy_quantity") or r.get("day_sell_quantity")
        ):
            k = f"{r['exchange']}:{r['tradingsymbol']}:{r['product']}"
            kite_by[k] = r.get("pnl", 0)

    fifo_total = 0.0
    print("\n=== FIFO vs Kite pnl (diff > 1) ===\n")
    for k in sorted(by.keys()):
        fg = fifo_gross(by[k])
        kg = kite_by.get(k, 0)
        fifo_total += fg
        if abs(fg - kg) > 1:
            sym = k.split(":")[1]
            print(f"{sym[:28]:28} fifo={fg:>10} kite={kg:>10} diff={fg - kg:>10.2f}")

    app_gross = sum(p["pnl"]["gross"] for p in enriched)
    app_charges = sum(p["pnl"]["charges"]["total"] for p in enriched)
    app_net = sum(p["pnl"]["net"] for p in enriched)

    print("\n=== TOTALS ===")
    print(f"FIFO gross sum     {fifo_total:>12.2f}")
    print(f"Kite pnl sum       {sum(kite_by.values()):>12.2f}")
    print(f"App gross          {app_gross:>12.2f}")
    print(f"App charges        {app_charges:>12.2f}")
    print(f"App net            {app_net:>12.2f}")
    print(f"User Zerodha net   {USER_NET:>12.2f}")
    print(f"Implied CN gross   {USER_NET + app_charges:>12.2f}  (user net + app charges)")
    print(f"Wallet debit       {audit['raw']['margins']['utilised']['debits']:>12.2f}")
    print(f"Opening->live      {audit['raw']['margins']['available']['opening_balance'] - audit['raw']['margins']['available']['live_balance']:>12.2f}")


if __name__ == "__main__":
    main()
