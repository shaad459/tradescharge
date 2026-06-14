import type { ChargeLineItem } from "../types";
import { formatCurrency } from "../utils/format";

interface ChargeBreakdownProps {
  entry: ChargeLineItem;
  exit: ChargeLineItem;
  total: number;
}

const rows: { key: keyof ChargeLineItem; label: string }[] = [
  { key: "brokerage", label: "Brokerage" },
  { key: "stampDuty", label: "Stamp Duty" },
  { key: "stt", label: "STT" },
  { key: "exchangeCharges", label: "Exchange Charges" },
  { key: "sebiCharges", label: "SEBI Fees" },
  { key: "gst", label: "GST (18%)" },
];

function ChargeTable({ title, charges }: { title: string; charges: ChargeLineItem }) {
  return (
    <div className="charge-section">
      <h3>{title}</h3>
      <table className="charge-table">
        <tbody>
          {rows.map(({ key, label }) => (
            <tr key={key}>
              <td>{label}</td>
              <td>{formatCurrency(charges[key])}</td>
            </tr>
          ))}
          <tr>
            <td><strong>Subtotal</strong></td>
            <td><strong>{formatCurrency(charges.total)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ChargeBreakdown({ entry, exit, total }: ChargeBreakdownProps) {
  return (
    <div>
      <ChargeTable title="Entry (Buy — paid)" charges={entry} />
      <ChargeTable title="Exit (Sell at LTP — estimated)" charges={exit} />
      <div className="charge-total">
        <span>Total Round-Trip Charges</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
