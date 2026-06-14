"use client";

import { useRef, useState } from "react";

type Cause = { cause: string; confidence: number; status: string };
type Citation = { quote: string; location: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  action?: "ask" | "diagnose";
  citations?: Citation[];
};

const STARTERS: Record<string, string[]> = {
  "zephyr-e1": [
    "My scooter horn is not working.",
    "The headlight is dim at night.",
    "Battery drains overnight while parked.",
  ],
  "purewave-x": [
    "Water flow has become very slow.",
    "There's a solid red light on the front.",
    "The water tastes bad lately.",
  ],
};

export default function Chat({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [causes, setCauses] = useState<Cause[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollDown() {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || loading) return;
    setError("");
    const next: Msg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    setLoading(true);
    scrollDown();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          history: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.message,
          action: data.action,
          citations: data.citations,
        },
      ]);
      if (Array.isArray(data.causes)) setCauses(data.causes);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      scrollDown();
    }
  }

  const starters = STARTERS[productId] ?? [];

  return (
    <div className="layout">
      <div className="chat">
        <div className="messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty">
              👋 Describe a problem with your {productName} and I&apos;ll help you
              track it down. Try one of these:
              <div className="hint">
                {starters.map((s) => (
                  <button key={s} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`msg ${m.role} ${
                m.action === "diagnose" ? "diagnosis" : ""
              }`}
            >
              {m.action === "diagnose" && (
                <div className="diag-label">✓ PROBABLE DIAGNOSIS</div>
              )}
              {m.content}
              {m.citations && m.citations.length > 0 && (
                <div className="cites">
                  {m.citations.map((c, j) => (
                    <div className="cite" key={j}>
                      <b>{c.location}:</b> “{c.quote}”
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && <div className="msg assistant">Investigating…</div>}
        </div>

        {error && <div className="error">{error}</div>}

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the problem…"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            Send
          </button>
        </form>
      </div>

      <aside className="side">
        <h4>CANDIDATE CAUSES</h4>
        {causes.length === 0 && (
          <div className="empty">
            Hypotheses will appear here as the assistant investigates and rules
            causes in or out.
          </div>
        )}
        {causes
          .slice()
          .sort((a, b) => b.confidence - a.confidence)
          .map((c, i) => (
            <div key={i} className={`cause ${c.status}`}>
              <div className="row">
                <span className="name">{c.cause}</span>
                <span className={`tag ${c.status}`}>{c.status}</span>
              </div>
              <div className="bar">
                <span
                  style={{
                    width: `${Math.round(c.confidence * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
      </aside>
    </div>
  );
}
