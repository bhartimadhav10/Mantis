"use client";

import { useRef, useState } from "react";
import type { Material } from "@/lib/data";

const ICON: Record<Material["kind"], string> = {
  pdf: "📄",
  video: "🎬",
  link: "🔗",
  text: "📝",
};

export default function Materials({
  productId,
  initial,
}: {
  productId: string;
  initial: Material[];
}) {
  const [materials, setMaterials] = useState<Material[]>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  async function uploadPdf(file: File) {
    setError("");
    setNote("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/products/${productId}/pdf`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setMaterials((m) => [...m, data.material]);
      setNote(
        `Indexed “${data.material.title}” into MOSS (${data.chunks} passages). The assistant can now use it.`
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addVideo(opts: { file?: File; url?: string }) {
    setError("");
    setNote("");
    setBusy(true);
    try {
      const fd = new FormData();
      if (opts.file) fd.append("file", opts.file);
      if (opts.url) fd.append("url", opts.url);
      const res = await fetch(`/api/products/${productId}/video`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video processing failed");
      setMaterials((m) => [...m, data.material]);
      setNote(
        `Transcribed & indexed “${data.material.title}” into MOSS (${data.chunks} passages${
          data.hasTimestamps ? ", with timestamps" : ""
        }). The assistant can now point users to it.`
      );
      setVideoUrl("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (videoFileRef.current) videoFileRef.current.value = "";
    }
  }

  return (
    <section className="materials">
      <div className="materials-head">
        <h2 className="section-title">📚 Knowledge Repository</h2>
        <div className="mat-actions">
          <label className="btn-primary small-btn">
            {busy ? "Working…" : "＋ PDF manual"}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadPdf(f);
              }}
            />
          </label>
          <label className="btn-ghost small-btn">
            🎬 Upload video
            <input
              ref={videoFileRef}
              type="file"
              accept="video/*,audio/*"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) addVideo({ file: f });
              }}
            />
          </label>
        </div>
      </div>

      <form
        className="video-link-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (videoUrl.trim()) addVideo({ url: videoUrl.trim() });
        }}
      >
        <input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="…or paste a video link (YouTube / direct URL) to transcribe"
          disabled={busy}
        />
        <button className="btn-ghost" disabled={busy || !videoUrl.trim()}>
          Add link
        </button>
      </form>

      {note && <div className="ok-block">{note}</div>}
      {error && <div className="error-block">{error}</div>}

      {materials.length === 0 ? (
        <div className="empty">
          No support materials uploaded yet. Companies can add PDF manuals (and
          soon videos) — they&apos;re indexed into MOSS for the assistant and
          downloadable here.
        </div>
      ) : (
        <ul className="mat-list">
          {materials.map((m) => (
            <li className="mat" key={m.id}>
              <span className="mat-icon">{ICON[m.kind]}</span>
              <span className="mat-title">{m.title}</span>
              {m.url && (
                <a className="mat-link" href={m.url} target="_blank" rel="noreferrer">
                  {m.kind === "pdf" ? "Download" : "Open"} →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
