"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Spec = { label: string; value: string };
type Link = { url: string; title: string };

export default function AddProductPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [emoji, setEmoji] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [manual, setManual] = useState("");
  const [specs, setSpecs] = useState<Spec[]>([{ label: "", value: "" }]);
  const [links, setLinks] = useState<Link[]>([{ url: "", title: "" }]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const pdfRef = useRef<HTMLInputElement>(null);

  function setSpec(i: number, key: keyof Spec, val: string) {
    setSpecs((p) => p.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)));
  }
  function setLink(i: number, key: keyof Link, val: string) {
    setLinks((p) => p.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleanLinks = links.filter((l) => l.url.trim());
    if (!name.trim()) {
      setError("Product name is required.");
      return;
    }
    if (!manual.trim() && !pdf && cleanLinks.length === 0) {
      setError(
        "Add at least one knowledge source: manual text, a PDF, or a link."
      );
      return;
    }
    setBusy(true);
    try {
      // 1) create the product
      setStatus("Creating product…");
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          emoji,
          image,
          description,
          manual,
          specs: specs.filter((s) => s.label.trim() && s.value.trim()),
        }),
      });
      const product = await res.json();
      if (!res.ok) throw new Error(product.error || "Failed to create product");
      const id = product.id;

      // 2) upload PDF (if any)
      if (pdf) {
        setStatus("Uploading & indexing PDF into MOSS…");
        const fd = new FormData();
        fd.append("file", pdf);
        const r = await fetch(`/api/products/${id}/pdf`, { method: "POST", body: fd });
        if (!r.ok) {
          const d = await r.json();
          throw new Error("PDF: " + (d.error || "upload failed"));
        }
      }

      // 3) add links (fetched + indexed server-side)
      for (const l of cleanLinks) {
        setStatus(`Adding link ${l.url}…`);
        await fetch(`/api/products/${id}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: l.url.trim(), title: l.title.trim() }),
        });
      }

      setStatus("Done! Opening product…");
      router.push(`/products/${id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <div className="form-wrap">
      <a href="/" className="back">
        ← All products
      </a>
      <h1 className="form-title">List a product</h1>
      <p className="form-sub">
        Add your product and its support materials — manual text, a PDF, and/or
        links. Everything is indexed into MOSS so the assistant can diagnose
        from it. (You can add videos on the product page after creating.)
      </p>

      <form onSubmit={submit} className="form">
        <div className="field-row">
          <label className="field">
            <span>Product name *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FrostMax F2 Refrigerator" />
          </label>
          <label className="field">
            <span>Category</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Home Appliances" />
          </label>
        </div>

        <div className="field-row">
          <label className="field small">
            <span>Emoji (icon fallback)</span>
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="📦" />
          </label>
          <label className="field">
            <span>Image URL (optional)</span>
            <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://… or /products/your.jpg" />
          </label>
        </div>

        <label className="field">
          <span>Short description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line about the product" />
        </label>

        <div className="field">
          <span>Key specs (optional)</span>
          {specs.map((s, i) => (
            <div className="field-row spec-row" key={i}>
              <input value={s.label} onChange={(e) => setSpec(i, "label", e.target.value)} placeholder="Label (e.g. Capacity)" />
              <input value={s.value} onChange={(e) => setSpec(i, "value", e.target.value)} placeholder="Value (e.g. 250 L)" />
            </div>
          ))}
          <button type="button" className="btn-ghost" onClick={() => setSpecs((p) => [...p, { label: "", value: "" }])}>
            ＋ Add spec
          </button>
        </div>

        <hr className="form-sep" />
        <h3 className="form-section">Knowledge sources</h3>
        <p className="form-hint-line">Add at least one of the following.</p>

        <label className="field">
          <span>Manual / support text</span>
          <textarea
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            rows={9}
            placeholder={"SECTION 1 - ...\nSymptoms and causes:\n- ...\n\nTROUBLESHOOTING\n- ..."}
          />
        </label>

        <div className="field">
          <span>PDF manual (optional)</span>
          <div className="pdf-pick">
            <label className="btn-ghost">
              📄 Choose PDF
              <input
                ref={pdfRef}
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
              />
            </label>
            <span className="muted-em">{pdf ? pdf.name : "No file chosen"}</span>
            {pdf && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setPdf(null);
                  if (pdfRef.current) pdfRef.current.value = "";
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <span>External links (web pages, docs, YouTube)</span>
          {links.map((l, i) => (
            <div className="field-row spec-row" key={i}>
              <input value={l.url} onChange={(e) => setLink(i, "url", e.target.value)} placeholder="https://…" />
              <input value={l.title} onChange={(e) => setLink(i, "title", e.target.value)} placeholder="Title (optional)" />
            </div>
          ))}
          <button type="button" className="btn-ghost" onClick={() => setLinks((p) => [...p, { url: "", title: "" }])}>
            ＋ Add link
          </button>
        </div>

        {error && <div className="error-block">{error}</div>}
        {busy && status && <div className="ok-block">{status}</div>}

        <div className="form-actions">
          <button className="btn-primary" disabled={busy} type="submit">
            {busy ? "Working…" : "Create product + assistant"}
          </button>
        </div>
      </form>
    </div>
  );
}
