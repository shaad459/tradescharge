import { useEffect, useState } from "react";
import { formatIstDateTime } from "../utils/datetime";

export function IstClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="ist-clock">
      <span className="ist-clock-label">IST</span>
      <time dateTime={now.toISOString()}>{formatIstDateTime(now)}</time>
    </div>
  );
}
