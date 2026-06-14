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
  image?: string;
};
type LivePhase = "idle" | "listening" | "thinking" | "speaking";

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

const LANGUAGES = ["Auto", "English", "Hinglish", "Hindi", "Spanish", "French", "German", "Arabic", "Tamil"];

function localeFor(language: string): string {
  switch (language) {
    case "Hinglish": return "en-IN";
    case "Hindi": return "hi-IN";
    case "Spanish": return "es-ES";
    case "French": return "fr-FR";
    case "German": return "de-DE";
    case "Arabic": return "ar-SA";
    case "Tamil": return "ta-IN";
    default: return "en-US";
  }
}

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
  const [image, setImage] = useState<string>("");
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);

  // live talk
  const [liveMode, setLiveMode] = useState(false);
  const [livePhase, setLivePhase] = useState<LivePhase>("idle");
  const [liveCaption, setLiveCaption] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null); // manual single-shot mic
  const liveRecogRef = useRef<any>(null);
  const liveModeRef = useRef(false);
  const livePhaseRef = useRef<LivePhase>("idle");
  const transcriptRef = useRef("");
  const messagesRef = useRef<Msg[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function scrollDown() {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
  function setPhase(p: LivePhase) {
    livePhaseRef.current = p;
    setLivePhase(p);
  }

  // ---- Edge TTS playback (free neural voices) ----
  async function speakAsync(text: string): Promise<void> {
    // Clean markdown/symbols so the voice reads naturally.
    const clean = text.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, language }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      await new Promise<void>((resolve) => {
        const done = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.src = url;
        audio.play().catch(done);
      });
    } catch {
      /* ignore TTS errors */
    }
  }
  function stopAudio() {
    try {
      audioRef.current?.pause();
    } catch {}
  }

  // ---- shared pipeline: one user turn -> assistant reply text ----
  async function runTurn(text: string, attached: string): Promise<string> {
    setError("");
    const userMsg: Msg = {
      role: "user",
      content: text || "(see attached photo)",
      image: attached || undefined,
    };
    const next = [...messagesRef.current, userMsg];
    messagesRef.current = next;
    setMessages(next);
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
      const after: Msg[] = [
        ...next,
        {
          role: "assistant",
          content: data.message,
          action: data.action,
          citations: data.citations,
          moss: data.moss,
        },
      ];
      messagesRef.current = after;
      setMessages(after);
      if (Array.isArray(data.causes)) setCauses(data.causes);
      return data.message as string;
    } finally {
      setLoading(false);
      scrollDown();
    }
  }

  // ---- text chat send ----
  async function send(text: string) {
    const clean = text.trim();
    if ((!clean && !image) || loading) return;
    const attached = image;
    setInput("");
    setImage("");
    try {
      const reply = await runTurn(clean, attached);
      if (speak && reply) speakAsync(reply);
    } catch (e: any) {
      setError(e.message);
    }
  }

  // ---- manual single-shot mic (fills the text box) ----
  function toggleMic() {
    const SR =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) {
      setError("Voice input isn't supported in this browser (try Chrome/Edge).");
      return;
    }
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const r = new SR();
    r.lang = localeFor(language);
    r.interimResults = false;
    r.onresult = (e: any) => setInput((p) => (p ? p + " " : "") + e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    r.start();
  }

  // ---- LIVE TALK: speak, say "over", it answers aloud, mic reopens ----
  function beginListening() {
    const SR =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) return;

    // Kill any previous recognizer so two instances never run at once.
    if (liveRecogRef.current) {
      try { liveRecogRef.current.onend = null; } catch {}
      try { liveRecogRef.current.abort?.(); } catch {}
      liveRecogRef.current = null;
    }

    const r = new SR();
    r.lang = localeFor(language);
    r.continuous = true;
    r.interimResults = true;
    transcriptRef.current = "";
    setLiveCaption("");
    setPhase("listening");

    r.onresult = (e: any) => {
      if (livePhaseRef.current !== "listening" || liveRecogRef.current !== r) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const seg = e.results[i];
        if (seg.isFinal) transcriptRef.current += " " + seg[0].transcript;
        else interim += seg[0].transcript;
      }
      const combined = (transcriptRef.current + " " + interim).replace(/\s+/g, " ").trim();
      setLiveCaption(combined);
      // turn ends when the user says "over"
      if (/\bover\b[.!?]*\s*$/i.test(combined)) {
        const msg = combined.replace(/\bover\b[.!?]*\s*$/i, "").trim();
        setPhase("thinking"); // stops processing + blocks this instance's restart
        try { r.stop(); } catch {}
        if (msg) liveTurn(msg);
        else beginListening(); // only "over" heard -> fresh listen
      }
    };

    r.onend = () => {
      // Only THIS (current) instance may keep itself alive on silence.
      if (
        liveRecogRef.current === r &&
        liveModeRef.current &&
        livePhaseRef.current === "listening"
      ) {
        setTimeout(() => {
          if (
            liveRecogRef.current === r &&
            liveModeRef.current &&
            livePhaseRef.current === "listening"
          ) {
            try { r.start(); } catch {}
          }
        }, 200);
      }
    };

    r.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone permission denied — allow the mic and try again.");
        stopLive();
      }
      // other errors (no-speech / network / aborted): ignore; onend restarts.
    };

    liveRecogRef.current = r;
    try { r.start(); } catch {}
  }

  async function liveTurn(msg: string) {
    setPhase("thinking");
    try {
      const reply = await runTurn(msg, "");
      if (reply && liveModeRef.current) {
        setPhase("speaking");
        await speakAsync(reply); // mic is OFF here -> no echo, no self-trigger
      }
    } catch (e: any) {
      setError(e.message);
    }
    // ALWAYS loop back into listening while live mode is on.
    if (liveModeRef.current) beginListening();
    else setPhase("idle");
  }

  function startLive() {
    const SR =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) {
      setError("Live talk needs SpeechRecognition (use Chrome or Edge).");
      return;
    }
    // Prime an audio element inside this user gesture so the browser lets us
    // auto-play the spoken replies later (autoplay policy).
    if (!audioRef.current) audioRef.current = new Audio();
    try { audioRef.current.play().catch(() => {}); } catch {}

    liveModeRef.current = true;
    setLiveMode(true);
    beginListening();
  }

  function stopLive() {
    liveModeRef.current = false;
    setLiveMode(false);
    setPhase("idle");
    setLiveCaption("");
    transcriptRef.current = "";
    // abort() stops instantly without emitting a final result (cleaner than stop()).
    try { liveRecogRef.current?.abort?.(); } catch {}
    stopAudio();
  }

  useEffect(() => {
    return () => {
      liveModeRef.current = false;
      try { liveRecogRef.current?.stop(); } catch {}
      stopAudio();
    };
  }, []);

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  const starters = STARTERS[productId] ?? [];
  const liveStatus =
    livePhase === "thinking" ? "🤔 Thinking…" :
    livePhase === "speaking" ? "🔊 Speaking…" :
    "🎙️ Listening… say “over” when you’re done";

  return (
    <div className="layout">
      <div className="chat">
        <div className="chat-toolbar">
          <label className="lang">
            🌍
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l === "Auto" ? "Auto-detect" : l}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`tbtn ${speak ? "on" : ""}`}
            onClick={() => setSpeak((s) => !s)}
            title="Read replies aloud (Edge TTS)"
          >
            {speak ? "🔊 Voice on" : "🔇 Voice off"}
          </button>
          <button
            type="button"
            className={`tbtn ${liveMode ? "live-on" : ""}`}
            onClick={() => (liveMode ? stopLive() : startLive())}
            title="Hands-free live conversation"
          >
            {liveMode ? "■ End live talk" : "🎙️ Live talk"}
          </button>
          <button
            type="button"
            className={`tbtn ${language === "Hinglish" ? "on" : ""}`}
            onClick={() =>
              setLanguage((l) => (l === "Hinglish" ? "Auto" : "Hinglish"))
            }
            title="Reply in Hinglish (Hindi + English) with an Indian voice"
          >
            🇮🇳 {language === "Hinglish" ? "Hinglish on" : "Hinglish"}
          </button>
        </div>

        <div className="messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty">
              👋 Describe a problem with your {productName}. Type, use 🎤 voice, 📷 a
              photo, or go hands-free with 🎙️ <b>Live talk</b> (say “over” to hand
              off). Try:
              <div className="hint">
                {starters.map((s) => (
                  <button key={s} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role} ${m.action === "diagnose" ? "diagnosis" : ""}`}>
              {m.action === "diagnose" && <div className="diag-label">✓ PROBABLE DIAGNOSIS</div>}
              {m.role === "assistant" && m.moss?.used && (
                <div className="moss-badge">🔎 Retrieved via MOSS · {m.moss.count} passages · {m.moss.ms}ms</div>
              )}
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="attached" className="msg-img" />
              )}
              {m.content}
              {m.citations && m.citations.length > 0 && (
                <div className="cites">
                  {m.citations.map((c, j) => (
                    <div className="cite" key={j}><b>{c.location}:</b> “{c.quote}”</div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && <div className="msg assistant">Investigating…</div>}
        </div>

        {error && <div className="error">{error}</div>}

        {liveMode ? (
          <div className="live-panel">
            <div className={`live-orb ${livePhase}`} />
            <div className="live-status">{liveStatus}</div>
            {livePhase === "listening" && liveCaption && (
              <div className="live-caption">{liveCaption}</div>
            )}
            <button type="button" className="btn-primary" onClick={stopLive}>
              ■ End live talk
            </button>
          </div>
        ) : (
          <>
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
              onSubmit={(e) => { e.preventDefault(); send(input); }}
            >
              <label className="icon-btn" title="Attach a photo">
                📷
                <input type="file" accept="image/*" onChange={onPickImage} hidden />
              </label>
              <button
                type="button"
                className={`icon-btn ${listening ? "rec" : ""}`}
                onClick={toggleMic}
                title="Speak (single message)"
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
          </>
        )}
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
