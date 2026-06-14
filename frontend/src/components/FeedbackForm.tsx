import { useState } from "react";
import { submitFeedback } from "../utils/analytics";

interface FeedbackFormProps {
  kiteUserId?: string;
  onSubmitted?: () => void;
}

export function FeedbackForm({ kiteUserId, onSubmitted }: FeedbackFormProps) {
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | "">("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 3 || status === "sending") {
      return;
    }

    setStatus("sending");
    try {
      await submitFeedback({
        message: message.trim(),
        rating: rating === "" ? undefined : rating,
        contact: contact.trim() || undefined,
        kiteUserId,
      });
      setMessage("");
      setRating("");
      setContact("");
      setStatus("sent");
      onSubmitted?.();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="feedback-form" onSubmit={handleSubmit}>
      <h3>Feedback</h3>
      <p className="feedback-form-note">
        Help improve Tradescharge — bugs, feature ideas, or what you use most.
      </p>
      <label>
        Message
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What worked well? What should we improve?"
          rows={4}
          maxLength={2000}
          required
        />
      </label>
      <label>
        Rating (optional)
        <select
          value={rating === "" ? "" : String(rating)}
          onChange={(e) => setRating(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <option value="">—</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>
      </label>
      <label>
        Email (optional)
        <input
          type="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="If you want a reply"
          maxLength={120}
        />
      </label>
      <button type="submit" className="btn btn-secondary btn-sm" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Send feedback"}
      </button>
      {status === "sent" && <p className="feedback-form-success">Thanks — feedback received.</p>}
      {status === "error" && (
        <p className="feedback-form-error">Could not send. Try again later.</p>
      )}
    </form>
  );
}
