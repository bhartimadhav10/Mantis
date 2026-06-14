"use client";

import { useEffect, useRef, useState } from "react";

type Cause = { cause: string; confidence: number; status: string };
type Citation = { quote: string; location: string };
type Moss = { used: boolean; ms?: number; count?: number };
type Msg = {
  role: "user" | "assistant";
  content: string;
  action?: "ask" | "diagnose";
  citations?: Citation[];
  moss?: Moss;
  image?: string; // user-attached photo (data URL) for display
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

const LANGUAGES = [
  "Auto",
  "English",
  "Hindi",
  "Spanish",
  "French",
  "German",
  "Arabic",
  "Tamil",
];

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
  const [language, setLanguage] = useState("Auto");
  const [image, setImage] = useState<string>(""); // data URL
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null);

  function scrollDown() {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // ---- Voice input (Web Speech API) ----
  function toggleMic() {
    const SR =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition)) ||
      null;
    if (!SR) {
      setError("Voice input isn't supported in this browser (try Chrome).");
      return;
    }
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const r = new SR();
    r.lang = language === "Hindi" ? "hi-IN" : "en-US";
    r.interimResults = false;
    r.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " : "") + text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    r.start();
  }

  // ---- Speak assistant replies aloud ----
  function speakText(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(u);
  }
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis)
        window.speechSynthesis.cancel();
    };
  }, []);

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function send(text: string) {
    const clean = text.trim();
    if ((!clean && !image) || loading) return;
    setError("");
    const attached = image;
    const userMsg: Msg = {
      role: "user",
      content: clean || "(see attached photo)",
      image: attached || undefined,
    };
    const next: Msg[] = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setImage("");
    setLoading(true);
    scrollDown();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          language,
          image: attached || undefined,
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
          moss: data.moss,
        },
      ]);
      if (Array.isArray(data.causes)) setCauses(data.causes);
      if (speak && data.message) speakText(data.message);
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
        <div className="chat-toolbar">
          <label className="lang">
            🌍
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l === "Auto" ? "Auto-detect" : l}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`tbtn ${speak ? "on" : ""}`}
            onClick={() => setSpeak((s) => !s)}
            title="Read replies aloud"
          >
            {speak ? "🔊 Voice on" : "🔇 Voice off"}
          </button>
        </div>

        <div className="messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty">
              👋 Describe a problem with your {productName} and I&apos;ll help you
              track it down. You can also use 🎤 voice or 📷 a photo. Try:
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
              {m.role === "assistant" && m.moss?.used && (
                <div className="moss-badge">
                  🔎 Retrieved via MOSS · {m.moss.count} passages · {m.moss.ms}ms
                </div>
              )}
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="attached" className="msg-img" />
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

        {image && (
          <div className="attach-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="to send" />
            <span>Photo attached</span>
            <button onClick={() => setImage("")}>✕</button>
          </div>
        )}

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label className="icon-btn" title="Attach a photo">
            📷
            <input
              type="file"
              accept="image/*"
              onChange={onPickImage}
              hidden
            />
          </label>
          <button
            type="button"
            className={`icon-btn ${listening ? "rec" : ""}`}
            onClick={toggleMic}
            title="Speak"
          >
            {listening ? "⏺" : "🎤"}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening…" : "Describe the problem…"}
            disabled={loading}
          />
          <button type="submit" disabled={loading || (!input.trim() && !image)}>
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
                <span style={{ width: `${Math.round(c.confidence * 100)}%` }} />
              </div>
            </div>
          ))}
      </aside>
    </div>
  );
}
